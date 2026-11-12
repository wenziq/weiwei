from fastapi import APIRouter

from ...container import screener_service
from ...models.screener import ScreenerCoverage, ScreenerRequest, ScreenerResult

router = APIRouter()


@router.post("/run", response_model=ScreenerResult)
def run_screener(payload: ScreenerRequest):
    return screener_service.run(payload)


@router.get("/status", response_model=ScreenerCoverage)
def screener_status():
    return screener_service.status()


@router.post("/refresh", response_model=ScreenerCoverage)
def refresh_screener_data():
    return screener_service.refresh()
