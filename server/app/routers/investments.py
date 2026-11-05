from datetime import date as Date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..common import get_owned
from ..db import get_db
from ..models import Account, Category, Investment, InvestmentTxn, Transaction, User
from ..security import current_user
from ..services.finance import MARKET_TYPES, InvestmentMetrics, investment_metrics
from ..services.portfolio import portfolio_summary

router = APIRouter(prefix="/api/investments", tags=["investments"])

InvType = Literal["stock", "mutual_fund", "sip", "fd", "rd", "ppf", "epf", "nps", "gold", "other"]
TxnType = Literal["buy", "sell", "deposit", "withdrawal", "interest", "dividend"]
Compounding = Literal["monthly", "quarterly", "half_yearly", "yearly"]

MONEY = dict(max_digits=14, decimal_places=2)
ALLOWED_TXNS = {
    "market": {"buy", "sell", "dividend"},
    "interest": {"deposit", "withdrawal", "interest"},
    "other": {"buy", "sell", "deposit", "withdrawal", "interest", "dividend"},
}


class InvestmentFields(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    type: InvType
    folio_number: str | None = Field(default=None, max_length=60)
    institution: str | None = Field(default=None, max_length=120)
    symbol: str | None = Field(default=None, max_length=40)
    current_price: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=4)
    manual_current_value: Decimal | None = Field(default=None, ge=0, **MONEY)
    interest_rate: Decimal | None = Field(default=None, ge=0, le=50, max_digits=6, decimal_places=3)
    compounding: Compounding | None = None
    start_date: Date | None = None
    maturity_date: Date | None = None
    installment_amount: Decimal | None = Field(default=None, gt=0, **MONEY)
    notes: str | None = Field(default=None, max_length=2000)
    is_closed: bool = False

    @model_validator(mode="after")
    def check(self):
        if self.type in MARKET_TYPES:
            # Equity and market-linked holdings are valued at market price, never at a fixed rate
            self.interest_rate = None
            self.compounding = None
        if self.maturity_date and self.start_date and self.maturity_date <= self.start_date:
            raise ValueError("Maturity date must be after the start date")
        if self.type == "rd" and not self.installment_amount:
            raise ValueError("Enter the monthly instalment for the recurring deposit")
        return self


class TxnIn(BaseModel):
    type: TxnType
    date: Date
    units: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=6)
    price: Decimal | None = Field(default=None, gt=0, max_digits=16, decimal_places=4)
    amount: Decimal | None = Field(default=None, gt=0, **MONEY)
    account_id: int | None = None  # bank account the money came from / went to
    note: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def fill_amount(self):
        if self.amount is None and self.units and self.price:
            self.amount = (self.units * self.price).quantize(Decimal("0.01"))
        if self.amount is None:
            raise ValueError("Enter the amount")
        return self


class InvestmentCreate(InvestmentFields):
    initial: TxnIn | None = None


class ValueUpdate(BaseModel):
    current_price: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=4)
    manual_current_value: Decimal | None = Field(default=None, ge=0, **MONEY)
    as_of: Date | None = None


def _metrics_out(m: InvestmentMetrics) -> dict:
    return {
        "units": m.units,
        "invested": m.invested,
        "current_value": m.current_value,
        "unrealized_pl": m.unrealized_pl,
        "realized_pl": m.realized_pl,
        "income": m.income,
        "total_deposited": m.total_deposited,
        "return_pct": m.return_pct,
        "maturity_value": m.maturity_value,
        "value_source": m.value_source,
        "asset_class": m.asset_class,
        "notes": m.notes,
        "avg_cost": (m.invested / m.units).quantize(Decimal("0.0001")) if m.units else None,
    }


def _inv_out(inv: Investment, m: InvestmentMetrics, with_txns: bool = False, db: Session | None = None) -> dict:
    out = {
        "id": inv.id,
        "name": inv.name,
        "type": inv.type,
        "folio_number": inv.folio_number,
        "institution": inv.institution,
        "symbol": inv.symbol,
        "current_price": inv.current_price,
        "price_updated_at": inv.price_updated_at,
        "manual_current_value": inv.manual_current_value,
        "value_updated_at": inv.value_updated_at,
        "interest_rate": inv.interest_rate,
        "compounding": inv.compounding,
        "start_date": inv.start_date,
        "maturity_date": inv.maturity_date,
        "installment_amount": inv.installment_amount,
        "notes": inv.notes,
        "is_closed": inv.is_closed,
        "first_date": inv.txns[0].date if inv.txns else inv.start_date,
        "metrics": _metrics_out(m),
    }
    if with_txns:
        linked = {}
        if db is not None and inv.txns:
            rows = db.execute(
                select(Transaction.investment_txn_id, Account.name, Account.id)
                .join(Account, Account.id == func.coalesce(Transaction.account_id, Transaction.to_account_id))
                .where(Transaction.investment_txn_id.in_([t.id for t in inv.txns]))
            ).all()
            linked = {r[0]: {"account_name": r[1], "account_id": r[2]} for r in rows}
        out["txns"] = [
            {
                "id": t.id,
                "type": t.type,
                "date": t.date,
                "units": t.units,
                "price": t.price,
                "amount": t.amount,
                "note": t.note,
                **linked.get(t.id, {"account_name": None, "account_id": None}),
            }
            for t in sorted(inv.txns, key=lambda t: (t.date, t.id), reverse=True)
        ]
    return out


def _income_category(db: Session, user_id: int, name: str) -> Category:
    cat = db.scalar(select(Category).where(Category.user_id == user_id, Category.kind == "income", Category.name == name))
    if cat is None:
        cat = Category(user_id=user_id, kind="income", name=name, color="#7c3aed")
        db.add(cat)
        db.flush()
    return cat


def _check_txn(inv: Investment, data: TxnIn, exclude_id: int | None = None) -> None:
    market = inv.type in MARKET_TYPES
    allowed = ALLOWED_TXNS["market" if market else "other" if inv.type == "other" else "interest"]
    if data.type not in allowed:
        raise HTTPException(422, f"Use {', '.join(sorted(allowed))} entries for this investment")
    if market and data.type in ("buy", "sell") and not data.units:
        raise HTTPException(422, "Enter units/quantity for buys and sells")
    if market and data.type == "sell":
        held = sum(
            (t.units or 0) * (1 if t.type == "buy" else -1)
            for t in inv.txns
            if t.type in ("buy", "sell") and t.id != exclude_id and t.date <= data.date
        )
        if data.units > held:
            raise HTTPException(422, f"You only held {held.normalize()} units on {data.date:%d %b %Y}")


def _link_cash(db: Session, user_id: int, txn: InvestmentTxn, account_id: int | None) -> None:
    """Mirror the money movement in the bank account so balances stay right without double counting."""
    db.query(Transaction).filter(Transaction.investment_txn_id == txn.id).delete()
    if not account_id:
        return
    account = get_owned(db, Account, account_id, user_id, "Account")
    base = dict(user_id=user_id, amount=txn.amount, date=txn.date, investment_txn_id=txn.id, note=txn.note)
    if txn.type in ("buy", "deposit"):
        db.add(Transaction(type="transfer", account_id=account.id, **base))
    elif txn.type in ("sell", "withdrawal"):
        db.add(Transaction(type="transfer", to_account_id=account.id, **base))
    else:  # dividend / interest paid out to the bank is real income
        cat = _income_category(db, user_id, "Dividends" if txn.type == "dividend" else "Interest")
        db.add(Transaction(type="income", account_id=account.id, category_id=cat.id, **base))


def _add_txn(db: Session, user_id: int, inv: Investment, data: TxnIn) -> InvestmentTxn:
    _check_txn(inv, data)
    txn = InvestmentTxn(
        investment_id=inv.id, type=data.type, date=data.date, units=data.units, price=data.price,
        amount=data.amount, note=data.note,
    )
    db.add(txn)
    db.flush()
    inv.txns.append(txn)
    _link_cash(db, user_id, txn, data.account_id)
    return txn


def _detail(db: Session, inv: Investment) -> dict:
    db.refresh(inv)
    return _inv_out(inv, investment_metrics(inv, inv.txns), with_txns=True, db=db)


@router.get("")
def list_investments(user: User = Depends(current_user), db: Session = Depends(get_db)):
    summary = portfolio_summary(db, user.id)
    holdings = summary.pop("holdings")
    return {"summary": summary, "items": [_inv_out(inv, m) for inv, m in holdings]}


@router.get("/{inv_id}")
def get_investment(inv_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _detail(db, get_owned(db, Investment, inv_id, user.id, "Investment"))


@router.post("", status_code=201)
def create_investment(data: InvestmentCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    fields = data.model_dump(exclude={"initial"})
    inv = Investment(user_id=user.id, **fields)
    if inv.current_price is not None:
        inv.price_updated_at = Date.today()
    if inv.manual_current_value is not None:
        inv.value_updated_at = Date.today()
    db.add(inv)
    db.flush()
    if data.initial:
        _add_txn(db, user.id, inv, data.initial)
    db.commit()
    return _detail(db, inv)


@router.put("/{inv_id}")
def update_investment(inv_id: int, data: InvestmentFields, user: User = Depends(current_user), db: Session = Depends(get_db)):
    inv = get_owned(db, Investment, inv_id, user.id, "Investment")
    if data.type != inv.type and inv.txns and (data.type in MARKET_TYPES) != (inv.type in MARKET_TYPES):
        raise HTTPException(409, "Can't switch between market-linked and fixed-interest types once entries exist")
    new = data.model_dump()
    if new["current_price"] != inv.current_price:
        inv.price_updated_at = Date.today() if new["current_price"] is not None else None
    if new["manual_current_value"] != inv.manual_current_value:
        inv.value_updated_at = Date.today() if new["manual_current_value"] is not None else None
    for k, v in new.items():
        setattr(inv, k, v)
    db.commit()
    return _detail(db, inv)


@router.patch("/{inv_id}/value")
def update_value(inv_id: int, data: ValueUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Quick update of the latest price/NAV or the current value."""
    inv = get_owned(db, Investment, inv_id, user.id, "Investment")
    as_of = data.as_of or Date.today()
    if "current_price" in data.model_fields_set:
        inv.current_price = data.current_price
        inv.price_updated_at = as_of if data.current_price is not None else None
    if "manual_current_value" in data.model_fields_set:
        inv.manual_current_value = data.manual_current_value
        inv.value_updated_at = as_of if data.manual_current_value is not None else None
    db.commit()
    return _detail(db, inv)


@router.delete("/{inv_id}", status_code=204)
def delete_investment(inv_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    inv = get_owned(db, Investment, inv_id, user.id, "Investment")
    ids = [t.id for t in inv.txns]
    if ids:
        db.query(Transaction).filter(Transaction.investment_txn_id.in_(ids)).delete()
    db.delete(inv)
    db.commit()


@router.post("/{inv_id}/txns", status_code=201)
def add_txn(inv_id: int, data: TxnIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    inv = get_owned(db, Investment, inv_id, user.id, "Investment")
    _add_txn(db, user.id, inv, data)
    db.commit()
    return _detail(db, inv)


def _owned_txn(db: Session, inv: Investment, txn_id: int) -> InvestmentTxn:
    txn = db.get(InvestmentTxn, txn_id)
    if txn is None or txn.investment_id != inv.id:
        raise HTTPException(404, "Entry not found")
    return txn


@router.put("/{inv_id}/txns/{txn_id}")
def update_txn(inv_id: int, txn_id: int, data: TxnIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    inv = get_owned(db, Investment, inv_id, user.id, "Investment")
    txn = _owned_txn(db, inv, txn_id)
    _check_txn(inv, data, exclude_id=txn.id)
    for k in ("type", "date", "units", "price", "amount", "note"):
        setattr(txn, k, getattr(data, k))
    _link_cash(db, user.id, txn, data.account_id)
    db.commit()
    return _detail(db, inv)


@router.delete("/{inv_id}/txns/{txn_id}")
def delete_txn(inv_id: int, txn_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    inv = get_owned(db, Investment, inv_id, user.id, "Investment")
    txn = _owned_txn(db, inv, txn_id)
    db.query(Transaction).filter(Transaction.investment_txn_id == txn.id).delete()
    inv.txns.remove(txn)
    db.delete(txn)
    db.commit()
    return _detail(db, inv)
