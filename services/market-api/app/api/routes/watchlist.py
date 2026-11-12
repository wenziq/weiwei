from typing import List, Optional

from fastapi import APIRouter, Query

from ...container import provider, watchlist_service
from ...models.market import Instrument, TagUpdate, WatchGroup, WatchGroupInput, WatchlistData, WatchlistMembership

router = APIRouter()


@router.get("", response_model=WatchlistData)
def list_watchlist(
    group: Optional[str] = None,
    query: Optional[str] = None,
    tags: Optional[str] = None,
    tag_mode: str = Query(default="any", pattern="^(any|all)$"),
):
    return watchlist_service.list(group, query, tags, tag_mode)


@router.post("/groups", response_model=WatchGroup)
def create_group(payload: WatchGroupInput):
    return watchlist_service.create_group(payload.name)


@router.delete("/groups/{name}")
def delete_group(name: str):
    return watchlist_service.delete_group(name)


@router.post("/{instrument_id}", response_model=Instrument)
def add_to_watchlist(instrument_id: str, payload: WatchlistMembership):
    return watchlist_service.add_to_group(instrument_id, payload.group)


@router.delete("/{instrument_id}")
def remove_from_watchlist(instrument_id: str, group: str = "观察"):
    return watchlist_service.remove_from_group(instrument_id, group)


@router.patch("/{instrument_id}/tags", response_model=Instrument)
def update_tags(instrument_id: str, payload: TagUpdate):
    return watchlist_service.set_tags(instrument_id, payload.tags)
