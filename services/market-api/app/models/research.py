from typing import Any, Dict, List, Literal, Optional
from pydantic import field_validator
from .base import CamelModel


class ResearchDocument(CamelModel):
    id: str
    instrument_id: str
    title: str
    status: Literal["未研究", "待研究", "已完成", "已放弃"]
    attitude: str
    tags: List[str]
    content_markdown: str
    completed_at: Optional[str]
    review_at: Optional[str]
    updated_at: str
    history: List[Dict[str, Any]] = []


class ResearchUpdate(CamelModel):
    content_markdown: str
    tags: List[str]
    status: Literal["未研究", "待研究", "已完成", "已放弃"]
    attitude: str


class ResearchMetadataUpdate(CamelModel):
    status: Literal["未研究", "待研究", "已完成", "已放弃"]
    attitude: Literal["未设态度", "看好", "中性", "不看好"]
    tags: List[str]
    completed_at: Optional[str] = None
    review_at: Optional[str] = None

    @field_validator("completed_at", "review_at")
    @classmethod
    def validate_date(cls, value):
        if value is not None:
            from datetime import datetime
            datetime.strptime(value, "%Y-%m-%d")
        return value
