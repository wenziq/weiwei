import logging
from datetime import datetime, timezone
from math import isfinite
from zoneinfo import ZoneInfo

from pypinyin import lazy_pinyin

logger = logging.getLogger(__name__)


def parse_timestamp(value, market="CN"):
    text = str(value).strip()
    if " " not in text:
        return int(datetime.strptime(text[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
    zone = {"HK": "Asia/Hong_Kong", "US": "America/New_York"}.get(market, "Asia/Shanghai")
    parsed = datetime.strptime(text, "%Y-%m-%d %H:%M" if len(text) == 16 else "%Y-%m-%d %H:%M:%S")
    return int(parsed.replace(tzinfo=ZoneInfo(zone)).timestamp())


def make_candle(values, market="CN", volume_multiplier=1):
    if len(values) < 6:
        raise ValueError("K线字段不足")
    open_price, close, high, low, volume = (float(value) for value in values[1:6])
    prices = [open_price, high, low, close]
    if not all(isfinite(value) for value in [*prices, volume]) or min(prices) <= 0 or volume < 0:
        raise ValueError("K线包含无效价格或成交量")
    if high < max(open_price, close, low) or low > min(open_price, close):
        raise ValueError("K线高低价关系不成立")
    amount = None
    if len(values) > 6 and values[6] not in {None, "", "-"}:
        amount = float(values[6])
    return {
        "time": parse_timestamp(values[0], market), "open": open_price, "high": high,
        "low": low, "close": close, "volume": volume * volume_multiplier, "amount": amount,
    }


def parse_candles(rows, market, source, volume_multiplier=1):
    candles, invalid = {}, 0
    for row in rows:
        try:
            candle = make_candle(row, market, volume_multiplier)
            candles[candle["time"]] = candle
        except (ValueError, TypeError, IndexError):
            invalid += 1
    if invalid:
        logger.warning("%s 忽略了 %d 根无效K线: %s", source, invalid, market)
    return sorted(candles.values(), key=lambda item: item["time"])


def aggregate_candles(candles, period):
    grouped = {}
    for candle in candles:
        date = datetime.fromtimestamp(candle["time"], timezone.utc)
        key = date.isocalendar()[:2] if period == "week" else (date.year, date.month)
        if key not in grouped:
            grouped[key] = dict(candle)
        else:
            grouped[key]["high"] = max(grouped[key]["high"], candle["high"])
            grouped[key]["low"] = min(grouped[key]["low"], candle["low"])
            grouped[key]["close"] = candle["close"]
            grouped[key]["time"] = candle["time"]
            grouped[key]["volume"] += candle["volume"]
            if candle.get("amount") is not None:
                grouped[key]["amount"] = (grouped[key].get("amount") or 0) + candle["amount"]
    return sorted(grouped.values(), key=lambda item: item["time"])


def search_names(name):
    parts = lazy_pinyin(name.lower())
    return {
        "pinyin": "".join(parts).replace(" ", ""),
        "initials": "".join(part[0] for part in parts if part),
    }
