import logging
import threading
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from .exchange_catalog import base_instrument
from .errors import NoMarketData
from .http import fetch_bytes, fetch_json
from .parsing import parse_candles

logger = logging.getLogger(__name__)

HK_NAMES = {
    "00700": "腾讯控股", "09988": "阿里巴巴-W", "03690": "美团-W", "01810": "小米集团-W", "09618": "京东集团-SW",
    "09999": "网易-S", "09888": "百度集团-SW", "01024": "快手-W", "00941": "中国移动", "00005": "汇丰控股",
    "00388": "香港交易所", "02318": "中国平安", "01398": "工商银行", "00939": "建设银行", "03988": "中国银行",
    "03968": "招商银行", "01299": "友邦保险", "01211": "比亚迪股份", "02015": "理想汽车-W", "09868": "小鹏汽车-W",
    "06862": "海底捞", "09633": "农夫山泉", "02020": "安踏体育", "02331": "李宁", "02269": "药明生物",
    "06618": "京东健康", "00241": "阿里健康", "09961": "携程集团-S", "02688": "新奥能源", "01109": "华润置地",
}
US_NAMES = {
    "AAPL": "苹果", "MSFT": "微软", "NVDA": "英伟达", "AMZN": "亚马逊", "GOOGL": "谷歌A", "META": "Meta",
    "TSLA": "特斯拉", "AVGO": "博通", "AMD": "AMD", "INTC": "英特尔", "QCOM": "高通", "MU": "美光科技",
    "AMAT": "应用材料", "ASML": "阿斯麦", "TSM": "台积电", "NFLX": "奈飞", "CRM": "赛富时", "ORCL": "甲骨文",
    "ADBE": "Adobe", "MS": "摩根士丹利", "GS": "高盛", "JPM": "摩根大通", "V": "Visa", "MA": "万事达",
    "UNH": "联合健康", "LLY": "礼来", "XOM": "埃克森美孚", "CVX": "雪佛龙", "JNJ": "强生", "PG": "宝洁",
    "KO": "可口可乐", "PEP": "百事", "WMT": "沃尔玛", "COST": "好市多", "HD": "家得宝", "MCD": "麦当劳",
    "NKE": "耐克", "DIS": "迪士尼", "BA": "波音", "CAT": "卡特彼勒", "GE": "通用电气", "IBM": "IBM",
    "CSCO": "思科", "VZ": "威瑞森", "T": "AT&T", "PYPL": "PayPal", "SQ": "Block", "SHOP": "Shopify",
    "PLTR": "Palantir", "SOFI": "SoFi", "HOOD": "Robinhood", "COIN": "Coinbase", "SMCI": "Super Micro Computer",
    "ARM": "Arm", "SNOW": "Snowflake", "DDOG": "Datadog", "NET": "Cloudflare", "CRWD": "CrowdStrike",
    "OKTA": "Okta", "TEAM": "Atlassian", "UBER": "Uber", "ABNB": "Airbnb", "RIVN": "Rivian", "LCID": "Lucid",
    "F": "福特汽车", "GM": "通用汽车",
}


class TencentProvider:
    name = "腾讯行情"

    def __init__(self, bj_code_resolver=None):
        self.quote_cache = {}
        self.lock = threading.RLock()
        self.bj_code_resolver = bj_code_resolver or (lambda code: code)

    def static_instruments(self):
        return [base_instrument(f"hk-{code}", code, name, "HK", "HKD", "港股", "内置常用标的", ["港股"]) for code, name in HK_NAMES.items()] + [base_instrument(f"us-{code.lower()}", code, name, "US", "USD", "美股", "内置常用标的", ["美股"]) for code, name in US_NAMES.items()]

    def quote_many(self, instrument_ids):
        with self.lock:
            ids = list(dict.fromkeys(instrument_ids))
            missing = [item for item in ids if self.quote_cache.get(item, (0, None))[0] < time.time() - 15]
            for start in range(0, len(missing), 40):
                batch = missing[start:start + 40]
                symbols = {}
                for item in batch:
                    market, code = item.split("-", 1)
                    if market == "bj":
                        code = self.bj_code_resolver(code)
                    symbols[item] = "r_hk" + code if market == "hk" else market + code.upper()
                by_prefix = {f"v_{symbol}": item for item, symbol in symbols.items()}
                payload = fetch_bytes(f"https://qt.gtimg.cn/q={','.join(symbols.values())}", timeout=10, retries=1).decode("gb18030")
                for line in payload.strip().splitlines():
                    try:
                        prefix, raw = line.split('="', 1)
                        instrument_id = by_prefix[prefix]
                        values = raw.rsplit('"', 1)[0].split("~")
                        price, previous = float(values[3]), float(values[4])
                        if price <= 0:
                            continue
                        market = "HK" if instrument_id.startswith("hk-") else "US" if instrument_id.startswith("us-") else "CN"
                        amount = float(values[37]) / (10000 if market == "CN" else 1e8)
                        formats = ("CN", "%Y%m%d%H%M%S", "Asia/Shanghai") if market == "CN" else ("HK", "%Y/%m/%d %H:%M:%S", "Asia/Hong_Kong") if market == "HK" else ("US", "%Y-%m-%d %H:%M:%S", "America/New_York")
                        try:
                            quote_time = datetime.strptime(values[30], formats[1]).replace(tzinfo=ZoneInfo(formats[2])).isoformat()
                        except ValueError:
                            quote_time = None
                        quote = {
                            "id": instrument_id, "price": price, "changePct": (price - previous) / previous * 100 if previous else 0,
                            "amount": amount, "turnover": float(values[38]) if values[38] else None,
                            "cap": float(values[45]) if len(values) > 45 and values[45] else None,
                            "dataSource": self.name, "dataStatus": "snapshot", "quoteTime": quote_time,
                        }
                        self.quote_cache[instrument_id] = (time.time(), quote)
                    except (KeyError, ValueError, IndexError) as error:
                        logger.warning("腾讯报价解析失败: %s", error)
            return [self.quote_cache[item][1] for item in ids if item in self.quote_cache]

    def quotes(self):
        return {item["id"]: item for item in self.quote_many([item["id"] for item in self.static_instruments()])}

    def candles(self, instrument_id, period="day", limit=500, start=None, end=None, adjustment="none"):
        code = instrument_id.split("-", 1)[1]
        symbol = instrument_id.split("-", 1)[0] + code.upper()
        url_period = {"day": "day", "week": "week", "month": "month", "60m": "m60", "30m": "m30", "15m": "m15", "5m": "m5", "1m": "m1"}.get(period)
        if url_period is None:
            raise ValueError(f"不支持的K线周期: {period}")
        begin = datetime.fromtimestamp(start).strftime("%Y-%m-%d") if start else ""
        ending = datetime.fromtimestamp(end).strftime("%Y-%m-%d") if end else ""
        suffix = ",qfq" if adjustment == "qfq" else ",hfq" if adjustment == "hfq" else ""
        endpoint = "kline/kline" if adjustment == "none" else "fqkline/get"
        url = f"https://web.ifzq.gtimg.cn/appstock/app/{endpoint}?param={symbol},{url_period},{begin},{ending},{min(limit or 640, 640)}{suffix}"
        payload = fetch_json(url, timeout=15, retries=1)
        data = payload.get("data", {})
        if not isinstance(data, dict):
            raise NoMarketData(f"腾讯没有 {symbol} 的行情数据")
        node = data.get(symbol, {})
        if isinstance(node, list):
            if not node:
                raise NoMarketData(f"腾讯没有 {symbol} 的K线")
            raise ValueError(f"腾讯K线错误: {node}")
        key = {"none": "day", "qfq": "qfqday", "hfq": "hfqday"}[adjustment]
        rows = node.get(key, [])
        if not rows:
            raise NoMarketData(f"腾讯没有返回 {symbol} 的 {period} K线")
        return parse_candles(rows, "HK" if instrument_id.startswith("hk-") else "US" if instrument_id.startswith("us-") else "CN", self.name)[-(limit or 640):]
