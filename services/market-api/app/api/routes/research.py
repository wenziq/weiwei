from typing import List

from fastapi import APIRouter

from ...container import research_service
from ...models.research import ResearchDocument, ResearchMetadataUpdate, ResearchUpdate

router = APIRouter()


@router.get("", response_model=List[ResearchDocument])
def list_research():
    return research_service.list()


@router.get("/{document_id}", response_model=ResearchDocument)
def get_research(document_id: str):
    return research_service.get(document_id)


@router.post("/{document_id}", response_model=ResearchDocument)
def create_research(document_id: str):
    return research_service.create(document_id)


@router.put("/{document_id}", response_model=ResearchDocument)
def update_research(document_id: str, payload: ResearchUpdate):
    return research_service.update(document_id, payload)


@router.patch("/{document_id}", response_model=ResearchDocument)
def update_research_metadata(document_id: str, payload: ResearchMetadataUpdate):
    return research_service.update_metadata(document_id, payload)
