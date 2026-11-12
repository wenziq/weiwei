import json
import logging
import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import quote

from .exchange_catalog import base_instrument
from .http import fetch_bytes, fetch_json
from .parsing import aggregate_candles, parse_candles, search_names

logger = logging.getLogger(__name__)


def secid_for(code):
    return ("bj-" if code.startswith(("4", "8", "920")) else "sh-" if code.startswith("6") else "sz-") + code


def secid_market(code):
    return "BJ" if code.startswith(("4", "8", "920")) else "SH" if code.startswith("6") else "SZ"


def optional_number(value):
    return None if value in {None, "", "-"} else float(value)


class EastMoneyProvider:
    name = "东方财富"

    def __init__(self, data_dir):
        data_dir.mkdir(parents=True, exist_ok=True)
        self.cache_path = data_dir / "a_catalog.json"
        self.bj_map_path = data_dir / "bj_code_map.json"
        self.bj_map = {}
        if self.bj_map_path.exists():
            with self.bj_map_path.open("r", encoding="utf-8") as file:
                self.bj_map = json.load(file)
        self.bj_lock = threading.RLock()
        self.catalog = None
        self.loaded_at = 0
        self.candle_sources = {}

    @staticmethod
    def fetch(url):
        errors = []
        for scheme in ["http", "https"]:
            try:
                return fetch_json(url.replace("https://", f"{scheme}://", 1), timeout=4, retries=1)
            except (OSError, ValueError) as error:
                errors.append(error)
        raise RuntimeError(f"东方财富请求失败: {errors[-1]}")

    def resolve_bj_code(self, code):
        if code.startswith("920"):
            return code
        with self.bj_lock:
            if code in self.bj_map:
                return self.bj_map[code]
            payload = fetch_json(f"https://searchapi.eastmoney.com/api/suggest/get?input={quote(code)}&type=14&count=10", timeout=12, retries=1)
            entries = payload.get("QuotationCodeTable", {}).get("Data") or []
            current = next((entry["Code"] for entry in entries if entry.get("Code", "").startswith("920") and entry.get("Name")), None)
            if not current:
                raise ValueError(f"未找到北交所 {code} 的当前代码")
            self.bj_map[code] = current
            temporary = self.bj_map_path.with_suffix(".tmp")
            with temporary.open("w", encoding="utf-8") as file:
                json.dump(self.bj_map, file, ensure_ascii=False, indent=2)
            os.replace(temporary, self.bj_map_path)
            return current

    def download_catalog(self):
        fs = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
        fields = "f2,f3,f5,f6,f8,f12,f14,f20,f21,f100"
        try:
            payload = self.fetch(f"https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&fltt=2&invt=2&fid=f12&fs={fs}&fields={fields}")
            expected = int((payload.get("data") or {}).get("total") or 0)
            rows = list((payload.get("data") or {}).get("diff") or [])
            for page in range(2, math.ceil(expected / 100) + 1):
                payload = self.fetch(f"https://push2.eastmoney.com/api/qt/clist/get?pn={page}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f12&fs={fs}&fields={fields}")
                rows.extend((payload.get("data") or {}).get("diff") or [])
            if not rows or expected and len(rows) != expected:
                raise RuntimeError(f"东方财富A股目录不完整: {len(rows)} / {expected}")
            return rows
        except (OSError, ValueError, RuntimeError) as error:
            logger.warning("东方财富A股目录不可用，切换新浪目录: %s", error)
            return self.download_sina_catalog()

    @staticmethod
    def download_sina_catalog():
        def fetch_page(page):
            url = f"https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page={page}&num=100&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page"
            return fetch_json(url, timeout=15, retries=1)
        first = fetch_page(1)
        count_text = fetch_json("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hs_a", timeout=15, retries=1)
        expected = int(count_text)
        pages = math.ceil(expected / 100)
        rows = [*first]
        with ThreadPoolExecutor(max_workers=4) as executor:
            for page_rows in executor.map(fetch_page, range(2, pages + 1)):
                rows.extend(page_rows)
        if len(rows) < expected * 0.95:
            raise RuntimeError(f"新浪A股目录不完整: {len(rows)} / {expected}")
        return [{"f12": row["code"], "f14": row["name"], "f2": float(row["trade"]), "f3": float(row["changepercent"]), "f6": row["amount"], "f8": row["turnoverratio"], "f20": row["mktcap"], "f21": row["nmc"], "cap_divisor": 10000, "source": "新浪财经"} for row in rows]

    @staticmethod
    def convert(row):
        code, name = row["f12"], row["f14"]
        item = base_instrument(secid_for(code), code, name, secid_market(code), "CNY", row.get("f100") or "未分类", row.get("source", "东方财富"), [])
        amount, cap = optional_number(row.get("f6")), optional_number(row.get("f20"))
        price = optional_number(row.get("f2"))
        item.update({
            "price": price if price and price > 0 else None, "changePct": optional_number(row.get("f3")),
            "amount": amount / 1e8 if amount is not None else None,
            "turnover": optional_number(row.get("f8")),
            "cap": round(cap / row.get("cap_divisor", 1e8), 4) if cap is not None else None,
            "dataStatus": "cached", **search_names(name),
        })
        return item

    def load_catalog(self, force=False):
        if not force and self.catalog is not None and time.time() - self.loaded_at < 3600:
            return self.catalog
        if not force and self.cache_path.exists() and time.time() - self.cache_path.stat().st_mtime < 3600:
            with self.cache_path.open("r", encoding="utf-8") as file:
                self.catalog = json.load(file)
        else:
            try:
                self.catalog = [self.convert(row) for row in self.download_catalog()]
                temporary = self.cache_path.with_suffix(".tmp")
                with temporary.open("w", encoding="utf-8") as file:
                    json.dump(self.catalog, file, ensure_ascii=False, separators=(",", ":"))
                os.replace(temporary, self.cache_path)
            except (OSError, ValueError, RuntimeError):
                if not self.cache_path.exists():
                    raise
                with self.cache_path.open("r", encoding="utf-8") as file:
                    self.catalog = json.load(file)
        self.loaded_at = time.time()
        return self.catalog

    def instruments(self, force=False):
        return self.load_catalog(force)

    def get_instrument(self, instrument_id):
        return next((item for item in self.instruments() if item["id"] == instrument_id), None)

    def catalog_search(self, query, limit=30):
        normalized = query.strip().lower().replace(" ", "")
        if not normalized:
            return []
        def score(item):
            name, code, pinyin, initials = item["name"].lower(), item["code"], item["pinyin"], item["initials"]
            if code == normalized or item["id"].lower() == normalized: return (0, -(item.get("cap") or 0))
            if name == normalized: return (1, -(item.get("cap") or 0))
            if code.startswith(normalized) or name.startswith(normalized): return (2, -(item.get("cap") or 0))
            if initials.startswith(normalized) or pinyin.startswith(normalized): return (3, -(item.get("cap") or 0))
            if normalized in name or normalized in code or normalized in pinyin: return (4, -(item.get("cap") or 0))
            return (99, 0)
        matches = [(score(item), item) for item in self.instruments()]
        matches = [entry for entry in matches if entry[0][0] < 99]
        matches.sort(key=lambda entry: entry[0])
        return [item for _, item in matches][:limit]

    def candles(self, instrument_id, period="day", limit=500, start=None, end=None, adjustment="none"):
        limit = limit or 10000
        if instrument_id.startswith("sector-"):
            secid = "90." + instrument_id.removeprefix("sector-")
        elif instrument_id.startswith("index-"):
            code = instrument_id.removeprefix("index-").upper()
            secid = ("2" if code.startswith(("93", "H")) else "0" if code.startswith("899") else "1") + "." + code
        else:
            code = instrument_id.split("-", 1)[1]
            market = "bj" if instrument_id.startswith("bj-") else "sh" if instrument_id.startswith("sh-") else "sz"
            if market == "bj":
                try:
                    current_code = self.resolve_bj_code(code)
                except (OSError, ValueError) as error:
                    logger.warning("北交所代码映射不可用，使用新浪有限历史: %s", error)
                    self.candle_sources[(instrument_id, period, adjustment)] = "新浪财经"
                    return self.sina_candles(instrument_id, period, limit)
            else:
                current_code = code
            secid = ("0" if market in {"bj", "sz"} else "1") + "." + current_code
        klt = {"day": 101, "week": 102, "month": 103, "60m": 60, "30m": 30, "15m": 15, "5m": 5, "1m": 1}.get(period)
        if klt is None:
            raise ValueError(f"不支持的K线周期: {period}")
        fqt = {"none": 0, "qfq": 1, "hfq": 2}.get(adjustment)
        if fqt is None:
            raise ValueError(f"不支持的复权方式: {adjustment}")
        begin = datetime.fromtimestamp(start, timezone.utc).strftime("%Y%m%d") if start else "0"
        ending = datetime.fromtimestamp(end, timezone.utc).strftime("%Y%m%d") if end else "20500101"
        url = f"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={secid}&klt={klt}&fqt={fqt}&lmt={min(limit, 10000)}&beg={begin}&end={ending}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57"
        try:
            payload = self.fetch(url)
            rows = [row.split(",") for row in (payload.get("data") or {}).get("klines", [])]
            if instrument_id.startswith("bj-") and current_code != code and adjustment == "none" and not start:
                try:
                    legacy = self.fetch(url.replace(f"secid=0.{current_code}", f"secid=0.{code}", 1))
                    rows = [row.split(",") for row in (legacy.get("data") or {}).get("klines", [])] + rows
                except (OSError, ValueError, RuntimeError) as error:
                    logger.warning("北交所旧代码历史暂不可用 %s: %s", code, error)
            candles = parse_candles(rows, "CN", self.name, 100)
            if not candles:
                raise ValueError(f"东方财富没有返回 {instrument_id} 的K线")
            self.candle_sources[(instrument_id, period, adjustment)] = self.name
            return candles[-limit:]
        except (OSError, ValueError, RuntimeError) as error:
            if instrument_id.startswith(("sector-", "index-")):
                raise
            logger.warning("东方财富K线不可用，切换新浪: %s %s", instrument_id, error)
            candles = self.sina_candles(instrument_id, period, limit)
            self.candle_sources[(instrument_id, period, adjustment)] = "新浪财经"
            return candles

    def sina_candles(self, instrument_id, period, limit=1023):
        code = instrument_id.split("-", 1)[1]
        symbol = ("sh" if instrument_id.startswith("sh-") else "bj" if instrument_id.startswith("bj-") else "sz") + code
        scale = {"day": 240, "week": 240, "month": 240, "60m": 60, "30m": 30, "15m": 15, "5m": 5, "1m": 1}.get(period, 240)
        url = f"https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_{symbol}=/CN_MarketDataService.getKLineData?symbol={symbol}&scale={scale}&ma=no&datalen={min(limit, 1023)}"
        text = fetch_bytes(url, timeout=18, retries=1).decode("utf-8")
        rows = json.loads(text.split("=(", 1)[1].rsplit(")", 1)[0])
        candles = parse_candles([[row["day"], row["open"], row["close"], row["high"], row["low"], row["volume"]] for row in rows], "CN", "新浪财经")
        return aggregate_candles(candles, period)[-limit:] if period in {"week", "month"} else candles[-limit:]
