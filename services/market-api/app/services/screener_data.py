import logging
import threading
import time

from ..providers.fundamentals import EastMoneyFundamentals

logger = logging.getLogger(__name__)


class ScreenerDataCollector:
    def __init__(self, provider):
        self.provider = provider
        self.store = provider.store
        self.fundamentals = EastMoneyFundamentals()
        self.lock = threading.Lock()
        self.thread = None
        self.stage = "idle"
        self.error = None
        self.started_at = 0
        self.finished_at = 0

    @property
    def running(self):
        return bool(self.thread and self.thread.is_alive())

    def ensure(self, force=False):
        with self.lock:
            if self.running or not force and self.started_at and time.time() - self.started_at < 3600:
                return False
            self.started_at = time.time()
            self.stage = "准备全市场数据"
            self.error = None
            self.thread = threading.Thread(target=self.run, name="weiwei-screener-data", daemon=True)
            self.thread.start()
            return True

    def run(self):
        try:
            self.stage = "更新证券目录与行业"
            self.provider.catalog.refresh(force=True, market="CN")
            self.stage = "采集全市场财务与分红"
            records = self.fundamentals.collect(self.provider)
            self.store.save_fundamentals(records)
            self.store.set_metadata("screener_fundamentals_at", str(time.time()))
            self.stage = "采集真实行业与概念成分"
            sectors = self.provider.sector_provider.sectors()
            failures = 0
            for sector in sectors:
                try:
                    ids = self.provider.sector_provider.members(sector["id"])
                    self.store.save_sector_members(sector["name"], sorted(ids))
                except (OSError, ValueError, KeyError, RuntimeError) as error:
                    failures += 1
                    logger.warning("板块成分暂不可用 %s: %s", sector["name"], error)
            self.store.set_metadata("screener_boards_at", str(time.time()))
            self.store.set_metadata("sector_members_version", "2")
            if failures:
                self.error = f"{failures} 个板块的成分暂未采集成功，可稍后重新采集"
            self.stage = "完成"
            logger.info("选股数据后台采集完成: %d 个板块，%d 个失败", len(sectors), failures)
        except Exception as error:
            logger.exception("选股数据采集失败")
            self.error = str(error)
            self.stage = "失败"
        finally:
            self.finished_at = time.time()

    def status(self):
        metrics = self.store.fundamentals()
        universe = self.store.instruments()
        markets = {}
        for market, ids in [("CN", ("sh-", "sz-", "bj-")), ("HK", ("hk-",)), ("US", ("us-",))]:
            selected = [item for item in universe if item["id"].startswith(ids)]
            markets[market] = {"total": len(selected), "withFinancials": sum(item["id"] in metrics for item in selected)}
        members = self.store.sector_members()
        known = self.provider.sector_provider.known_sectors()
        return {
            "universeSize": len(universe), "markets": markets,
            "boards": {"total": len(known), "covered": sum(item["name"] in members for item in known)},
            "running": self.running, "stage": self.stage, "error": self.error,
            "updatedAt": self.finished_at or None,
        }
