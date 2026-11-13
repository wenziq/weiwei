from typing import List

from fastapi import APIRouter

from ...container import account_service
from ...models.account import Account, AccountInput, AccountSummary, AccountUpdate
from ...models.transaction import Transaction, TransactionImportInput, TransactionImportResult, TransactionInput

router = APIRouter()


@router.get("", response_model=List[Account])
def list_accounts():
    return account_service.list()


@router.get("/summary", response_model=AccountSummary)
def account_summary(account_id: str = "all"):
    return account_service.summary(account_id)


@router.post("", response_model=Account)
def create_account(payload: AccountInput):
    return account_service.create(payload)


@router.get("/{account_id}/transactions", response_model=List[Transaction])
def list_transactions(account_id: str):
    return account_service.transactions(account_id)


@router.post("/{account_id}/transactions", response_model=Transaction)
def create_transaction(account_id: str, payload: TransactionInput):
    return account_service.create_transaction(account_id, payload)


@router.post("/{account_id}/transactions/import", response_model=TransactionImportResult)
def import_transactions(account_id: str, payload: TransactionImportInput):
    return account_service.import_transactions(account_id, payload.content)


@router.patch("/{account_id}", response_model=Account)
def update_account(account_id: str, payload: AccountUpdate):
    return account_service.update(account_id, payload)


@router.delete("/{account_id}")
def delete_account(account_id: str):
    return account_service.delete(account_id)
