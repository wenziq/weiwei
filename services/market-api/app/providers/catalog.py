import logging
import threading
import time

from .eastmoney import EastMoneyProvider
from .exchange_catalog import hongkong_catalog, us_catalog
from .parsing import search_names

logger = logging.getLogger(__name__)


class CatalogProvider:
    def __init__(self, data_dir, store, aliases=None):
        self.store = store
        self.aliases = aliases or {}
        self.eastmoney = EastMoneyProvider(data_dir)
        self.lock = threading.RLock()

    def localize(self, items):
        for item in items:
            alias = self.aliases.get(item["id"])
            if alias and item["name"] != alias:
                item["officialName"] = item["name"]
                item["aliases"] = [item["name"]]
                item["name"] = alias
                item.update(search_names(alias))
        return items

    def refresh(self, force=False, market=None):
        with self.lock:
            for name, loader in [("CN", self.eastmoney.instruments), ("HK", hongkong_catalog), ("US", us_catalog)]:
                if market and name != market:
                    continue
                success = float(self.store.metadata(f"catalog_{name}") or 0)
                attempt = float(self.store.metadata(f"catalog_{name}_attempt") or 0)
                if not force and (time.time() - success < 21600 or time.time() - attempt < 300):
                    continue
                try:
                    items = self.localize(self.eastmoney.instruments(force=True) if force and name == "CN" else loader())
                    if not items:
                        raise ValueError(f"{name} 证券目录为空")
                    self.store.save_instruments(items)
                    if name == "CN":
                        self.store.save_quotes(items)
                    self.store.set_metadata(f"catalog_{name}", str(time.time()))
                    logger.info("%s 证券目录已更新: %d 只", name, len(items))
                except (OSError, ValueError, KeyError, RuntimeError) as error:
                    logger.warning("%s 证券目录更新失败，将使用本机目录: %s", name, error)
                finally:
                    self.store.set_metadata(f"catalog_{name}_attempt", str(time.time()))

    def refresh_async(self):
        with self.lock:
            if getattr(self, "refreshing", False):
                return
            now = time.time()
            stale = any(now - float(self.store.metadata(f"catalog_{market}") or 0) >= 21600 and now - float(self.store.metadata(f"catalog_{market}_attempt") or 0) >= 300 for market in ["CN", "HK", "US"])
            if not stale:
                return
            self.refreshing = True
        def update():
            try:
                self.refresh()
            finally:
                self.refreshing = False
        threading.Thread(target=update, name="weiwei-catalog-refresh", daemon=True).start()

    def instruments(self):
        if not self.store.metadata("catalog_CN"):
            self.refresh()
        else:
            self.refresh_async()
        return self.store.instruments()

    def search(self, query, limit=30, market=None):
        if not self.store.metadata("catalog_CN"):
            self.refresh()
        else:
            self.refresh_async()
        return self.store.search(query, limit, market)

    def get(self, instrument_id):
        if not self.store.metadata("catalog_CN"):
            self.refresh()
        else:
            self.refresh_async()
        return next(iter(self.store.instruments([instrument_id])), None)
