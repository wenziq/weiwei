from typing import List, Literal, Optional
from pydantic import Field
from .base import CamelModel


class TransactionInput(CamelModel):
    type: Literal["buy", "sell", "deposit", "withdraw"]
    instrument_id: Optional[str] = None
    quantity: Optional[float] = None
    price: Optional[float] = None
    amount: Optional[float] = None
    fee: float = 0
    date: str
    note: str = ""


class Transaction(TransactionInput):
    id: str
    account_id: str
    amount: float
    created_at: str


class TransactionImportInput(CamelModel):
    content: str = Field(min_length=1, max_length=5_000_000)


class TransactionImportResult(CamelModel):
    imported: int
    transaction_ids: List[str]
