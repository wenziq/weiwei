from typing import Dict, List, Literal, Optional

from .base import CamelModel

DataStatus = Literal["snapshot", "cached", "unavailable"]


class IndexQuote(CamelModel):
    id: str
    name: str
    code: str
    group: str
    point: Optional[float]
    change_pct: Optional[float]
    amount: Optional[float]
    delta_pct: Optional[float]
    market_state: str
    spark: List[float]
    data_source: str = "未知"
    data_status: DataStatus = "unavailable"
    quote_time: Optional[str] = None


class Sector(CamelModel):
    id: str
    name: str
    type: Literal["行业", "概念", "自定义"]
    change_pct: Optional[float]
    amount: Optional[float]
    delta_pct: Optional[float]
    up: Optional[int]
    down: Optional[int]
    leader: str
    leader_change_pct: Optional[float]
    flow: Optional[float]
    etf: str
    spark: List[float]
    data_source: str = "未知"
    data_status: DataStatus = "unavailable"
    quote_time: Optional[str] = None


class BreadthBucket(CamelModel):
    label: str
    range: str
    count: int
    side: Literal["negative", "zero", "positive"]


class TurnoverComparison(CamelModel):
    total: Optional[float]
    delta_pct: Optional[float]
    today: List[float]
    previous: List[Optional[float]]


class DashboardData(CamelModel):
    indices: List[IndexQuote]
    sectors: List[Sector]
    breadth: List[BreadthBucket]
    turnover: TurnoverComparison
    data_source: str = "未知"
    data_status: DataStatus = "unavailable"
    quote_time: Optional[str] = None


class Instrument(CamelModel):
    id: str
    name: str
    code: str
    market: str
    price: Optional[float]
    currency: str
    change_pct: Optional[float]
    amount: Optional[float]
    delta_pct: Optional[float]
    turnover: Optional[float]
    since_pct: float
    industry: str
    status: str
    tags: List[str]
    spark: List[float]
    cap: Optional[float]
    dividend: Optional[float]
    roe: Optional[float]
    net: Optional[float]
    debt: Optional[float]
    financial_source: Optional[str] = None
    financial_report: Optional[str] = None
    data_source: str = "未知"
    data_status: DataStatus = "unavailable"
    quote_time: Optional[str] = None


class WatchlistData(CamelModel):
    stocks: List[Instrument]
    tags: List[str]


class TagUpdate(CamelModel):
    tags: List[str]


class Candle(CamelModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    amount: Optional[float] = None


class CandleSeries(CamelModel):
    instrument_id: str
    period: str
    adjustment: str
    source: str
    status: DataStatus
    served_by: str
    fetched_at: Optional[str]
    refreshing: bool = False
    partial: bool = False
    message: Optional[str] = None
    candles: List[Candle]


class HistoryRequest(CamelModel):
    markets: List[Literal["CN", "HK", "US", "SECTORS"]] = ["CN", "HK", "US"]
    priority_only: bool = False
    resume: bool = True


class MarketHistoryStats(CamelModel):
    instruments: int
    with_history: int
    rows: int


class HistoryStats(CamelModel):
    instruments: int
    candles: int
    database_bytes: int
    markets: Dict[str, MarketHistoryStats]


class HistoryStatus(CamelModel):
    run_id: Optional[int]
    running: bool
    markets: List[str]
    period: str
    total: int
    completed: int
    failed: int
    rows_collected: int
    current_id: Optional[str]
    error: Optional[str]
    started_at: Optional[str]
    updated_at: Optional[str]
    finished_at: Optional[str]
    run_status: str
    stats: HistoryStats
