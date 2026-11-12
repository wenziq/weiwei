import json
import logging
import math
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
import re

from .http import fetch_bytes, fetch_json
from .eastmoney import EastMoneyProvider
from .parsing import aggregate_candles, parse_candles

logger = logging.getLogger(__name__)


class BoardTable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None
        self.code = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row, self.code = [], None
        elif tag == "td" and self.row is not None:
            self.cell = []
        elif tag == "a" and self.row is not None:
            match = re.search(r"/thshy/detail/code/(\d+)/", dict(attrs).get("href", ""))
            if match:
                self.code = match.group(1)

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.code and len(self.row) >= 12:
                self.rows.append((self.code, self.row))
            self.row = None


class SectorProvider:
    def __init__(self, market_store=None):
        self.market_store = market_store
        self.sw_aliases = {}
        self.cache = []
        self.loaded_at = 0
        self.candle_cache = {}

    @staticmethod
    def sina_sectors(url, kind):
        text = fetch_bytes(url, timeout=15, retries=1).decode("gb18030")
        payload = json.loads(text[text.index("{"):text.rindex("}") + 1])
        sectors = []
        for code, raw in payload.items():
            values = raw.split(",")
            if len(values) < 13:
                continue
            sectors.append({
                "id": f"sector-sina.{code}", "name": values[1], "type": kind,
                "changePct": float(values[5]), "amount": float(values[7]) / 1e8,
                "deltaPct": None, "up": None, "down": None, "leader": values[12],
                "leaderChangePct": float(values[9]), "flow": None, "etf": "", "spark": [],
                "dataSource": "新浪财经", "dataStatus": "snapshot", "quoteTime": None,
            })
        return sectors

    @staticmethod
    def ths_industries():
        sectors = {}
        for page in range(1, 6):
            url = "https://q.10jqka.com.cn/thshy/" if page == 1 else f"https://q.10jqka.com.cn/thshy/index/field/zdf/order/desc/page/{page}/"
            try:
                parser = BoardTable()
                parser.feed(fetch_bytes(url, timeout=15, retries=0).decode("gb18030", "replace"))
            except OSError as error:
                logger.info("同花顺行业第 %d 页不可用，保留已取得的真实板块: %s", page, error)
                break
            if not parser.rows:
                break
            for code, row in parser.rows:
                sectors[row[1]] = {
                    "id": f"sector-ths.{code}", "name": row[1], "type": "行业",
                    "changePct": float(row[2]), "amount": float(row[4]), "flow": float(row[5]),
                    "up": int(row[6]), "down": int(row[7]), "leader": row[9],
                    "leaderChangePct": float(row[11]), "deltaPct": None, "etf": "", "spark": [],
                    "dataSource": "同花顺", "dataStatus": "snapshot", "quoteTime": None,
                }
        return sectors

    def sectors(self):
        if self.cache and time.time() - self.loaded_at < 30:
            return self.cache
        sw_industries = self.sina_sectors("https://vip.stock.finance.sina.com.cn/q/view/SwHy.php", "行业")
        self.sw_aliases = {item["name"]: item["id"] for item in sw_industries}
        concepts = self.sina_sectors("https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php?param=class", "概念")
        sectors = [*sw_industries, *concepts]
        try:
            detailed = self.ths_industries()
            if detailed:
                existing = {item["name"] for item in detailed.values()}
                sectors = [*detailed.values(), *(item for item in sw_industries if item["name"] not in existing), *concepts]
        except (OSError, ValueError) as error:
            logger.warning("同花顺板块快照不可用，使用新浪真实快照: %s", error)
        try:
            existing = {item["name"] for item in sectors}
            sectors.extend(item for kind in ["行业", "概念"] for item in self.eastmoney_boards(kind) if item["name"] not in existing)
        except (OSError, ValueError, RuntimeError) as error:
            logger.warning("东方财富板块目录补充暂不可用: %s", error)
        if not sectors:
            raise ValueError("板块行情为空")
        self.cache = sectors
        self.loaded_at = time.time()
        return sectors

    @staticmethod
    def ths_payload(url):
        text = fetch_bytes(url, timeout=15, retries=1).decode("utf-8")
        return json.loads(text[text.index("(") + 1:text.rindex(")")])

    def candles(self, instrument_id, period="day", limit=500, start=None, end=None, adjustment="none"):
        if adjustment != "none":
            raise ValueError("板块当前提供不复权K线")
        if period not in {"day", "week", "month"}:
            raise ValueError("该板块数据源当前提供日、周、月K线")
        if not instrument_id.startswith("sector-ths."):
            raise ValueError("该概念板块暂未取得历史序列，快照仍为真实行情")
        key = (instrument_id, period, limit, start, end)
        if self.candle_cache.get(key, (0, None))[0] > time.time() - 60:
            return self.candle_cache[key][1]
        code = instrument_id.removeprefix("sector-ths.")
        latest = self.ths_payload(f"https://d.10jqka.com.cn/v4/line/bk_{code}/01/last.js")
        rows = latest.get("data", "").split(";")
        years = sorted(int(year) for year in latest.get("year", {}))
        needed = max(0, math.ceil(limit * {"day": 1, "week": 5, "month": 12}[period] / 220))
        selected = years[-needed:] if needed else []
        if start:
            selected = [year for year in years if year >= datetime.fromtimestamp(start, timezone.utc).year]
        current_year = datetime.now(timezone.utc).year
        for year in selected:
            if year == current_year and not start:
                continue
            try:
                payload = self.ths_payload(f"https://d.10jqka.com.cn/v4/line/bk_{code}/01/{year}.js")
                rows.extend(payload.get("data", "").split(";"))
            except (OSError, ValueError) as error:
                logger.warning("板块历史年份读取失败 %s %d: %s", code, year, error)
        parsed = []
        for row in rows:
            values = row.split(",")
            if len(values) < 7 or len(values[0]) != 8:
                continue
            date = f"{values[0][:4]}-{values[0][4:6]}-{values[0][6:8]}"
            parsed.append([date, values[1], values[4], values[2], values[3], values[5], values[6]])
        candles = aggregate_candles(parse_candles(parsed, "CN", "同花顺板块"), period) if period != "day" else parse_candles(parsed, "CN", "同花顺板块")
        candles = [item for item in candles if (not start or item["time"] >= start) and (not end or item["time"] <= end)]
        if not candles:
            raise ValueError(f"板块 {code} 没有历史K线")
        candles = candles[-limit:]
        self.candle_cache[key] = (time.time(), candles)
        return candles

    def known_sectors(self):
        return self.cache

    @staticmethod
    def eastmoney_all(url):
        payload = EastMoneyProvider.fetch(f"{url}&pn=1&pz=100")
        rows = list((payload.get("data") or {}).get("diff") or [])
        expected = int((payload.get("data") or {}).get("total") or 0)
        for page in range(2, math.ceil(expected / 100) + 1):
            payload = EastMoneyProvider.fetch(f"{url}&pn={page}&pz=100")
            rows.extend((payload.get("data") or {}).get("diff") or [])
        if expected and len(rows) != expected:
            raise RuntimeError(f"东方财富板块分页不完整: {len(rows)} / {expected}")
        return rows

    @staticmethod
    def eastmoney_boards(kind):
        category = 2 if kind == "行业" else 3
        fields = "f12,f14,f2,f3,f6,f104,f105,f128,f136"
        rows = SectorProvider.eastmoney_all(f"https://push2.eastmoney.com/api/qt/clist/get?po=1&np=1&fltt=2&invt=2&fid=f12&fs=m:90+t:{category}+f:!50&fields={fields}")
        def number(value):
            return None if value in {None, "", "-"} else float(value)
        return [{
            "id": f"sector-em.{row['f12']}", "name": row["f14"], "type": kind,
            "changePct": number(row.get("f3")), "amount": number(row.get("f6")) / 1e8 if number(row.get("f6")) is not None else None,
            "deltaPct": None, "up": row.get("f104"), "down": row.get("f105"),
            "leader": row.get("f128") or "", "leaderChangePct": number(row.get("f136")), "flow": None,
            "etf": "", "spark": [], "dataSource": "东方财富", "dataStatus": "snapshot" if row.get("f3") is not None else "unavailable", "quoteTime": None,
        } for row in rows]

    @staticmethod
    def stock_id(code):
        market = "bj" if code.startswith(("4", "8", "920")) else "sh" if code.startswith(("6", "9")) else "sz"
        return f"{market}-{code}"

    def members(self, sector_id):
        if sector_id.startswith("sector-sina."):
            node = sector_id.removeprefix("sector-sina.")
            expected = int(fetch_json(f"https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node={node}", timeout=15, retries=1))
            ids = set()
            for page in range(1, math.ceil(expected / 100) + 1):
                rows = fetch_json(f"https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page={page}&num=100&sort=symbol&asc=1&node={node}&symbol=&_s_r_a=page", timeout=15, retries=1)
                ids.update(self.stock_id(row["code"]) for row in rows)
            if len(ids) < expected * 0.95:
                raise ValueError(f"新浪板块成分不完整: {len(ids)} / {expected}")
            return ids
        if sector_id.startswith("sector-em."):
            code = sector_id.removeprefix("sector-em.")
            rows = self.eastmoney_all(f"https://push2.eastmoney.com/api/qt/clist/get?po=1&np=1&fltt=2&invt=2&fid=f12&fs=b:{code}&fields=f12")
            if not rows:
                raise ValueError(f"东方财富板块 {code} 没有返回成分股")
            return {self.stock_id(row["f12"]) for row in rows}
        if sector_id.startswith("sector-ths."):
            code = sector_id.removeprefix("sector-ths.")
            try:
                first = fetch_bytes(f"https://q.10jqka.com.cn/thshy/detail/code/{code}/", timeout=15, retries=1).decode("gb18030", "replace")
                page_info = re.search(r'class="page_info"[^>]*>\s*\d+\s*/\s*(\d+)', first)
                pages = int(page_info.group(1)) if page_info else max([int(value) for value in re.findall(r"page/(\d+)", first)] or [1])
                ids = set(re.findall(r"stockpage\.10jqka\.com\.cn/(\d{6})", first))
                for page in range(2, pages + 1):
                    text = fetch_bytes(f"https://q.10jqka.com.cn/thshy/detail/field/199112/order/desc/page/{page}/ajax/1/code/{code}/", timeout=15, retries=1).decode("gb18030", "replace")
                    ids.update(re.findall(r"stockpage\.10jqka\.com\.cn/(\d{6})", text))
                if not ids:
                    raise ValueError(f"同花顺行业 {code} 没有返回成分股")
                return {self.stock_id(code) for code in ids}
            except (OSError, ValueError, RuntimeError) as error:
                sector = next((item for item in self.cache if item["id"] == sector_id), None)
                alias = self.sw_aliases.get(sector["name"]) if sector else None
                if alias:
                    logger.info("同花顺分页不可用，使用新浪申万同名行业成分: %s", sector["name"])
                    return self.members(alias)
                if self.market_store is None:
                    raise
                if not sector:
                    raise error
                ids = {item["id"] for item in self.market_store.instruments() if item["market"] in {"SH", "SZ", "BJ"} and (sector["name"] in (item.get("industry") or "") or sector["name"] == (item.get("industry") or "").rstrip("ⅡⅢ"))}
                if not ids:
                    raise ValueError(f"{sector['name']} 尚未取得真实行业分类") from error
                logger.info("同花顺分页不可用，使用东方财富真实行业分类: %s", sector["name"])
                return ids
        raise ValueError("未知的板块数据来源")
