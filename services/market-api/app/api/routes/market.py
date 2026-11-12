from typing import List, Literal, Optional

from fastapi import APIRouter, Body, HTTPException, Query

from ...container import history_collector, provider
from ...models.market import CandleSeries, DashboardData, HistoryRequest, HistoryStatus, Instrument, Sector

router = APIRouter()


@router.get("/dashboard", response_model=DashboardData)
def dashboard():
    return provider.dashboard()


@router.get("/sectors", response_model=List[Sector])
def sectors():
    return provider.sectors()


@router.get("/catalog/search", response_model=List[Instrument])
def catalog_search(query: str = "", limit: int = Query(default=30, ge=1, le=100), market: Optional[Literal["CN", "HK", "US"]] = None):
    return provider.catalog_search(query, limit, market)


@router.post("/catalog/quotes", response_model=List[Instrument])
def catalog_quotes(instrument_ids: List[str] = Body(min_length=1, max_length=40)):
    return provider.get_instruments(instrument_ids)


@router.get("/instruments/{instrument_id}/candles", response_model=CandleSeries)
def candles(
    instrument_id: str,
    period: Literal["day", "week", "month", "60m", "30m", "15m", "5m", "1m"] = "day",
    limit: int = Query(default=500, ge=1, le=50000),
    adjustment: Literal["none", "qfq", "hfq"] = "none",
    before: Optional[int] = Query(default=None, gt=0),
):
    return provider.candles(instrument_id, period, limit, adjustment, before=before)


@router.get("/history/status", response_model=HistoryStatus)
def history_status():
    return history_collector.status()


@router.post("/history/start", response_model=HistoryStatus)
def history_start(request: Optional[HistoryRequest] = None):
    if not history_collector.start(request.markets if request else None, request.priority_only if request else False):
        raise HTTPException(status_code=409, detail="历史采集正在运行，请先暂停当前任务")
    return history_collector.status()


@router.post("/history/stop", response_model=HistoryStatus)
def history_stop():
    history_collector.stop()
    return history_collector.status()
