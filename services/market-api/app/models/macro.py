from typing import List, Literal, Optional
from pydantic import Field
from .base import CamelModel


class MacroIndicator(CamelModel):
    id: str
    name: str
    category: str
    region: str
    unit: str
    frequency: str
    latest: Optional[float] = None
    previous: Optional[float] = None
    change: Optional[float] = None
    time: Optional[int] = None
    points: int = 0
    source: str
    source_url: Optional[str] = None
    custom: bool = False
    refreshing: bool = False
    error: Optional[str] = None


class MacroPoint(CamelModel):
    time: int
    date: str
    value: float


class MacroSeries(CamelModel):
    id: str
    name: str
    unit: str
    category: str
    region: str
    source: str
    source_url: Optional[str] = None
    points: List[MacroPoint]
    refreshing: bool = False
    error: Optional[str] = None


class CustomMacroRequest(CamelModel):
    name: str = Field(min_length=1, max_length=50)
    category: str = Field(default="自定义", max_length=20)
    unit: str = Field(default="", max_length=20)
    kind: Literal["manual", "fred"] = "manual"
    code: str = Field(default="", max_length=50)
    content: str = ""
