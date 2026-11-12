from typing import List, Literal, Optional

from .base import CamelModel


class Account(CamelModel):
    id: str
    name: str
    type: Literal["实盘账户", "汇总账户", "模拟盘"]
    currency: Literal["CNY", "HKD", "USD"]
    description: str
    start: str
    initial: float
    commission: float
    min_fee: float
    stamp: float
    fill: str
    members: List[str]
    records: int
    archived: bool


class AccountInput(CamelModel):
    name: str
    type: Literal["实盘账户", "汇总账户", "模拟盘"]
    currency: Literal["CNY", "HKD", "USD"]
    description: str = ""
    initial: float = 0
    members: List[str] = []


class AccountUpdate(CamelModel):
    name: Optional[str] = None
    type: Optional[Literal["实盘账户", "汇总账户", "模拟盘"]] = None
    currency: Optional[Literal["CNY", "HKD", "USD"]] = None
    description: Optional[str] = None
    start: Optional[str] = None
    initial: Optional[float] = None
    commission: Optional[float] = None
    min_fee: Optional[float] = None
    stamp: Optional[float] = None
    fill: Optional[str] = None
    members: Optional[List[str]] = None
    archived: Optional[bool] = None


class AccountSummary(CamelModel):
    total_assets: float
    cash: float
    market_value: float
    day_pnl: float
    total_pnl: float
    time_weighted_return: float
    xirr: float
    max_drawdown: float
    benchmark_return: float
