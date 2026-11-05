from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..common import get_owned
from ..db import get_db
from ..models import Account, Transaction, User
from ..security import current_user
from ..services.balances import balances, is_liability

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

AccountType = Literal["bank", "cash", "credit_card", "loan", "other_debt"]


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: AccountType
    institution: str | None = Field(default=None, max_length=120)
    opening_balance: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    is_archived: bool = False


class AccountOut(BaseModel):
    id: int
    name: str
    type: str
    institution: str | None
    opening_balance: Decimal
    is_archived: bool
    is_liability: bool
    balance: Decimal


def _out(a: Account, balance: Decimal) -> AccountOut:
    return AccountOut(
        id=a.id,
        name=a.name,
        type=a.type,
        institution=a.institution,
        opening_balance=a.opening_balance,
        is_archived=a.is_archived,
        is_liability=is_liability(a),
        balance=balance,
    )


@router.get("", response_model=list[AccountOut])
def list_accounts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [_out(a, bal) for a, bal in balances(db, user.id)]


@router.post("", response_model=AccountOut, status_code=201)
def create_account(data: AccountIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    account = Account(user_id=user.id, **data.model_dump())
    db.add(account)
    db.commit()
    return _out(account, account.opening_balance)


@router.put("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int, data: AccountIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    account = get_owned(db, Account, account_id, user.id, "Account")
    for key, value in data.model_dump().items():
        setattr(account, key, value)
    db.commit()
    bal = dict((a.id, b) for a, b in balances(db, user.id))[account.id]
    return _out(account, bal)


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    account = get_owned(db, Account, account_id, user.id, "Account")
    used = db.scalar(
        select(Transaction.id)
        .where(or_(Transaction.account_id == account.id, Transaction.to_account_id == account.id))
        .limit(1)
    )
    if used:
        raise HTTPException(409, "This account has transactions. Archive it instead to keep your history.")
    db.delete(account)
    db.commit()
