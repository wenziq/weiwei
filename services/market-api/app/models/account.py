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


class AccountPosition(CamelModel):
    instrument_id: str
    name: str
    code: str
    market: str
    currency: Literal["CNY", "HKD", "USD"]
    quantity: float
    cost_price: float
    price: Optional[float]
    market_value: Optional[float]
    weight: Optional[float]
    unrealized_pnl: Optional[float]
    realized_pnl: float
    return_pct: Optional[float]


class AccountEquityPoint(CamelModel):
    date: str
    value: float


class AccountSummary(CamelModel):
    account_id: str
    currency: Literal["CNY", "HKD", "USD"]
    total_assets: Optional[float]
    cash: Optional[float]
    market_value: Optional[float]
    day_pnl: Optional[float]
    total_pnl: Optional[float]
    total_return: Optional[float]
    unrealized_pnl: Optional[float]
    realized_pnl: Optional[float]
    positions: List[AccountPosition]
    curve: List[AccountEquityPoint]
    warnings: List[str]
