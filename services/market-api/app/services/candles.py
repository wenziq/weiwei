import re
import time
from datetime import datetime

from ..providers.parsing import aggregate_candles


class CandleService:
    def __init__(self, provider, refresh_scheduler):
        self.provider = provider
        self.store = provider.store
        self.refresh_scheduler = refresh_scheduler

    @staticmethod
    def timestamp(value):
        if not value:
            return 0
        return datetime.fromisoformat(value).timestamp()

    def get(self, instrument_id, period="day", limit=500, adjustment="none", before=None):
        if not re.fullmatch(r"(?:sh|sz|bj|hk|us|index|sector|fx)-[\w.-]+", instrument_id):
            raise ValueError("证券代码格式不正确")
        daily = period in {"day", "week", "month"}
        if period == "day":
            candles = self.store.candles(instrument_id, "day", limit, adjustment, before)
        elif daily:
            candles = aggregate_candles(self.store.candles(instrument_id, "day", min(limit * (7 if period == "week" else 32), 100000), adjustment, before), period)[-limit:]
        else:
            candles = self.store.candles(instrument_id, period, limit, adjustment, before)
        if before is not None:
            return {
                "instrumentId": instrument_id, "period": period, "adjustment": adjustment,
                "source": candles[-1].get("source", "本机历史库") if candles else "本机历史库",
                "status": "cached" if candles else "unavailable", "servedBy": "database",
                "fetchedAt": candles[-1].get("fetchedAt") if candles else None,
                "refreshing": False, "partial": False,
                "message": None if candles else "本机暂无更早的历史记录",
                "candles": candles,
            }
        state = self.store.ingestion(instrument_id, "day" if daily else period, adjustment)
        incomplete = not candles or (daily and (not state or state["status"] != "complete")) or (not daily and len(candles) < min(limit, 30))
        last_fetched = self.timestamp(candles[-1].get("fetchedAt")) if candles else 0
        refresh_after = 900 if daily else 30 if period == "1m" else 60
        stale = time.time() - last_fetched > refresh_after
        if incomplete or stale:
            self.refresh_scheduler.enqueue(instrument_id, period, incomplete)
        refreshing = self.refresh_scheduler.pending_for(instrument_id, period)
        source = candles[-1].get("source", "本机历史库") if candles else "正在连接真实行情源"
        if period in {"week", "month"}:
            source += " · 本机聚合"
        message = None
        if not candles and refreshing:
            message = "正在从真实行情源准备历史数据，无需等待全量下载"
        elif incomplete:
            message = f"本机已有 {len(candles)} 根，后台继续补齐历史"
        elif refreshing:
            message = "本机数据已显示，后台更新最近行情"
        elif not candles:
            message = self.refresh_scheduler.error_for(instrument_id, period) or "暂无可显示的真实历史数据"
        if candles and candles[-1].get("source") == "当前成分等权回溯":
            note = "按当前成分股真实日线等权回溯，非官方板块指数，不追溯历史成分变化"
            message = f"{message}；{note}" if message else note
        return {
            "instrumentId": instrument_id, "period": period, "adjustment": adjustment,
            "source": source, "status": "cached" if candles else "unavailable",
            "servedBy": "database", "fetchedAt": candles[-1].get("fetchedAt") if candles else None,
            "refreshing": refreshing, "partial": incomplete, "message": message,
            "candles": candles,
        }
