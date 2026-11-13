import json
import logging
import math
import threading
import time
from html.parser import HTMLParser
import re
from urllib.error import HTTPError

from .http import fetch_bytes, fetch_json
from .eastmoney import EastMoneyProvider
from .parsing import aggregate_candles, parse_candles
from .ths_session import USER_AGENT as THS_USER_AGENT, create_token

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


class ConceptDirectory(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sectors = {}
        self.quotes = {}
        self.code = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "a":
            match = re.search(r"/gn/detail/code/(\d+)/", attributes.get("href", ""))
            self.code = match.group(1) if match else None
        elif tag == "input" and attributes.get("id") == "gnSection":
            rows = json.loads(attributes.get("value", "{}")).values()
            self.quotes = {row["cid"]: row for row in rows}

    def handle_data(self, data):
        if self.code and data.strip():
            self.sectors[self.code] = data.strip()

    def handle_endtag(self, tag):
        if tag == "a":
            self.code = None


class SectorProvider:
    def __init__(self, market_store=None):
        self.market_store = market_store
        self.sw_aliases = {}
        self.sina_aliases = {}
        self.concept_index_codes = {}
        self.cache = []
        self.loaded_at = 0
        self.candle_cache = {}
        self.ths_lock = threading.Lock()
        self.ths_cookie = None
        self.ths_cookie_at = 0

    def ths_token(self, refresh=False):
        with self.ths_lock:
            if refresh or not self.ths_cookie or time.time() - self.ths_cookie_at > 3600:
                self.ths_cookie = create_token()
                self.ths_cookie_at = time.time()
            return self.ths_cookie

    def ths_bytes(self, url, timeout=15, retries=1):
        headers = {"User-Agent": THS_USER_AGENT, "Referer": "https://q.10jqka.com.cn/", "Cookie": f"v={self.ths_token()}"}
        try:
            return fetch_bytes(url, timeout=timeout, retries=retries, headers=headers)
        except HTTPError as error:
            if error.code not in {401, 403}:
                raise
            headers["Cookie"] = f"v={self.ths_token(refresh=True)}"
            return fetch_bytes(url, timeout=timeout, retries=retries, headers=headers)

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

    def ths_industries(self):
        sectors = {}
        for page in range(1, 6):
            url = "https://q.10jqka.com.cn/thshy/" if page == 1 else f"https://q.10jqka.com.cn/thshy/index/field/zdf/order/desc/page/{page}/"
            try:
                parser = BoardTable()
                parser.feed(self.ths_bytes(url, retries=0).decode("gb18030", "replace"))
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

    def ths_concepts(self):
        text = self.ths_bytes("https://q.10jqka.com.cn/gn/").decode("gb18030", "replace")
        parser = ConceptDirectory()
        parser.feed(text)
        if len(parser.sectors) < len(parser.quotes):
            raise ValueError(f"同花顺概念目录不完整: {len(parser.sectors)} / {len(parser.quotes)}")
        self.concept_index_codes.update({code: row["platecode"] for code, row in parser.quotes.items()})
        sectors = {}
        for code in parser.sectors.keys() | parser.quotes.keys():
            quote = parser.quotes.get(code, {})
            name = parser.sectors.get(code) or quote["platename"]
            change_pct, flow = quote.get("199112"), quote.get("zjjlr")
            sectors[name] = {
                "id": f"sector-ths-concept.{code}", "name": name, "type": "概念",
                "changePct": float(change_pct) if change_pct is not None else None,
                "amount": None, "deltaPct": None, "up": None, "down": None,
                "leader": "", "leaderChangePct": None,
                "flow": float(flow) if flow is not None else None, "etf": "", "spark": [],
                "dataSource": "同花顺", "dataStatus": "snapshot" if quote else "unavailable", "quoteTime": None,
            }
        return sectors

    def ths_concept_index(self, code):
        if code not in self.concept_index_codes:
            text = self.ths_bytes(f"https://q.10jqka.com.cn/gn/detail/code/{code}/").decode("gb18030", "replace")
            match = re.search(r'id="clid" value=[\'"](\d+)[\'"]', text)
            if not match:
                raise ValueError(f"同花顺概念 {code} 没有取得指数代码")
            self.concept_index_codes[code] = match.group(1)
        return self.concept_index_codes[code]

    def sectors(self):
        if self.cache and time.time() - self.loaded_at < 30:
            return self.cache
        sw_industries = self.sina_sectors("https://vip.stock.finance.sina.com.cn/q/view/SwHy.php", "行业")
        self.sw_aliases = {item["name"]: item["id"] for item in sw_industries}
        concepts = self.sina_sectors("https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php?param=class", "概念")
        sectors = [*sw_industries, *concepts]
        self.sina_aliases = {item["name"]: item["id"] for item in sectors}
        try:
            detailed = self.ths_industries()
            if detailed:
                existing = {item["name"] for item in detailed.values()}
                sectors = [*detailed.values(), *(item for item in sw_industries if item["name"] not in existing), *concepts]
        except (OSError, ValueError) as error:
            logger.warning("同花顺行业快照不可用，使用新浪真实快照: %s", error)
        try:
            detailed = self.ths_concepts()
            if detailed:
                existing = {item["name"] for item in detailed.values()}
                sectors = [*(item for item in sectors if item["type"] == "行业"), *detailed.values(), *(item for item in concepts if item["name"] not in existing)]
        except (OSError, ValueError) as error:
            logger.warning("同花顺概念目录不可用，使用新浪概念快照: %s", error)
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
        if not instrument_id.startswith(("sector-ths.", "sector-ths-concept.")):
            return self.derived_candles(instrument_id, period, limit, start, end)
        key = (instrument_id, period, limit, start, end)
        if self.candle_cache.get(key, (0, None))[0] > time.time() - 60:
            return self.candle_cache[key][1]
        code = self.ths_concept_index(instrument_id.removeprefix("sector-ths-concept.")) if instrument_id.startswith("sector-ths-concept.") else instrument_id.removeprefix("sector-ths.")
        payload = self.ths_payload(f"https://d.10jqka.com.cn/v4/line/bk_{code}/01/all.js")
        prices = [int(value) for value in payload["price"].split(",")]
        volumes = payload["volumn"].split(",")
        dates = payload["dates"].split(",")
        years = [year for year, count in payload["sortYear"] for _ in range(count)]
        factor = float(payload["priceFactor"])
        if not dates or len(prices) != len(dates) * 4 or len(volumes) != len(dates) or len(years) != len(dates) or len(dates) != int(payload["total"]):
            raise ValueError(f"同花顺板块 {code} 的完整K线字段长度不一致")
        rows = []
        for index, date in enumerate(dates):
            low, open_delta, high_delta, close_delta = prices[index * 4:index * 4 + 4]
            open_price, close_price = (low + open_delta) / factor, (low + close_delta) / factor
            high_price, low_price = (low + high_delta) / factor, low / factor
            corrected_high = max(open_price, close_price, high_price, low_price)
            corrected_low = min(open_price, close_price, high_price, low_price)
            if (corrected_high - high_price) / close_price >= 0.001 or (low_price - corrected_low) / close_price >= 0.001:
                raise ValueError(f"同花顺板块 {code} 存在超出精度范围的OHLC异常: {years[index]}-{date}")
            rows.append([
                f"{years[index]}-{date[:2]}-{date[2:]}", open_price, close_price,
                corrected_high, corrected_low, volumes[index],
            ])
        candles = parse_candles(rows, "CN", "同花顺板块")
        if len(candles) != len(dates):
            raise ValueError(f"同花顺板块 {code} 存在无效K线")
        candles = aggregate_candles(candles, period) if period != "day" else candles
        candles = [item for item in candles if (not start or item["time"] >= start) and (not end or item["time"] <= end)]
        if not candles:
            raise ValueError(f"板块 {code} 没有历史K线")
        candles = candles[-limit:] if limit is not None else candles
        self.candle_cache[key] = (time.time(), candles)
        return candles

    def derived_candles(self, instrument_id, period, limit, start, end):
        if not self.cache:
            self.sectors()
        sector = next((item for item in self.cache if item["id"] == instrument_id), None)
        if not sector:
            raise KeyError(instrument_id)
        if self.market_store is None:
            raise ValueError("本机历史库未连接")
        name = sector["name"]
        member_ids = self.market_store.sector_members([name]).get(name, set())
        if not member_ids:
            member_ids = self.members(instrument_id)
            if member_ids:
                self.market_store.save_sector_members(name, sorted(member_ids))
        if not member_ids:
            raise ValueError(f"{name} 暂无可用于历史回溯的真实成分股")
        level = 1000.0
        candles = []
        for row in self.market_store.sector_candle_ratios(name):
            open_price = level * row["open_ratio"]
            close = level * row["close_ratio"]
            candles.append({
                "time": row["time"], "open": open_price,
                "high": level * row["high_ratio"], "low": level * row["low_ratio"], "close": close,
                "volume": row["volume"] or 0, "amount": row["amount"],
            })
            level = close
        if not candles:
            raise ValueError(f"{name} 的成分股暂无可用历史日线")
        candles = aggregate_candles(candles, period) if period != "day" else candles
        candles = [item for item in candles if (not start or item["time"] >= start) and (not end or item["time"] <= end)]
        return candles[-limit:] if limit is not None else candles

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
        if sector_id.startswith(("sector-ths.", "sector-ths-concept.")):
            concept = sector_id.startswith("sector-ths-concept.")
            category = "gn" if concept else "thshy"
            code = sector_id.removeprefix("sector-ths-concept." if concept else "sector-ths.")
            try:
                first = self.ths_bytes(f"https://q.10jqka.com.cn/{category}/detail/code/{code}/").decode("gb18030", "replace")
                page_info = re.search(r'class="page_info"[^>]*>\s*\d+\s*/\s*(\d+)', first)
                pages = int(page_info.group(1)) if page_info else max([int(value) for value in re.findall(r"page/(\d+)", first)] or [1])
                ids = set(re.findall(r"stockpage\.10jqka\.com\.cn/(\d{6})", first))
                for page in range(2, pages + 1):
                    text = self.ths_bytes(f"https://q.10jqka.com.cn/{category}/detail/field/199112/order/desc/page/{page}/ajax/1/code/{code}/").decode("gb18030", "replace")
                    page_ids = set(re.findall(r"stockpage\.10jqka\.com\.cn/(\d{6})", text))
                    if not page_ids:
                        reason = "需要登录" if "upass.10jqka.com.cn/login" in text else "返回内容为空"
                        raise ValueError(f"第 {page} 页{reason}，不能使用不完整成分")
                    ids.update(page_ids)
                if not ids:
                    raise ValueError(f"同花顺{'概念' if concept else '行业'} {code} 没有返回成分股")
                return {self.stock_id(code) for code in ids}
            except (OSError, ValueError, RuntimeError) as error:
                sector = next((item for item in self.cache if item["id"] == sector_id), None)
                if concept:
                    alias = self.sina_aliases.get(sector["name"]) if sector else None
                    if alias:
                        return self.members(alias)
                    raise ValueError(f"{sector['name'] if sector else code} 的完整成分暂不可用：{error}") from error
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
