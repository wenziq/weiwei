import json
import random
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List


class DemoMarketDataProvider:
    name = "demo"

    def __init__(self):
        data_path = Path(__file__).resolve().parents[1] / "data" / "market.json"
        with data_path.open("r", encoding="utf-8") as file:
            self.data = json.load(file)

    @staticmethod
    def spark(seed: str, direction: float) -> List[float]:
        randomizer = random.Random(sum(ord(char) for char in seed))
        value = 30.0
        values = []
        for _ in range(16):
            value += randomizer.uniform(-2.2, 2.2) + (0.65 if direction >= 0 else -0.65)
            values.append(round(value, 2))
        return values

    def indices(self) -> List[Dict[str, Any]]:
        keys = ["name", "code", "group", "point", "changePct", "amount", "deltaPct"]
        indices = []
        for values in self.data["indices"]:
            item = dict(zip(keys, values))
            item.update({
                "id": f"index-{item['code'].lower()}",
                "marketState": "已收盘" if item["group"] == "美股" else "交易中",
                "spark": self.spark(item["code"], item["changePct"]),
            })
            indices.append(item)
        return indices

    def sectors(self) -> List[Dict[str, Any]]:
        keys = ["name", "type", "changePct", "amount", "deltaPct", "up", "down", "leader", "leaderChangePct", "flow", "etf"]
        sectors = []
        for values in self.data["sectors"]:
            item = dict(zip(keys, values))
            item.update({"id": f"sector-{item['name']}", "spark": self.spark(item["name"], item["changePct"])})
            sectors.append(item)
        return sectors

    def instruments(self) -> List[Dict[str, Any]]:
        instruments = deepcopy(self.data["stocks"])
        for item in instruments:
            item["spark"] = self.spark(item["id"], item["changePct"])
        return instruments

    def dashboard(self) -> Dict[str, Any]:
        breadth_values = [
            ("跌停", "跌停", 3, "negative"), (">7", "跌幅 >7%", 14, "negative"),
            ("5-7", "跌幅 5–7%", 17, "negative"), ("3-5", "跌幅 3–5%", 87, "negative"),
            ("0-3", "跌幅 0–3%", 1529, "negative"), ("0", "平盘", 191, "zero"),
            ("0-3", "涨幅 0–3%", 2459, "positive"), ("3-5", "涨幅 3–5%", 526, "positive"),
            ("5-7", "涨幅 5–7%", 202, "positive"), (">7", "涨幅 >7%", 195, "positive"),
            ("涨停", "涨停", 84, "positive"),
        ]
        breadth = [dict(zip(["label", "range", "count", "side"], values)) for values in breadth_values]
        return {
            "indices": self.indices(),
            "sectors": self.sectors()[:6],
            "breadth": breadth,
            "turnover": {
                "total": 9335.4,
                "deltaPct": 14.7,
                "today": [3, 5, 8, 12, 17, 23, 31, 39, 47, 56, 68, 79, 90],
                "previous": [3, 4, 6, 9, 12, 16, 21, 27, 34, 42, 50, 59, 69],
            },
        }

    def candles(self, instrument_id: str, period: str) -> List[Dict[str, Any]]:
        instruments = self.instruments()
        target = next((item["price"] for item in instruments if item["id"] == instrument_id), None)
        if target is None:
            target = next((item["point"] for item in self.indices() if item["id"] == instrument_id), None)
        if target is None and instrument_id.startswith("sector-"):
            target = 100 + sum(ord(char) for char in instrument_id) % 100
        if target is None:
            raise KeyError(instrument_id)
        randomizer = random.Random(sum(ord(char) for char in f"{instrument_id}-{period}"))
        seconds = {"1m": 60, "5m": 300, "15m": 900, "30m": 1800, "60m": 3600, "week": 604800, "month": 2592000}.get(period, 86400)
        count = 90
        start = datetime.now(timezone.utc) - timedelta(seconds=seconds * count)
        candles = []
        price = target * 0.68
        for index in range(count):
            open_price = price
            close = open_price * (1 + randomizer.uniform(-0.025, 0.028) + 0.0025)
            high = max(open_price, close) * (1 + randomizer.uniform(0, 0.012))
            low = min(open_price, close) * (1 - randomizer.uniform(0, 0.012))
            volume = int(randomizer.uniform(20000, 180000) * (1.6 if index > count - 10 else 1))
            candles.append({
                "time": int((start + timedelta(seconds=seconds * index)).timestamp()),
                "open": round(open_price, 2), "high": round(high, 2),
                "low": round(low, 2), "close": round(close, 2), "volume": volume,
            })
            price = close
        scale = target / candles[-1]["close"]
        for candle in candles:
            for key in ["open", "high", "low", "close"]:
                candle[key] = round(candle[key] * scale, 2)
        return candles
