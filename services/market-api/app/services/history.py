import json
import logging
import threading
import time

from ..core.config import settings
from ..providers.errors import NoMarketData

logger = logging.getLogger(__name__)


class HistoryCollector:
    def __init__(self, provider):
        self.provider = provider
        self.store = provider.store
        self.stop_event = threading.Event()
        self.thread = None
        self.lock = threading.Lock()
        self.download_locks = {}
        self.recent_requests = {}

    def start(self, markets=None, priority_only=False):
        with self.lock:
            if self.thread and self.thread.is_alive():
                return False
            requested_markets = tuple(markets or settings.history_markets)
            latest = self.store.latest_run()
            resume_from = None
            if latest and not priority_only and latest["status"] in {"running", "paused", "interrupted", "failed"} and set(json.loads(latest["markets"])) == set(requested_markets):
                resume_from = latest.get("current_id")
            if latest and latest["status"] == "running":
                self.store.update_run(latest["id"], status="interrupted", error="服务重启，采集已恢复", finished_at=self.store.now())
            self.stop_event.clear()
            run_id = self.store.create_run(list(requested_markets), "day")
            logger.info("历史任务 #%d 创建，上次任务 #%s，恢复位置 %s", run_id, latest.get("id") if latest else None, resume_from)
            self.thread = threading.Thread(target=self.run, args=(run_id, requested_markets, priority_only, resume_from), name="weiwei-history", daemon=True)
            self.thread.start()
            return True

    def stop(self):
        self.stop_event.set()
        if self.thread and self.thread.is_alive() and threading.current_thread() != self.thread:
            self.thread.join(timeout=2)

    def status(self):
        latest = self.store.latest_run() or {}
        return {
            "runId": latest.get("id"),
            "running": bool(self.thread and self.thread.is_alive()),
            "markets": json.loads(latest.get("markets", "[]")), "period": latest.get("period", "day"),
            "total": latest.get("total", 0), "completed": latest.get("completed", 0),
            "failed": latest.get("failed", 0), "rowsCollected": latest.get("rows_collected", 0),
            "currentId": latest.get("current_id"), "error": latest.get("error"),
            "startedAt": latest.get("started_at"), "updatedAt": latest.get("updated_at"),
            "finishedAt": latest.get("finished_at"), "runStatus": latest.get("status", "idle"),
            "stats": self.store.stats(),
        }

    def collect_one(self, instrument_id, period="day", full_history=True):
        key = (instrument_id, period)
        with self.lock:
            download_lock = self.download_locks.setdefault(key, threading.Lock())
        with download_lock:
            state = self.store.ingestion(instrument_id, period)
            recent = time.time() - self.recent_requests.get(key, 0) < (15 if period.endswith("m") else 60)
            if recent and (not full_history or state and state["status"] == "complete"):
                return {"count": 0, "source": "recent"}
            start = None if full_history and (not state or state["status"] != "complete") else state["last_time"] - 7 * 86400 if state and state.get("last_time") else None
            if instrument_id.startswith(("index-", "sector-")):
                history_limit = 500
            elif start is None and full_history:
                history_limit = None
            else:
                history_limit = 10000 if full_history else 500
            candles, source, complete = self.provider.fetch_candles(instrument_id, period, history_limit, start, time.time() + 86400)
            if period == "day" and not complete and instrument_id.startswith(("sh-", "sz-")):
                try:
                    full = self.provider.yahoo.candles(instrument_id, "day", history_limit, start, time.time() + 86400)
                    if len(full) > len(candles):
                        candles, source, complete = full, self.provider.yahoo.name, True
                except (OSError, ValueError, KeyError):
                    pass
            if not candles:
                if state:
                    self.recent_requests[key] = time.time()
                    return {"count": 0, "source": state.get("source") or "本机历史库", "complete": True}
                raise NoMarketData(f"{instrument_id} 没有可保存的历史K线")
            self.store.save_candles(instrument_id, period, candles, source)
            if period == "day":
                complete_state = bool(state and state["status"] == "complete") or full_history and complete
                error = None if complete_state else "当前源只提供有限历史，已保存已取得的数据"
                self.store.record_ingestion(instrument_id, period, "complete" if complete_state else "partial", source, error)
            else:
                self.store.record_ingestion(instrument_id, period, "complete", source)
            self.recent_requests[key] = time.time()
            return {"count": len(candles), "source": source, "complete": complete}

    def run(self, run_id, markets, priority_only, resume_from=None):
        try:
            for market in markets:
                self.provider.catalog.refresh(market=market)
            ids = set(self.store.market_ids(markets))
            priority = [item for item in self.provider.priority_ids() if item in ids]
            targets = priority if priority_only else priority + sorted(ids.difference(priority))
            if resume_from in targets:
                targets = targets[targets.index(resume_from):]
                logger.info("从上次位置继续历史采集: %s", resume_from)
            self.store.update_run(run_id, total=len(targets))
            logger.info("历史采集启动: %s，共 %d 只", markets, len(targets))
            completed = failed = collected = consecutive_failures = 0
            for instrument_id in targets:
                if self.stop_event.is_set():
                    break
                try:
                    result = self.collect_one(instrument_id)
                    collected += result["count"]
                    completed += 1
                    consecutive_failures = 0
                except NoMarketData as error:
                    failed += 1
                    consecutive_failures = 0
                    self.store.record_ingestion(instrument_id, "day", "unavailable", error=str(error)[:600])
                    logger.info("无可用历史数据，跳过 %s: %s", instrument_id, error)
                except (OSError, ValueError, KeyError, RuntimeError) as error:
                    failed += 1
                    consecutive_failures += 1
                    self.store.record_ingestion(instrument_id, "day", "failed", error=str(error)[:600])
                    logger.warning("历史采集失败 %s: %s", instrument_id, error)
                    if consecutive_failures >= 8:
                        self.store.update_run(run_id, status="paused", completed=completed, failed=failed, rows_collected=collected, current_id=instrument_id, error="上游连续失败，已暂停；修复网络后可继续采集", finished_at=self.store.now())
                        return
                self.store.update_run(run_id, completed=completed, failed=failed, rows_collected=collected, current_id=instrument_id)
                if (completed + failed) % 25 == 0:
                    logger.info("历史采集进度: %d/%d，失败 %d，本次取得 %d 根", completed + failed, len(targets), failed, collected)
                self.stop_event.wait(settings.history_interval_seconds)
            stopped = self.stop_event.is_set()
            self.store.update_run(run_id, status="paused" if stopped else "complete", completed=completed, failed=failed, rows_collected=collected, finished_at=self.store.now())
            logger.info("历史采集%s: 成功 %d，失败 %d，本次取得 %d 根", "暂停" if stopped else "完成", completed, failed, collected)
        except Exception as error:
            logger.exception("历史采集任务异常结束")
            self.store.update_run(run_id, status="failed", error=str(error), finished_at=self.store.now())
