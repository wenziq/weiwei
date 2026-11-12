from typing import List, Literal, Optional

from .base import CamelModel


class AIConfigInput(CamelModel):
    provider: str = "openai"
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4.1-mini"
    api_key: Optional[str] = None


class AIStatus(CamelModel):
    provider: str
    base_url: str
    model: str
    configured: bool
    key_source: Optional[str] = None


class AIChatMessage(CamelModel):
    role: Literal["user", "assistant"]
    content: str


class AIChatInput(CamelModel):
    message: str
    history: List[AIChatMessage] = []


class AIQueryInput(CamelModel):
    query: str
