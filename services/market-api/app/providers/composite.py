import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from ..repositories.market_store import MarketStore
from .catalog import CatalogProvider
from .errors import NoMarketData
from .indices import INDEX_METADATA, INDEX_SYMBOLS, IndexProvider
from .sectors import SectorProvider
from .tencent import HK_NAMES, US_NAMES, TencentProvider
from .yahoo import YahooProvider

logger = logging.getLogger(__name__)


class CompositeMarketDataProvider:
    name = "东方财富 / 新浪 / 腾讯 / Yahoo"

    def __init__(self, data_dir):
        self.store = MarketStore(data_dir)
        aliases = {f"hk-{code}": name for code, name in HK_NAMES.items()} | {f"us-{code.lower()}": name for code, name in US_NAMES.items()}
        self.catalog = CatalogProvider(data_dir, self.store, aliases)
        self.eastmoney = self.catalog.eastmoney
        self.tencent = TencentProvider(self.eastmoney.resolve_bj_code)
        self.yahoo = YahooProvider()
        self.indices = IndexProvider()
        self.sector_provider = SectorProvider(self.store)
        self.index_candle_cache = {}
        self.index_candle_failures = {}
        self.index_quote_cache = {}
        self.index_quote_failures = {}
        self.snapshot_lock = threading.Lock()
        self.dashboard_refreshing = False
        self.sectors_refreshing = False
        self.last_dashboard_refresh = 0
        self.priority_ids = lambda: []
        self.research_documents = lambda: []
        self.restore_index_cache()

    def restore_index_cache(self):
        now = datetime.now(timezone.utc).timestamp()
        for instrument_id in INDEX_SYMBOLS:
            candles = self.store.candles(instrument_id, "day", 500)
            if not candles:
                continue
            source = candles[-1].get("source", "本机历史库")
            self.index_candle_cache[(instrument_id, "day", 500, "none")] = (now, candles, source)
            if len(candles) < 2:
                continue
            latest, previous = candles[-1], candles[-2]
            self.index_quote_cache[instrument_id] = (now, {
                "point": latest["close"], "changePct": (latest["close"] - previous["close"]) / previous["close"] * 100 if previous["close"] else None,
                "amount": latest["amount"] / 1e8 if latest.get("amount") is not None else None,
                "deltaPct": None, "dataSource": f"{source} · 最近收盘", "dataStatus": "cached",
                "quoteTime": datetime.fromtimestamp(latest["time"], timezone.utc).date().isoformat(),
                "marketState": "本机最近收盘",
            })

    def with_research_metadata(self, item):
        result = dict(item)
        document = next((item for item in self.research_documents() if item["instrumentId"] == result["id"]), None)
        if document:
            result["status"] = document["status"]
        return result

    def instruments(self):
        return [self.with_research_metadata(item) for item in self.catalog.instruments()]

    def get_instruments(self, instrument_ids):
        ids = list(dict.fromkeys(instrument_ids))
        items = {item["id"]: item for item in self.store.instruments(ids)}
        for instrument_id in ids:
            if instrument_id in items:
                continue
            item = self.catalog.get(instrument_id)
            if item:
                items[instrument_id] = item
        if not items:
            return []
        for item in items.values():
            if item["id"].startswith("bj-") and not item["code"].startswith("920"):
                try:
                    previous_code = item["code"]
                    item["code"] = self.eastmoney.resolve_bj_code(previous_code)
                    item["aliases"] = list(dict.fromkeys([*item.get("aliases", []), previous_code]))
                    self.store.save_instruments([item])
                except (OSError, ValueError) as error:
                    logger.warning("北交所代码显示映射暂不可用 %s: %s", item["id"], error)
        try:
            self.store.save_quotes(self.tencent.quote_many(items))
        except (OSError, ValueError, RuntimeError) as error:
            logger.warning("腾讯批量报价失败，使用Yahoo或本机快照: %s", error)
            with ThreadPoolExecutor(max_workers=4) as executor:
                def yahoo_quote(instrument_id):
                    if instrument_id.startswith("bj-"):
                        return None
                    try:
                        return self.yahoo.quote(instrument_id)
                    except (OSError, ValueError, KeyError) as quote_error:
                        logger.warning("Yahoo报价失败 %s: %s", instrument_id, quote_error)
                        return None
                quotes = list(executor.map(yahoo_quote, items))
                self.store.save_quotes([quote for quote in quotes if quote])
        result = []
        for instrument_id in ids:
            item = self.store.instruments([instrument_id])
            if not item:
                continue
            item = item[0]
            item["spark"] = [candle["close"] for candle in self.store.candles(instrument_id, "day", 14)]
            result.append(self.with_research_metadata(item))
        return result

    def get_instrument(self, instrument_id):
        return next(iter(self.get_instruments([instrument_id])), None)

    def catalog_search(self, query, limit=30, market=None):
        if not query.strip() and self.priority_ids():
            return self.get_instruments(self.priority_ids())[:limit]
        return [self.with_research_metadata(item) for item in self.catalog.search(query, limit, market)]

    def resolve_instrument(self, value):
        normalized = value.strip().lower()
        if not normalized:
            return None
        item = self.catalog.get(normalized)
        if item:
            return item["id"]
        matches = self.catalog.search(normalized, limit=30)
        exact = next((item for item in matches if item["code"].lower() == normalized or item["name"].lower() == normalized), None)
        if exact:
            return exact["id"]
        return matches[0]["id"] if len(matches) == 1 else None

    def catalog_quotes(self, instrument_ids):
        self.store.save_quotes(self.tencent.quote_many(instrument_ids))
        return self.store.instruments(instrument_ids)

    def dashboard(self):
        snapshot = self.store.snapshot("dashboard")
        if snapshot is not None:
            snapshot["dataStatus"] = "cached"
            self.refresh_dashboard_async()
            return snapshot
        self.last_dashboard_refresh = time.time()
        return self._fetch_and_save_dashboard()

    def _fetch_and_save_dashboard(self):
        data = self._fetch_dashboard()
        self.store.save_snapshot("dashboard", data)
        return data

    def refresh_dashboard_async(self):
        with self.snapshot_lock:
            if self.dashboard_refreshing or time.time() - self.last_dashboard_refresh < 15:
                return
            self.dashboard_refreshing = True
            self.last_dashboard_refresh = time.time()
            threading.Thread(target=self._refresh_dashboard, name="weiwei-dashboard-refresh", daemon=True).start()

    def _refresh_dashboard(self):
        try:
            self._fetch_and_save_dashboard()
        except Exception as error:
            logger.exception("看盘台后台刷新失败，保留本机快照: %s", error)
        finally:
            with self.snapshot_lock:
                self.dashboard_refreshing = False

    def _fetch_dashboard(self):
        with ThreadPoolExecutor(max_workers=3) as executor:
            index_future = executor.submit(self.indices.quotes)
            def cn_catalog():
                self.catalog.refresh(market="CN")
                return [item for item in self.store.instruments() if item["market"] in {"SH", "SZ", "BJ"}]
            catalog_future = executor.submit(cn_catalog)
            turnover_future = executor.submit(self.indices.turnover)
            try:
                quotes = index_future.result()
            except (OSError, ValueError, RuntimeError) as error:
                logger.warning("指数快照失败，使用最近快照或其他真实源: %s", error)
                quotes = self.indices.quote_cache
            catalog = catalog_future.result()
            try:
                turnover = turnover_future.result()
                turnover_cached = turnover.pop("stale", False)
            except (OSError, ValueError, RuntimeError) as error:
                logger.warning("成交额曲线暂不可用: %s", error)
                turnover_cached = True
                turnover = self.indices.turnover_cache or {"total": None, "deltaPct": None, "today": [], "previous": []}
        indices = []
        for base in INDEX_METADATA:
            quote = quotes.get(base["id"], {})
            indices.append({
                "id": base["id"], "name": base["name"], "code": base["code"], "group": base["group"],
                "point": quote.get("point"), "changePct": quote.get("changePct"),
                "amount": quote.get("amount"), "deltaPct": quote.get("deltaPct"),
                "marketState": quote.get("marketState", "暂无报价"), "spark": [],
                "dataSource": quote.get("dataSource", "暂无行情"),
                "dataStatus": quote.get("dataStatus", "unavailable"), "quoteTime": quote.get("quoteTime"),
            })
        def fallback_quote(item):
            instrument_id = item["id"]
            now = datetime.now(timezone.utc).timestamp()
            cached = self.index_quote_cache.get(instrument_id)
            if cached and now - cached[0] < 60:
                return instrument_id, {**cached[1], "dataStatus": "cached"}
            if now - self.index_quote_failures.get(instrument_id, 0) < 60:
                return instrument_id, {**cached[1], "dataStatus": "cached"} if cached else {}
            try:
                result = self.yahoo.quote(instrument_id)
                quote = {"point": result["price"], "changePct": result["changePct"], "dataSource": result["dataSource"], "dataStatus": "snapshot", "quoteTime": result["quoteTime"], "marketState": "真实行情快照"}
            except (OSError, ValueError, KeyError):
                try:
                    quote = self.indices.recent_quote(instrument_id)
                except (OSError, ValueError, KeyError, RuntimeError) as error:
                    self.index_quote_failures[instrument_id] = now
                    logger.warning("指数报价回退失败 %s: %s", instrument_id, error)
                    return instrument_id, {**cached[1], "dataStatus": "cached"} if cached else {}
            self.index_quote_cache[instrument_id] = (now, quote)
            self.index_quote_failures.pop(instrument_id, None)
            return instrument_id, quote
        with ThreadPoolExecutor(max_workers=4) as executor:
            fallbacks = dict(executor.map(fallback_quote, [item for item in indices if item["point"] is None]))
        for item in indices:
            item.update(fallbacks.get(item["id"], {}))
        def spark(item):
            try:
                series = self.candles(item["id"], "day", 30)
                return item["id"], [candle["close"] for candle in series["candles"][-14:]]
            except (OSError, ValueError, KeyError) as error:
                logger.warning("指数走势图失败 %s: %s", item["id"], error)
                return item["id"], [candle["close"] for candle in self.store.candles(item["id"], "day", 14)]
        with ThreadPoolExecutor(max_workers=6) as executor:
            sparks = dict(executor.map(spark, indices))
        for item in indices:
            item["spark"] = sparks[item["id"]]
        ranges = [(-100, -9.8, "≤-9.8", "跌幅 ≥9.8%", "negative"), (-9.8, -7, ">7", "跌幅 7–9.8%", "negative"), (-7, -5, "5-7", "跌幅 5–7%", "negative"), (-5, -3, "3-5", "跌幅 3–5%", "negative"), (-3, 0, "0-3", "跌幅 0–3%", "negative"), (0, 0.00001, "0", "平盘", "zero"), (0.00001, 3, "0-3", "涨幅 0–3%", "positive"), (3, 5, "3-5", "涨幅 3–5%", "positive"), (5, 7, "5-7", "涨幅 5–7%", "positive"), (7, 9.8, ">7", "涨幅 7–9.8%", "positive"), (9.8, 10000, "≥9.8", "涨幅 ≥9.8%", "positive")]
        breadth = []
        for lower, upper, label, description, side in ranges:
            def matches(item):
                change = item.get("changePct")
                if not item.get("price") or change is None:
                    return False
                if label == "0":
                    return abs(change) < 0.00001
                if label == "0-3" and side == "negative":
                    return -3 < change < 0
                if label == "0-3" and side == "positive":
                    return 0.00001 <= change < 3
                return lower <= change < upper
            breadth.append({"label": label, "range": description, "count": sum(1 for item in catalog if matches(item)), "side": side})
        return {
            "indices": indices, "sectors": self.sectors()[:6], "breadth": breadth, "turnover": turnover,
            "dataSource": "腾讯指数 · 东方财富 · 新浪 / 腾讯全市场目录",
            "dataStatus": "cached" if turnover_cached or any(item["dataStatus"] == "cached" for item in indices) else "snapshot", "quoteTime": datetime.now(timezone.utc).isoformat(),
        }

    def sectors(self):
        snapshot = self.store.snapshot("sectors")
        if snapshot is not None:
            self.refresh_sectors_async(snapshot["fetchedAt"])
            return [{**item, "dataStatus": "cached"} for item in snapshot["items"]]
        return self._fetch_and_save_sectors()

    def _fetch_and_save_sectors(self):
        items = self._fetch_sectors()
        self.store.save_snapshot("sectors", {"fetchedAt": time.time(), "items": items})
        return items

    def refresh_sectors_async(self, fetched_at):
        with self.snapshot_lock:
            if self.sectors_refreshing or time.time() - fetched_at < 60:
                return
            self.sectors_refreshing = True
            threading.Thread(target=self._refresh_sectors, name="weiwei-sectors-refresh", daemon=True).start()

    def _refresh_sectors(self):
        try:
            self._fetch_and_save_sectors()
        except Exception as error:
            logger.exception("板块后台刷新失败，保留本机快照: %s", error)
        finally:
            with self.snapshot_lock:
                self.sectors_refreshing = False

    def _fetch_sectors(self):
        try:
            sectors = self.sector_provider.sectors()
        except (OSError, ValueError, RuntimeError):
            if not self.sector_provider.cache:
                raise
            sectors = [{**item, "dataStatus": "cached"} for item in self.sector_provider.cache]
        def with_spark(item):
            candles = self.store.candles(item["id"], "day", 14)
            if not candles:
                return item
            result = {**item, "spark": [candle["close"] for candle in candles]}
            amounts = [candle.get("amount") for candle in candles[-2:]]
            if len(amounts) == 2 and all(amount is not None and amount > 0 for amount in amounts):
                result["amount"] = amounts[-1] / 1e8
                result["deltaPct"] = (amounts[-1] - amounts[0]) / amounts[0] * 100
            return result
        with ThreadPoolExecutor(max_workers=4) as executor:
            return list(executor.map(with_spark, sectors))

    def fetch_candles(self, instrument_id, period="day", limit=500, start=None, end=None, adjustment="none"):
        if not re.fullmatch(r"(?:sh|sz|bj|hk|us|index|sector|fx)-[\w.-]+", instrument_id):
            raise ValueError("证券代码格式不正确")
        if instrument_id.startswith("index-"):
            if instrument_id not in INDEX_SYMBOLS:
                raise KeyError(instrument_id)
            adjustment = "none"
            key = (instrument_id, period, limit, adjustment)
            now = datetime.now(timezone.utc).timestamp()
            if INDEX_SYMBOLS[instrument_id].startswith("bj"):
                cached = self.index_candle_cache.get(key)
                if cached and len(cached[1]) >= min(limit or 500, 5):
                    return cached[1][-limit:], cached[2], True
                try:
                    candles = self.eastmoney.candles(instrument_id, period, limit, adjustment="none")
                    self.index_candle_cache[key] = (now, candles, self.eastmoney.name)
                    return candles, self.eastmoney.name, True
                except (OSError, ValueError, KeyError, RuntimeError):
                    self.index_candle_failures[key] = now
                    if cached:
                        return cached[1][-limit:], cached[2], True
                    raise
            cached = self.index_candle_cache.get(key)
            if cached is None:
                cached = next((entry for (cached_id, cached_period, _, cached_adjustment), entry in self.index_candle_cache.items() if cached_id == instrument_id and cached_period == period and cached_adjustment == adjustment), None)
            if cached and now - cached[0] < (60 if period.endswith("m") else 300):
                return cached[1][-limit:], cached[2], True
            if now - self.index_candle_failures.get(key, 0) < 60:
                if cached:
                    return cached[1][-limit:], cached[2], True
                raise RuntimeError("指数历史源暂时不可用，请稍后重试")
            try:
                try:
                    candles, source = self.indices.candles(instrument_id, period, limit), self.indices.name
                except (OSError, ValueError, KeyError):
                    try:
                        candles, source = self.yahoo.candles(instrument_id, period, limit, adjustment="none"), self.yahoo.name
                    except (OSError, ValueError, KeyError):
                        candles, source = self.eastmoney.candles(instrument_id, period, limit, adjustment="none"), self.eastmoney.name
                self.index_candle_cache[key] = (now, candles, source)
                self.index_candle_failures.pop(key, None)
                return candles, source, True
            except (OSError, ValueError, KeyError, RuntimeError):
                self.index_candle_failures[key] = now
                if cached:
                    return cached[1], cached[2], True
                raise
        if instrument_id.startswith("sector-"):
            candles = self.sector_provider.candles(instrument_id, period, limit, start, end, adjustment)
            source = "同花顺板块" if instrument_id.startswith("sector-ths.") else "当前成分等权回溯"
            return candles, source, True
        providers = [self.eastmoney, self.yahoo] if instrument_id.startswith(("sh-", "sz-", "bj-")) else [self.yahoo, self.tencent]
        errors = []
        for provider in providers:
            try:
                candles = provider.candles(instrument_id, period, limit, start, end, adjustment)
                if candles:
                    source = getattr(provider, "candle_sources", {}).get((instrument_id, period, adjustment), provider.name)
                    return candles, source, source in {self.eastmoney.name, self.yahoo.name}
                errors.append((provider.name, NoMarketData("K线为空")))
            except (OSError, ValueError, KeyError, RuntimeError) as error:
                errors.append((provider.name, error))
        if errors and all(isinstance(error, NoMarketData) for _, error in errors):
            raise NoMarketData(str(errors[-1][1]))
        raise RuntimeError("；".join(f"{name}: {error}" for name, error in errors))

    def candles(self, instrument_id, period="day", limit=500, adjustment="none", before=None):
        return self.candle_service.get(instrument_id, period, limit, adjustment, before)
