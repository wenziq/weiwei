import csv
import io
import math
import subprocess
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

from .http import fetch_bytes, fetch_json, post_json, throttle

SOURCE_LABELS = {"eastmoney": "东方财富宏观", "fred": "FRED", "mofcom": "商务部", "nbs": "国家统计局"}
SOURCE_URLS = {
    "RPT_ECONOMY_PMI": "https://data.eastmoney.com/cjsj/pmi.html",
    "RPT_ECONOMY_CPI": "https://data.eastmoney.com/cjsj/cpi.html",
    "RPT_ECONOMY_PPI": "https://data.eastmoney.com/cjsj/ppi.html",
    "RPT_ECONOMY_GDP": "https://data.eastmoney.com/cjsj/gdp.html",
    "RPT_ECONOMY_TOTAL_RETAIL": "https://data.eastmoney.com/cjsj/xfp.html",
    "RPT_ECONOMY_CUSTOMS": "https://data.eastmoney.com/cjsj/customs.html",
    "RPT_ECONOMY_CURRENCY_SUPPLY": "https://data.eastmoney.com/cjsj/moneySupply.html",
    "RPTA_WEB_RATE": "https://data.eastmoney.com/cjsj/globalRateLPR.html",
    "shrzgm": "https://data.mofcom.gov.cn/gnmy/shrzgm.shtml",
    "3888eac6062945a79c8a27e5f13d4953": "https://data.stats.gov.cn/dg/website/page.html#/pc/national/monthData",
}


def indicator(id, name, category, region, unit, frequency, source, code, field, transform=None):
    return {
        "id": id, "name": name, "category": category, "region": region,
        "unit": unit, "frequency": frequency, "source": source, "code": code,
        "field": field, "transform": transform,
        "dateField": "TRADE_DATE" if code == "RPTA_WEB_RATE" else "REPORT_DATE",
        "dataSource": SOURCE_LABELS[source],
        "sourceUrl": f"https://fred.stlouisfed.org/series/{code}" if source == "fred" else SOURCE_URLS.get(code),
        "custom": False,
    }


BUILTIN_INDICATORS = [
    indicator("cn-pmi-manufacturing", "制造业 PMI", "景气", "中国", "点", "月度", "eastmoney", "RPT_ECONOMY_PMI", "MAKE_INDEX"),
    indicator("cn-pmi-nonmanufacturing", "非制造业 PMI", "景气", "中国", "点", "月度", "eastmoney", "RPT_ECONOMY_PMI", "NMAKE_INDEX"),
    indicator("cn-cpi-yoy", "CPI 同比", "通胀", "中国", "%", "月度", "eastmoney", "RPT_ECONOMY_CPI", "NATIONAL_SAME"),
    indicator("cn-cpi-mom", "CPI 环比", "通胀", "中国", "%", "月度", "eastmoney", "RPT_ECONOMY_CPI", "NATIONAL_SEQUENTIAL"),
    indicator("cn-ppi-yoy", "PPI 同比", "通胀", "中国", "%", "月度", "eastmoney", "RPT_ECONOMY_PPI", "BASE_SAME"),
    indicator("cn-gdp-yoy", "GDP 同比", "增长", "中国", "%", "季度", "eastmoney", "RPT_ECONOMY_GDP", "SUM_SAME"),
    indicator("cn-gdp-value", "GDP 累计值", "增长", "中国", "亿元", "季度", "eastmoney", "RPT_ECONOMY_GDP", "DOMESTICL_PRODUCT_BASE"),
    indicator("cn-retail-yoy", "社会消费品零售同比", "增长", "中国", "%", "月度", "eastmoney", "RPT_ECONOMY_TOTAL_RETAIL", "RETAIL_TOTAL_SAME"),
    indicator("cn-export-yoy", "出口同比", "增长", "中国", "%", "月度", "eastmoney", "RPT_ECONOMY_CUSTOMS", "EXIT_BASE_SAME"),
    indicator("cn-import-yoy", "进口同比", "增长", "中国", "%", "月度", "eastmoney", "RPT_ECONOMY_CUSTOMS", "IMPORT_BASE_SAME"),
    indicator("cn-m2-yoy", "M2 同比", "流动性", "中国", "%", "月度", "eastmoney", "RPT_ECONOMY_CURRENCY_SUPPLY", "BASIC_CURRENCY_SAME"),
    indicator("cn-m1-yoy", "M1 同比", "流动性", "中国", "%", "月度", "eastmoney", "RPT_ECONOMY_CURRENCY_SUPPLY", "CURRENCY_SAME"),
    indicator("cn-m0-yoy", "M0 同比", "流动性", "中国", "%", "月度", "eastmoney", "RPT_ECONOMY_CURRENCY_SUPPLY", "FREE_CASH_SAME"),
    indicator("cn-m2-value", "M2 余额", "流动性", "中国", "亿元", "月度", "eastmoney", "RPT_ECONOMY_CURRENCY_SUPPLY", "BASIC_CURRENCY"),
    indicator("cn-lpr-1y", "LPR · 1 年期", "利率", "中国", "%", "月度", "eastmoney", "RPTA_WEB_RATE", "LPR1Y"),
    indicator("cn-lpr-5y", "LPR · 5 年期以上", "利率", "中国", "%", "月度", "eastmoney", "RPTA_WEB_RATE", "LPR5Y"),
    indicator("cn-social-financing", "社会融资规模增量", "流动性", "中国", "亿元", "月度", "mofcom", "shrzgm", "tiosfs"),
    indicator("cn-unemployment", "城镇调查失业率", "就业", "中国", "%", "月度", "nbs", "3888eac6062945a79c8a27e5f13d4953", "value"),
    indicator("us-cpi-yoy", "美国 CPI 同比", "通胀", "美国", "%", "月度", "fred", "CPIAUCSL", None, "yoy"),
    indicator("us-core-cpi-yoy", "美国核心 CPI 同比", "通胀", "美国", "%", "月度", "fred", "CPILFESL", None, "yoy"),
    indicator("us-unemployment", "美国失业率", "就业", "美国", "%", "月度", "fred", "UNRATE", None),
    indicator("us-nonfarm-change", "美国非农新增就业", "就业", "美国", "千人", "月度", "fred", "PAYEMS", None, "change"),
    indicator("us-fed-funds", "美国联邦基金利率", "利率", "美国", "%", "月度", "fred", "FEDFUNDS", None),
    indicator("us-treasury-10y", "美国 10 年期国债收益率", "利率", "美国", "%", "日度", "fred", "DGS10", None),
    indicator("us-treasury-2y", "美国 2 年期国债收益率", "利率", "美国", "%", "日度", "fred", "DGS2", None),
    indicator("us-gdp-growth", "美国实际 GDP 环比折年率", "增长", "美国", "%", "季度", "fred", "A191RL1Q225SBEA", None),
    indicator("us-consumer-sentiment", "美国消费者信心指数", "景气", "美国", "点", "月度", "fred", "UMCSENT", None),
    indicator("us-dollar-broad", "广义美元指数", "汇率", "美国", "点", "日度", "fred", "DTWEXBGS", None),
    indicator("us-initial-claims", "美国初请失业金人数", "就业", "美国", "人", "周度", "fred", "ICSA", None),
    indicator("usd-cny", "美元兑人民币", "汇率", "中国", "人民币/美元", "日度", "fred", "DEXCHUS", None),
]


def timestamp(date):
    return int(datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())


def valid_row(date, value):
    if value in (None, "", "."):
        return None
    number = float(value)
    if not math.isfinite(number):
        return None
    return {"date": date, "time": timestamp(date), "value": number}


class MacroProvider:
    def __init__(self):
        self.table_cache = {}

    def fetch(self, definition):
        source = definition["source"]
        if source == "eastmoney":
            rows = self.eastmoney(definition)
        elif source == "fred":
            rows = self.fred(definition)
        elif source == "mofcom":
            rows = self.mofcom(definition)
        elif source == "nbs":
            rows = self.nbs(definition)
        else:
            raise ValueError(f"未知宏观数据源: {source}")
        rows = sorted({row["time"]: row for row in rows}.values(), key=lambda row: row["time"])
        if not rows:
            raise ValueError(f"{definition['name']} 没有取得有效历史数据")
        return rows

    def eastmoney(self, definition):
        cached = self.table_cache.get(definition["code"])
        if cached and datetime.now(timezone.utc).timestamp() - cached[0] < 900:
            records = cached[1]
        else:
            records = []
            page = 1
            while True:
                query = urlencode({
                    "reportName": definition["code"], "columns": "ALL", "pageNumber": page,
                    "pageSize": 500, "sortColumns": definition["dateField"], "sortTypes": "-1",
                })
                payload = fetch_json(f"https://datacenter-web.eastmoney.com/api/data/v1/get?{query}", timeout=20, retries=1)
                result = payload.get("result") or {}
                page_records = result.get("data") or []
                if not payload.get("success") or not page_records:
                    raise ValueError(f"东方财富宏观数据不可用: {payload.get('message', '无数据')}")
                records.extend(page_records)
                if page >= int(result.get("pages") or 1):
                    break
                page += 1
            self.table_cache[definition["code"]] = (datetime.now(timezone.utc).timestamp(), records)
        rows = []
        for record in records:
            row = valid_row(record[definition["dateField"]][:10], record.get(definition["field"]))
            if row:
                rows.append(row)
        return rows

    @staticmethod
    def fred(definition):
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={quote(definition['code'])}"
        throttle(url)
        result = subprocess.run(["curl", "-fsS", "--max-time", "25", url], capture_output=True)
        if result.returncode:
            raise OSError(f"FRED 请求失败: {result.stderr.decode('utf-8', 'replace')}")
        text = result.stdout.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames or len(reader.fieldnames) < 2:
            raise ValueError(f"FRED 序列 {definition['code']} 返回格式不正确")
        rows = []
        for record in reader:
            row = valid_row(record[reader.fieldnames[0]], record[reader.fieldnames[1]])
            if row:
                rows.append(row)
        rows.sort(key=lambda row: row["time"])
        transform = definition.get("transform")
        if transform == "change":
            rows = [{**row, "value": row["value"] - rows[index - 1]["value"]} for index, row in enumerate(rows) if index]
        elif transform == "yoy":
            previous = {row["date"][:4] + row["date"][4:]: row["value"] for row in rows}
            result = []
            for row in rows:
                year = int(row["date"][:4])
                base = previous.get(f"{year - 1}{row['date'][4:]}")
                if base:
                    result.append({**row, "value": (row["value"] / base - 1) * 100})
            rows = result
        return rows

    @staticmethod
    def mofcom(definition):
        payload = post_json("https://data.mofcom.gov.cn/datamofcom/front/gnmy/shrzgmQuery", {})
        rows = []
        for record in payload:
            date = datetime.strptime(record["date"], "%Y%m").strftime("%Y-%m-01")
            row = valid_row(date, record.get(definition["field"]))
            if row:
                rows.append(row)
        return rows

    @staticmethod
    def nbs(definition):
        payload = {
            "cid": "ee3b7046b390415b9b7745e3d16f6052", "indicatorIds": [definition["code"]],
            "daCatalogId": "", "das": [{"text": "全国", "value": "000000000000"}],
            "dts": ["199001MM-203601MM"], "showType": "1", "rootId": "fc982599aa684be7969d7b90b1bd0e84",
        }
        data = post_json(
            "https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData", payload,
            headers={"Origin": "https://data.stats.gov.cn", "Referer": "https://data.stats.gov.cn/dg/website/page.html"},
        )
        today = datetime.now(timezone.utc).date().isoformat()
        rows = []
        for record in data.get("data", []):
            date = datetime.strptime(record["name"], "%Y年%m月").strftime("%Y-%m-01")
            if date > today:
                continue
            values = record.get("values") or []
            row = valid_row(date, values[0].get("value")) if values else None
            if row:
                rows.append(row)
        return rows
