from typing import List
from fastapi import APIRouter, Query

from ...container import macro_service
from ...models.macro import CustomMacroRequest, MacroIndicator, MacroSeries

router = APIRouter()


@router.get("/indicators", response_model=List[MacroIndicator])
def indicators():
    return macro_service.list()


@router.get("/series", response_model=List[MacroSeries])
def series(ids: str = Query(default="")):
    selected = list(dict.fromkeys(item.strip() for item in ids.split(",") if item.strip()))
    if len(selected) > 6:
        raise ValueError("一次最多对比 6 个指标")
    return macro_service.series(selected)


@router.post("/custom", response_model=MacroIndicator)
def create_custom(payload: CustomMacroRequest):
    return macro_service.create(payload)


@router.delete("/custom/{indicator_id}")
def delete_custom(indicator_id: str):
    return macro_service.delete(indicator_id)
