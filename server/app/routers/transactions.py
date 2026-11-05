from datetime import date as Date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..common import get_owned
from ..db import get_db
from ..models import Account, Category, Investment, InvestmentTxn, Transaction, User
from ..security import current_user

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class TransactionIn(BaseModel):
    type: Literal["income", "expense", "transfer"]
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    date: Date
    account_id: int
    to_account_id: int | None = None
    category_id: int | None = None
    note: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def check_shape(self):
        if self.type == "transfer":
            if not self.to_account_id:
                raise ValueError("Choose the account the money is moving to")
            if self.to_account_id == self.account_id:
                raise ValueError("From and to accounts must be different")
            self.category_id = None
        else:
            if not self.category_id:
                raise ValueError("Choose a category")
            self.to_account_id = None
        return self


class TransactionOut(BaseModel):
    id: int
    type: str
    amount: Decimal
    date: Date
    account_id: int | None
    account_name: str | None
    to_account_id: int | None
    to_account_name: str | None
    category_id: int | None
    category_name: str | None
    category_color: str | None
    investment_id: int | None = None
    investment_name: str | None = None
    note: str | None
    is_linked: bool  # created from an investment entry; edit it there


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total_count: int
    page: int
    page_size: int
    total_income: Decimal
    total_expense: Decimal


def to_out(t: Transaction, investment: Investment | None = None) -> TransactionOut:
    return TransactionOut(
        id=t.id,
        type=t.type,
        amount=t.amount,
        date=t.date,
        account_id=t.account_id,
        account_name=t.account.name if t.account else None,
        to_account_id=t.to_account_id,
        to_account_name=t.to_account.name if t.to_account else None,
        category_id=t.category_id,
        category_name=t.category.name if t.category else None,
        category_color=t.category.color if t.category else None,
        investment_id=investment.id if investment else None,
        investment_name=investment.name if investment else None,
        note=t.note,
        is_linked=t.investment_txn_id is not None,
    )


def _validate_refs(db: Session, user_id: int, data: TransactionIn) -> None:
    get_owned(db, Account, data.account_id, user_id, "Account")
    if data.to_account_id:
        get_owned(db, Account, data.to_account_id, user_id, "Destination account")
    if data.category_id:
        category = get_owned(db, Category, data.category_id, user_id, "Category")
        if category.kind != data.type:
            raise HTTPException(422, f"'{category.name}' is an {category.kind} category")


@router.get("", response_model=TransactionPage)
def list_transactions(
    start: Date | None = None,
    end: Date | None = None,
    type: Literal["income", "expense", "transfer"] | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    t = Transaction
    filters = [t.user_id == user.id]
    if start:
        filters.append(t.date >= start)
    if end:
        filters.append(t.date <= end)
    if type:
        filters.append(t.type == type)
    if account_id:
        filters.append(or_(t.account_id == account_id, t.to_account_id == account_id))
    if category_id:
        filters.append(t.category_id == category_id)
    if q:
        like = f"%{q.strip()}%"
        filters.append(
            or_(
                t.note.ilike(like),
                t.category_id.in_(select(Category.id).where(Category.user_id == user.id, Category.name.ilike(like))),
            )
        )

    total_count = db.scalar(select(func.count()).select_from(t).where(*filters))
    sums = dict(db.execute(select(t.type, func.sum(t.amount)).where(*filters).group_by(t.type)).all())
    rows = db.scalars(
        select(t).where(*filters).order_by(t.date.desc(), t.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    # Resolve investment names for linked transfers in one query
    linked = {r.investment_txn_id for r in rows if r.investment_txn_id}
    inv_by_txn = {}
    if linked:
        inv_by_txn = dict(
            db.execute(
                select(InvestmentTxn.id, Investment)
                .join(Investment, Investment.id == InvestmentTxn.investment_id)
                .where(InvestmentTxn.id.in_(linked))
            ).all()
        )

    return TransactionPage(
        items=[to_out(r, inv_by_txn.get(r.investment_txn_id)) for r in rows],
        total_count=total_count,
        page=page,
        page_size=page_size,
        total_income=sums.get("income", Decimal(0)),
        total_expense=sums.get("expense", Decimal(0)),
    )


@router.post("", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _validate_refs(db, user.id, data)
    txn = Transaction(user_id=user.id, **data.model_dump())
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return to_out(txn)


def _editable(db: Session, txn_id: int, user_id: int) -> Transaction:
    txn = get_owned(db, Transaction, txn_id, user_id, "Transaction")
    if txn.investment_txn_id:
        raise HTTPException(409, "This entry belongs to an investment. Edit it from the Investments page.")
    return txn


@router.put("/{txn_id}", response_model=TransactionOut)
def update_transaction(
    txn_id: int, data: TransactionIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    txn = _editable(db, txn_id, user.id)
    _validate_refs(db, user.id, data)
    for key, value in data.model_dump().items():
        setattr(txn, key, value)
    db.commit()
    db.refresh(txn)
    return to_out(txn)


@router.delete("/{txn_id}", status_code=204)
def delete_transaction(txn_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_editable(db, txn_id, user.id))
    db.commit()
