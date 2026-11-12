import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo

from .eastmoney import EastMoneyProvider
from .http import fetch_bytes, fetch_json
from .parsing import parse_candles

INDEX_SYMBOLS = {
    "index-000001": "sh000001", "index-399001": "sz399001", "index-399006": "sz399006",
    "index-000688": "sh000688", "index-899050": "bj899050", "index-930050": "sh930050",
    "index-000300": "sh000300", "index-000510": "sh000510", "index-000905": "sh000905",
    "index-000852": "sh000852", "index-932000": "sh932000", "index-000985": "sh000985",
    "index-000922": "sh000922", "index-h30184": "shH30184",
    "index-hsi": "hkHSI", "index-hstech": "hkHSTECH", "index-hscei": "hkHSCEI",
    "index-dji": "usDJI", "index-spx": "usSPX", "index-ixic": "usIXIC", "index-ndx": "usNDX", "index-sox": "usSOX",
}


class IndexProvider:
    name = "腾讯指数"

    def __init__(self):
        self.quote_cache = {}
        self.quote_time = 0
        self.candle_cache = {}
        self.turnover_cache = None
        self.turnover_time = 0
        self.turnover_error_at = 0

    @staticmethod
    def parse_quote_timestamp(values, symbol):
        try:
            if symbol.startswith(("sh", "sz", "bj")):
                return datetime.strptime(values[30], "%Y%m%d%H%M%S").replace(tzinfo=ZoneInfo("Asia/Shanghai")).isoformat()
            if symbol.startswith("hk"):
                return datetime.strptime(values[30], "%Y/%m/%d %H:%M:%S").replace(tzinfo=ZoneInfo("Asia/Hong_Kong")).isoformat()
            return datetime.strptime(values[30], "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo("America/New_York")).isoformat()
        except (ValueError, IndexError):
            return None

    def quotes(self):
        if time.time() - self.quote_time < 15 and self.quote_cache:
            return self.quote_cache
        symbols = list(dict.fromkeys(INDEX_SYMBOLS.values()))
        try:
            payload = fetch_bytes(f"https://qt.gtimg.cn/q={','.join(symbols)}", timeout=10, retries=1).decode("gb18030")
        except OSError:
            if self.quote_cache:
                return {key: {**value, "dataStatus": "cached"} for key, value in self.quote_cache.items()}
            raise
        by_symbol = {}
        for line in payload.strip().splitlines():
            try:
                prefix, raw = line.split('="', 1)
                symbol = prefix.removeprefix("v_")
                values = raw.rsplit('"', 1)[0].split("~")
                point, previous = float(values[3]), float(values[4])
                if point <= 0:
                    continue
                amount = float(values[37]) / 10000 if symbol.startswith(("sh", "sz", "bj")) else None
                by_symbol[symbol] = {
                    "point": point, "changePct": (point - previous) / previous * 100 if previous else None,
                    "amount": amount, "deltaPct": None, "dataSource": self.name,
                    "dataStatus": "snapshot", "quoteTime": self.parse_quote_timestamp(values, symbol), "marketState": "见报价时间",
                }
            except (ValueError, IndexError):
                continue
        if not by_symbol:
            raise ValueError("腾讯指数报价为空")
        self.quote_cache = {instrument_id: by_symbol.get(symbol, {}) for instrument_id, symbol in INDEX_SYMBOLS.items()}
        self.quote_time = time.time()
        return self.quote_cache

    def candles(self, instrument_id, period="day", limit=500):
        key = (instrument_id, period, limit)
        if self.candle_cache.get(key, (0, None))[0] > time.time() - 30:
            return self.candle_cache[key][1]
        symbol = INDEX_SYMBOLS[instrument_id]
        url_period = {"day": "day", "week": "week", "month": "month", "60m": "m60", "30m": "m30", "15m": "m15", "5m": "m5", "1m": "m1"}.get(period)
        if url_period is None:
            raise ValueError(f"不支持的指数周期: {period}")
        url = f"https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param={symbol},{url_period},,,{min(limit, 640)}"
        payload = fetch_json(url, timeout=15, retries=1)
        data = payload.get("data", {})
        if not isinstance(data, dict):
            raise ValueError(f"腾讯指数K线返回异常: {instrument_id}")
        node = data.get(symbol, {})
        if not isinstance(node, dict):
            raise ValueError(f"腾讯指数K线错误: {node}")
        rows = node.get(url_period, [])
        if not rows:
            raise ValueError(f"腾讯指数K线为空: {instrument_id}")
        candles = parse_candles(rows, "HK" if symbol.startswith("hk") else "US" if symbol.startswith("us") else "CN", self.name)
        self.candle_cache[key] = (time.time(), candles)
        return candles

    def recent_quote(self, instrument_id):
        code = instrument_id.removeprefix("index-")
        if not code.startswith(("93", "h")):
            raise ValueError("该指数不需要中证日线回退")
        secid = ("2" if code.startswith(("93", "h")) else "1") + "." + code.upper()
        url = f"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={secid}&klt=101&fqt=0&lmt=2&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57"
        payload = EastMoneyProvider.fetch(url)
        rows = [row.split(",") for row in (payload.get("data") or {}).get("klines", [])]
        candles = parse_candles(rows, "CN", "东方财富指数日线", 100)
        if not candles:
            raise ValueError(f"中证指数日线为空: {instrument_id}")
        latest = candles[-1]
        previous = candles[-2]["close"] if len(candles) > 1 else None
        return {
            "point": latest["close"], "changePct": (latest["close"] - previous) / previous * 100 if previous else None,
            "amount": latest["amount"] / 1e8 if latest.get("amount") is not None else None,
            "deltaPct": None, "dataSource": "东方财富指数日线", "dataStatus": "cached",
            "quoteTime": datetime.fromtimestamp(latest["time"], ZoneInfo("Asia/Shanghai")).date().isoformat(),
            "marketState": "最近交易日收盘",
        }

    def turnover(self):
        if self.turnover_cache is not None and time.time() - self.turnover_time < 30:
            return self.turnover_cache
        if time.time() - self.turnover_error_at < 60:
            if self.turnover_cache is not None:
                return {**self.turnover_cache, "stale": True}
            raise RuntimeError("成交额源暂时不可用，正在等待重试")
        self.turnover_error_at = time.time()
        def download(secid):
            url = f"https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid={secid}&ndays=2&iscr=0&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58"
            payload = EastMoneyProvider.fetch(url)
            return [row.split(",") for row in (payload.get("data") or {}).get("trends", [])]
        with ThreadPoolExecutor(max_workers=2) as executor:
            sh, sz = list(executor.map(download, ["1.000001", "0.399106"]))
        by_date = {}
        for rows in [sh, sz]:
            for row in rows:
                day, minute = row[0][:10], row[0][11:16]
                by_date.setdefault(day, {}).setdefault(minute, 0)
                by_date[day][minute] += float(row[6]) / 1e8
        dates = sorted(by_date)
        if not dates:
            raise ValueError("沪深分时成交额为空")
        cumulative = {}
        for day, values in by_date.items():
            running = 0
            cumulative[day] = {}
            for minute in sorted(values):
                running += values[minute]
                cumulative[day][minute] = running
        today = cumulative[dates[-1]]
        previous = cumulative[dates[-2]] if len(dates) > 1 else {}
        minutes = sorted(today)
        today_values = [today[minute] for minute in minutes]
        previous_values = [previous.get(minute) for minute in minutes]
        last_comparison = next((item for item in reversed(previous_values) if item is not None), None)
        self.turnover_cache = {
            "total": round(today_values[-1], 2),
            "deltaPct": (today_values[-1] - last_comparison) / last_comparison * 100 if last_comparison else None,
            "today": today_values, "previous": previous_values,
        }
        self.turnover_time = time.time()
        self.turnover_error_at = 0
        return self.turnover_cache
