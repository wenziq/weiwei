from typing import Dict, List, Literal, Optional, Union
from pydantic import Field

from .base import CamelModel
from .market import Instrument


class ScreenerCondition(CamelModel):
    field: Literal["dividend", "cap", "roe", "net", "debt", "industry", "concept", "price", "changePct", "amount", "turnover"]
    operator: Literal["gte", "lte", "between", "include", "exclude"]
    value: Union[float, str, List[float]]


class ScreenerRequest(CamelModel):
    conditions: List[ScreenerCondition]
    limit: int = Field(default=200, ge=1, le=1000)
    market: Literal["all", "CN", "HK", "US"] = "all"


class ScreenerResult(CamelModel):
    stocks: List[Instrument]
    count: int
    elapsed_ms: int
    universe_size: int
    market: str
    partial: bool


class MarketFinancialCoverage(CamelModel):
    total: int
    with_financials: int


class BoardCoverage(CamelModel):
    total: int
    covered: int


class ScreenerCoverage(CamelModel):
    universe_size: int
    markets: Dict[str, MarketFinancialCoverage]
    boards: BoardCoverage
    running: bool
    stage: str
    error: Optional[str] = None
    updated_at: Optional[float] = None
