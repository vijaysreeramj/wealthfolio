"""Account balances derived from opening balance + transactions (never stored, so never stale)."""

from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..models import LIABILITY_ACCOUNT_TYPES, Account, Transaction


def account_flows(db: Session, user_id: int, as_of: date | None = None) -> dict[int, Decimal]:
    """Net money flow per account: inflows minus outflows."""
    t = Transaction
    date_filter = [t.date <= as_of] if as_of else []

    out_sign = case((t.type == "income", t.amount), else_=-t.amount)
    rows = db.execute(
        select(t.account_id, func.sum(out_sign))
        .where(t.user_id == user_id, t.account_id.is_not(None), *date_filter)
        .group_by(t.account_id)
    ).all()
    flows: dict[int, Decimal] = {acc: amt for acc, amt in rows}

    rows = db.execute(
        select(t.to_account_id, func.sum(t.amount))
        .where(t.user_id == user_id, t.to_account_id.is_not(None), *date_filter)
        .group_by(t.to_account_id)
    ).all()
    for acc, amt in rows:
        flows[acc] = flows.get(acc, Decimal(0)) + amt
    return flows


def is_liability(account: Account) -> bool:
    return account.type in LIABILITY_ACCOUNT_TYPES


def account_balance(account: Account, flow: Decimal) -> Decimal:
    """Asset accounts: money held. Liability accounts: amount still owed."""
    if is_liability(account):
        return account.opening_balance - flow
    return account.opening_balance + flow


def balances(db: Session, user_id: int, as_of: date | None = None) -> list[tuple[Account, Decimal]]:
    flows = account_flows(db, user_id, as_of)
    accounts = db.scalars(select(Account).where(Account.user_id == user_id).order_by(Account.type, Account.name))
    return [(a, account_balance(a, flows.get(a.id, Decimal(0)))) for a in accounts]
