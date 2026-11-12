from fastapi import APIRouter, HTTPException

from ...container import ai_service
from ...models.ai import AIChatInput, AIConfigInput, AIQueryInput, AIStatus

router = APIRouter()


@router.get("/status", response_model=AIStatus)
def status():
    return ai_service.status()


@router.post("/config", response_model=AIStatus)
def configure(payload: AIConfigInput):
    try:
        return ai_service.configure(payload, payload.api_key)
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"AI 配置保存失败: {error}") from error


@router.delete("/key", response_model=AIStatus)
def clear_key():
    return ai_service.clear_key()


@router.post("/test")
def test_connection():
    try:
        return ai_service.request("只回复“连接正常”")
    except OSError as error:
        raise HTTPException(status_code=502, detail=f"AI 服务连接失败: {error}") from error


@router.post("/chat/{instrument_id}")
def chat(instrument_id: str, payload: AIChatInput):
    try:
        return ai_service.chat(instrument_id, payload)
    except OSError as error:
        raise HTTPException(status_code=502, detail=f"AI 服务连接失败: {error}") from error


@router.post("/parse-screener")
def parse_screener(payload: AIQueryInput):
    try:
        return ai_service.parse_screener(payload.query)
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"AI 条件解析失败: {error}") from error
