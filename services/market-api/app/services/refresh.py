import logging
import queue
import threading
import time

from ..providers.errors import NoMarketData

logger = logging.getLogger(__name__)


class RefreshScheduler:
    def __init__(self, history_collector):
        self.history_collector = history_collector
        self.queue = queue.Queue()
        self.pending = set()
        self.active = set()
        self.failed_at = {}
        self.errors = {}
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = None

    def start(self):
        with self.lock:
            self.stop_event.clear()
            if self.thread and self.thread.is_alive():
                return
            self.thread = threading.Thread(target=self.run, name="weiwei-ui-refresh", daemon=True)
            self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread and self.thread.is_alive() and threading.current_thread() != self.thread:
            self.queue.put(None)
            self.thread.join(timeout=2)

    def enqueue(self, instrument_id, period="day", full_history=False):
        key = (instrument_id, period, full_history)
        with self.lock:
            if key in self.pending or key in self.active:
                return
            if time.time() - self.failed_at.get(key, 0) < 60:
                return
            self.pending.add(key)
            self.queue.put(key)
        self.start()

    def pending_for(self, instrument_id, period):
        with self.lock:
            return any(key[0] == instrument_id and key[1] == period for key in self.pending | self.active)

    def error_for(self, instrument_id, period):
        with self.lock:
            return self.errors.get((instrument_id, period))

    def run(self):
        while not self.stop_event.is_set():
            try:
                task = self.queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if task is None:
                self.queue.task_done()
                if self.stop_event.is_set():
                    break
                continue
            instrument_id, period, full_history = task
            with self.lock:
                self.pending.discard(task)
                self.active.add(task)
            try:
                download_period = "day" if period in {"day", "week", "month"} else period
                self.history_collector.collect_one(instrument_id, download_period, full_history)
                with self.lock:
                    self.errors.pop((instrument_id, period), None)
                    self.failed_at.pop(task, None)
            except NoMarketData as error:
                with self.lock:
                    self.failed_at[task] = time.time()
                    self.errors[(instrument_id, period)] = str(error)
                logger.info("后台刷新无数据 %s %s: %s", instrument_id, period, error)
            except Exception as error:
                with self.lock:
                    self.failed_at[task] = time.time()
                    self.errors[(instrument_id, period)] = str(error)
                logger.exception("后台刷新失败 %s %s", instrument_id, period)
            finally:
                with self.lock:
                    self.active.discard(task)
                self.queue.task_done()
