import time
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.parse import quote as url_quote
from zoneinfo import ZoneInfo

from .errors import NoMarketData
from .http import fetch_json
from .parsing import parse_candles

INDEX_YAHOO_SYMBOLS = {
    "index-dji": "^DJI", "index-spx": "^GSPC", "index-ixic": "^IXIC",
    "index-ndx": "^NDX", "index-sox": "^SOX", "index-hsi": "^HSI",
    "index-hstech": "^HSTECH", "index-hscei": "^HSCEI",
}


class YahooProvider:
    name = "Yahoo Finance"

    def __init__(self):
        self.cache = {}
        self.quote_cache = {}

    @staticmethod
    def symbol_for(instrument_id):
        if instrument_id in INDEX_YAHOO_SYMBOLS:
            return INDEX_YAHOO_SYMBOLS[instrument_id]
        if instrument_id == "fx-usdcny":
            return "CNY=X"
        if instrument_id == "fx-hkdcny":
            return "HKDCNY=X"
        market, code = instrument_id.split("-", 1)
        if market == "sh" or market == "index" and code.startswith("000"):
            return f"{code}.SS"
        if market == "sz" or market == "index" and code.startswith("399"):
            return f"{code}.SZ"
        if market == "hk":
            return f"{int(code):04d}.HK"
        if market == "us":
            return code.upper().replace(".", "-").replace("$", "-")
        raise ValueError(f"Yahoo 不支持该市场: {instrument_id}")

    @staticmethod
    def market_for(instrument_id):
        if instrument_id in INDEX_YAHOO_SYMBOLS:
            return "HK" if instrument_id in {"index-hsi", "index-hstech", "index-hscei"} else "US"
        return "HK" if instrument_id.startswith("hk-") else "US" if instrument_id.startswith("us-") else "CN"

    def chart(self, instrument_id, period="1d", query=None):
        symbol = self.symbol_for(instrument_id)
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{url_quote(symbol, safe='.-_')}?interval={period}&events=history"
        for key, value in (query or {}).items():
            url += f"&{key}={value}"
        try:
            payload = fetch_json(url, timeout=18, retries=1)
        except HTTPError as error:
            if error.code == 404:
                raise NoMarketData(f"Yahoo 没有 {symbol} 的行情数据") from error
            raise
        chart = payload.get("chart", {})
        if chart.get("error"):
            description = str(chart["error"].get("description", chart["error"]))
            if any(text in description.lower() for text in ["delisted", "not found", "no data"]):
                raise NoMarketData(f"Yahoo {symbol}: {description}")
            raise ValueError(f"Yahoo {symbol}: {description}")
        results = chart.get("result") or []
        if not results:
            raise NoMarketData(f"Yahoo {symbol}: 没有返回图表数据")
        return results[0]

    def candles(self, instrument_id, period="day", limit=500, start=None, end=None, adjustment="none"):
        intervals = {"day": "1d", "week": "1wk", "month": "1mo", "60m": "60m", "30m": "30m", "15m": "15m", "5m": "5m", "1m": "1m"}
        if period not in intervals:
            raise ValueError(f"不支持的K线周期: {period}")
        if adjustment != "none":
            raise ValueError("Yahoo 原始行情不提供复权序列")
        if self.symbol_for(instrument_id).endswith(".BJ"):
            raise ValueError("Yahoo 不覆盖北交所")
        if start is not None or limit is None or limit > 500 and period in {"day", "week", "month"}:
            query = {"period1": int(start or 0), "period2": int(end or time.time() + 86400)}
        else:
            query = {"range": {"day": "5y", "week": "10y", "month": "max", "60m": "1y", "30m": "6mo", "15m": "3mo", "5m": "1mo", "1m": "5d"}[period]}
        key = (instrument_id, period, limit, start, end)
        if limit is not None and limit <= 500 and self.cache.get(key, (0, None))[0] > time.time() - 25:
            return self.cache[key][1]
        result = self.chart(instrument_id, intervals[period], query)
        timestamps = result.get("timestamp") or []
        quotes = (result.get("indicators", {}).get("quote") or [{}])[0]
        if not timestamps or not quotes.get("close"):
            raise NoMarketData(f"Yahoo {instrument_id}: 没有K线数据")
        zone = ZoneInfo(result.get("meta", {}).get("exchangeTimezoneName", "UTC"))
        rows = []
        for index, timestamp in enumerate(timestamps):
            try:
                values = [quotes[field][index] for field in ("open", "close", "high", "low", "volume")]
                if any(value is None for value in values):
                    continue
                date = datetime.fromtimestamp(timestamp, zone).strftime("%Y-%m-%d %H:%M:%S" if period.endswith("m") else "%Y-%m-%d")
                rows.append([date, *values])
            except (IndexError, TypeError):
                continue
        candles = parse_candles(rows, self.market_for(instrument_id), self.name)
        if limit is not None:
            candles = candles[-limit:]
        if limit is not None and limit <= 500:
            self.cache[key] = (time.time(), candles)
        return candles

    def quote(self, instrument_id):
        if self.quote_cache.get(instrument_id, (0, None))[0] > time.time() - 20:
            return self.quote_cache[instrument_id][1]
        meta = self.chart(instrument_id, "1d", {"range": "5d"})["meta"]
        price = meta.get("regularMarketPrice")
        if price is None:
            raise ValueError(f"Yahoo 没有返回 {instrument_id} 的最新价格")
        previous = meta.get("chartPreviousClose") or meta.get("previousClose")
        change = meta.get("regularMarketChangePercent")
        quote_time = meta.get("regularMarketTime")
        result = {
            "id": instrument_id, "price": float(price),
            "changePct": float(change) if change is not None else (float(price) - previous) / previous * 100 if previous else 0,
            "amount": None, "turnover": None, "cap": None,
            "dataSource": self.name, "dataStatus": "snapshot",
            "quoteTime": datetime.fromtimestamp(quote_time, timezone.utc).isoformat() if quote_time else None,
        }
        self.quote_cache[instrument_id] = (time.time(), result)
        return result
