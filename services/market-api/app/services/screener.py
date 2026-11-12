from time import monotonic, time


class ScreenerService:
    def __init__(self, provider, collector):
        self.provider = provider
        self.collector = collector

    def status(self):
        last_collection = self.provider.store.metadata("screener_fundamentals_at")
        boards_collection = self.provider.store.metadata("screener_boards_at")
        if not last_collection or time() - float(last_collection) > 86400 or not boards_collection:
            self.collector.ensure()
        return self.collector.status()

    def refresh(self):
        if not self.collector.ensure(force=True):
            raise ValueError("选股数据正在采集，请稍后查看进度")
        return self.collector.status()

    def sector_ids(self, name):
        cached = self.provider.store.sector_members([name])
        if name in cached and self.provider.store.metadata("sector_members_version") == "2":
            return cached[name]
        sectors = self.provider.sector_provider.sectors()
        sector = next((item for item in sectors if item["name"] == name), None)
        if not sector:
            raise ValueError(f"没有找到真实板块“{name}”，请从板块选项中选择")
        ids = self.provider.sector_provider.members(sector["id"])
        self.provider.store.save_sector_members(name, sorted(ids))
        return ids

    def run(self, payload):
        started = monotonic()
        stocks = self.provider.instruments()
        if payload.market == "CN":
            stocks = [stock for stock in stocks if stock["market"] in {"SH", "SZ", "BJ"}]
        elif payload.market != "all":
            stocks = [stock for stock in stocks if stock["market"] == payload.market]
        universe_size = len(stocks)
        fundamentals = self.provider.store.fundamentals()
        stocks = [{**stock, **fundamentals.get(stock["id"], {})} for stock in stocks]
        numeric_fields = {"dividend", "cap", "roe", "net", "debt", "price", "changePct", "amount", "turnover"}
        partial = any(stock.get(condition.field) is None for condition in payload.conditions if condition.field in numeric_fields for stock in stocks)
        for condition in payload.conditions:
            field, operator, value = condition.field, condition.operator, condition.value
            if field in {"industry", "concept"}:
                if operator not in {"include", "exclude"} or not str(value).strip():
                    raise ValueError("行业或概念条件需要选择属于/不属于，并提供名称")
            elif operator not in {"gte", "lte", "between"}:
                raise ValueError("数值条件只支持大于等于、小于等于或区间")
            if field in {"industry", "concept"}:
                members = self.sector_ids(str(value))
                def matches(stock):
                    raw = str(stock.get("industry") or "")
                    direct = field == "industry" and (str(value) in raw or str(value) == raw.rstrip("ⅡⅢ"))
                    found = stock["id"] in members or direct
                    return not found if operator == "exclude" else found
                stocks = [stock for stock in stocks if matches(stock)]
                if field == "industry" and operator == "include":
                    stocks = [{**stock, "industry": str(value)} if stock.get("industry") in {None, "", "未分类"} and stock["id"] in members else stock for stock in stocks]
                continue
            if operator == "between":
                if not isinstance(value, list) or len(value) != 2 or value[0] > value[1]:
                    raise ValueError("区间条件需要两个数值，且起点不能大于终点")
                stocks = [stock for stock in stocks if stock.get(field) is not None and value[0] <= stock[field] <= value[1]]
            elif operator in {"gte", "lte"}:
                stocks = [stock for stock in stocks if stock.get(field) is not None and (stock[field] >= float(value) if operator == "gte" else stock[field] <= float(value))]
        return {"stocks": stocks[:payload.limit], "count": len(stocks), "elapsedMs": round((monotonic() - started) * 1000), "universeSize": universe_size, "market": payload.market, "partial": partial}
