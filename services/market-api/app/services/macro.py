import csv
import io
import itertools
import logging
import math
import queue
import re
import threading
import time
import uuid
from datetime import datetime, timezone

from ..providers.macro import BUILTIN_INDICATORS, MacroProvider, SOURCE_LABELS, timestamp

logger = logging.getLogger(__name__)


def manual_date(value):
    normalized = value.strip().replace("/", "-").replace(".", "-")
    if re.fullmatch(r"\d{6}", normalized):
        normalized = f"{normalized[:4]}-{normalized[4:]}"
    if re.fullmatch(r"\d{4}-\d{1,2}", normalized):
        normalized += "-01"
    return datetime.strptime(normalized, "%Y-%m-%d").date().isoformat()


class MacroService:
    def __init__(self, store):
        self.store = store
        self.provider = MacroProvider()
        self.lock = threading.Lock()
        self.pending = set()
        self.priority_pending = set()
        self.tasks = queue.PriorityQueue()
        self.counter = itertools.count()
        self.stop_event = threading.Event()
        self.thread = None

    def definitions(self):
        return [*BUILTIN_INDICATORS, *self.store.custom_macro_definitions()]

    def definition(self, indicator_id):
        return next((item for item in self.definitions() if item["id"] == indicator_id), None)

    def start(self):
        with self.lock:
            if self.thread and self.thread.is_alive():
                return
            self.stop_event.clear()
            self.thread = threading.Thread(target=self.run, name="weiwei-macro-history", daemon=True)
            self.thread.start()

    def stop(self):
        self.stop_event.set()
        self.tasks.put((-1, next(self.counter), ""))
        if self.thread and self.thread.is_alive() and threading.current_thread() != self.thread:
            self.thread.join(timeout=2)

    def ensure(self, ids=None, priority=False, force=False):
        selected = set(ids) if ids is not None else None
        definitions = [item for item in self.definitions() if selected is None or item["id"] in selected]
        now = time.time()
        queued = False
        with self.lock:
            for definition in definitions:
                indicator_id = definition["id"]
                state = self.store.macro_state(indicator_id)
                fresh = state and state.get("status") == "complete" and state.get("updated_at") and now - datetime.fromisoformat(state["updated_at"]).timestamp() < 21600
                if fresh and not force or indicator_id in self.priority_pending:
                    continue
                if indicator_id in self.pending and not priority:
                    continue
                if priority:
                    self.priority_pending.add(indicator_id)
                self.pending.add(indicator_id)
                self.tasks.put((0 if priority else 1, next(self.counter), indicator_id))
                queued = True
        if queued:
            self.start()
        return queued

    def run(self):
        while not self.stop_event.is_set():
            try:
                _, _, indicator_id = self.tasks.get(timeout=0.5)
            except queue.Empty:
                continue
            if not indicator_id:
                self.tasks.task_done()
                break
            try:
                with self.lock:
                    if indicator_id not in self.pending:
                        continue
                definition = self.definition(indicator_id)
                if not definition:
                    continue
                rows = self.provider.fetch(definition)
                if not self.definition(indicator_id):
                    continue
                self.store.save_macro_points(indicator_id, rows)
                self.store.set_macro_state(indicator_id, "complete")
                logger.info("宏观指标历史已更新: %s，%d 个观测值", definition["name"], len(rows))
            except Exception as error:
                logger.warning("宏观指标更新失败 %s: %s", indicator_id, error)
                self.store.set_macro_state(indicator_id, "failed", str(error)[:500])
            finally:
                with self.lock:
                    self.pending.discard(indicator_id)
                    self.priority_pending.discard(indicator_id)
                self.tasks.task_done()

    def metadata(self, definition):
        latest = self.store.macro_latest([definition["id"]]).get(definition["id"], {})
        state = self.store.macro_state(definition["id"])
        with self.lock:
            refreshing = definition["id"] in self.pending
        return {
            "id": definition["id"], "name": definition["name"], "category": definition["category"],
            "region": definition["region"], "unit": definition["unit"], "frequency": definition["frequency"],
            "latest": latest.get("latest"), "previous": latest.get("previous"), "change": latest.get("change"),
            "time": latest.get("time"), "points": latest.get("points", 0),
            "source": definition["dataSource"], "sourceUrl": definition.get("sourceUrl"),
            "custom": definition["custom"], "refreshing": refreshing,
            "error": None if refreshing else state.get("error"),
        }

    def list(self):
        self.ensure()
        return [self.metadata(item) for item in self.definitions()]

    def series(self, ids):
        definitions = []
        for indicator_id in ids:
            definition = self.definition(indicator_id)
            if not definition:
                raise KeyError(indicator_id)
            definitions.append(definition)
        self.ensure(ids, priority=True)
        return [{**self.metadata(item), "points": self.store.macro_points(item["id"])} for item in definitions]

    def create(self, payload):
        name = payload.name.strip()
        if not name:
            raise ValueError("指标名称不能为空")
        indicator_id = f"custom-{uuid.uuid4().hex[:12]}"
        manual = payload.kind == "manual"
        code = payload.code.strip().upper()
        if not manual and not re.fullmatch(r"[A-Z0-9_.-]+", code):
            raise ValueError("请输入有效的 FRED 序列代码，例如 DGS10")
        definition = {
            "id": indicator_id, "name": name, "category": payload.category.strip() or "自定义",
            "region": "自定义", "unit": payload.unit.strip(), "frequency": "自定义",
            "source": payload.kind, "code": code, "field": None, "transform": None,
            "dateField": "REPORT_DATE", "dataSource": "个人录入" if manual else SOURCE_LABELS["fred"],
            "sourceUrl": f"https://fred.stlouisfed.org/series/{code}" if not manual else None,
            "custom": True,
        }
        self.store.save_macro_definition(definition)
        if manual:
            rows = self.parse_manual(payload.content)
            self.store.save_macro_points(indicator_id, rows)
            self.store.set_macro_state(indicator_id, "complete")
        else:
            self.ensure([indicator_id], priority=True, force=True)
        return self.metadata(definition)

    def delete(self, indicator_id):
        definition = self.definition(indicator_id)
        if not definition:
            raise KeyError(indicator_id)
        if not definition["custom"]:
            raise ValueError("内置指标不能删除，可在页面取消选择")
        self.store.delete_macro_definition(indicator_id)
        return {"deleted": True, "id": indicator_id}

    @staticmethod
    def parse_manual(content):
        rows = {}
        for line_number, record in enumerate(csv.reader(io.StringIO(content)), start=1):
            if not record or not any(cell.strip() for cell in record):
                continue
            if len(record) == 1 and "\t" in record[0]:
                record = record[0].split("\t")
            if len(record) < 2:
                raise ValueError(f"第 {line_number} 行需要“日期,数值”两列")
            date_text, value_text = record[0].strip(), record[1].strip()
            if line_number == 1 and date_text in {"日期", "date", "Date"}:
                continue
            try:
                date = manual_date(date_text)
                value = float(value_text)
                if not math.isfinite(value):
                    raise ValueError
                rows[date] = {"date": date, "time": timestamp(date), "value": value}
            except ValueError as error:
                raise ValueError(f"第 {line_number} 行格式不正确，请使用 2026-01-31,123.45") from error
        if not rows:
            raise ValueError("请至少提供一行有效的历史数据")
        return [rows[date] for date in sorted(rows)]
