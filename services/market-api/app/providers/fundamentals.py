import logging
from datetime import datetime
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from .http import fetch_json

logger = logging.getLogger(__name__)


class EastMoneyFundamentals:
    endpoint = "https://datacenter.eastmoney.com/securities/api/data/v1/get"
    columns = "SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_DATE_NAME,NOTICE_DATE,ROEJQ,XSJLL,ZCFZL"

    def report(self, name, columns, filter_text, sort="SECURITY_CODE"):
        first = self.page(name, columns, filter_text, 1, sort)
        result = first.get("result") or {}
        rows = list(result.get("data") or [])
        pages = int(result.get("pages") or 0)
        for page in range(2, pages + 1):
            payload = self.page(name, columns, filter_text, page, sort)
            rows.extend((payload.get("result") or {}).get("data") or [])
        return rows

    def page(self, name, columns, filter_text, page, sort):
        query = urlencode({"reportName": name, "columns": columns, "filter": filter_text, "pageNumber": page, "pageSize": 500, "sortTypes": 1, "sortColumns": sort, "source": "HSF10", "client": "PC"})
        payload = fetch_json(f"{self.endpoint}?{query}", timeout=20, retries=1)
        if not payload.get("success"):
            raise ValueError(f"东方财富财务数据接口返回失败: {payload.get('message')}")
        return payload

    @staticmethod
    def instrument_id(row):
        code = row.get("SECUCODE") or ""
        code, market = code.split(".", 1) if "." in code else (row.get("SECURITY_CODE"), "")
        if market not in {"SH", "SZ", "BJ"} or not code:
            return None
        return f"{market.lower()}-{code}"

    def collect(self, provider):
        now = datetime.now(ZoneInfo("Asia/Shanghai")).date()
        periods = [f"{now.year}-{month_day}" for month_day in ["03-31", "06-30", "09-30", "12-31"]]
        periods = [period for period in periods if period <= now.isoformat()][-2:]
        metrics = {}
        report_dates = {}
        for period in reversed(periods):
            rows = self.report("RPT_F10_FINANCE_MAINFINADATA", self.columns, f"(REPORT_DATE='{period}')")
            logger.info("东方财富 %s 财务报告记录: %d", period, len(rows))
            for row in rows:
                instrument_id = self.instrument_id(row)
                if instrument_id and instrument_id not in metrics:
                    metrics[instrument_id] = {"roe": row.get("ROEJQ"), "net": row.get("XSJLL"), "debt": row.get("ZCFZL")}
                    report_dates[instrument_id] = row.get("REPORT_DATE_NAME") or period
        start = now.replace(year=now.year - 1).isoformat()
        dividend_columns = "SECUCODE,SECURITY_CODE,PRETAX_BONUS_RMB,EX_DIVIDEND_DATE,ASSIGN_PROGRESS,REPORT_DATE"
        rows = self.report("RPT_SHAREBONUS_DET", dividend_columns, f"(EX_DIVIDEND_DATE>='{start}')", "EX_DIVIDEND_DATE")
        dividends = {}
        for row in rows:
            instrument_id = self.instrument_id(row)
            date = (row.get("EX_DIVIDEND_DATE") or "")[:10]
            value = row.get("PRETAX_BONUS_RMB")
            if not instrument_id or not date or not start <= date <= now.isoformat() or "实施" not in str(row.get("ASSIGN_PROGRESS")) or value is None:
                continue
            dividends[instrument_id] = dividends.get(instrument_id, 0) + float(value) / 10
        prices = {item["id"]: item.get("price") for item in provider.store.instruments()}
        records = []
        for instrument_id, values in metrics.items():
            price = prices.get(instrument_id)
            dividend = dividends.get(instrument_id, 0) / price * 100 if price and price > 0 else None
            records.append({"instrumentId": instrument_id, **values, "dividend": dividend, "financialSource": "东方财富财报与分红", "financialReport": report_dates[instrument_id]})
        logger.info("全市场财务记录整理完成: %d 只；近一年有实施分红 %d 只", len(records), len(dividends))
        return records
