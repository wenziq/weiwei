from typing import Optional

from fastapi import APIRouter, Query

from ...container import watchlist_service
from ...models.market import Instrument, TagUpdate, WatchlistData

router = APIRouter()


@router.get("", response_model=WatchlistData)
def list_watchlist(query: Optional[str] = None, tags: Optional[str] = None, tag_mode: str = Query(default="any", pattern="^(any|all)$")):
    return watchlist_service.list(query, tags, tag_mode)


@router.post("/{instrument_id}", response_model=Instrument)
def add_to_watchlist(instrument_id: str):
    return watchlist_service.add(instrument_id)


@router.delete("/{instrument_id}")
def remove_from_watchlist(instrument_id: str):
    return watchlist_service.remove(instrument_id)


@router.patch("/{instrument_id}/tags", response_model=Instrument)
def update_tags(instrument_id: str, payload: TagUpdate):
    return watchlist_service.set_tags(instrument_id, payload.tags)
