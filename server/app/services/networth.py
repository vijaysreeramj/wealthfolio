"""Net worth = assets - liabilities. Each item comes from exactly one source, so nothing is double-counted:

- bank & cash         -> accounts (derived from transactions)
- investments         -> investments (current value, closed ones excluded)
- property, gold etc. -> manual assets
- liabilities         -> credit card / loan / other-debt accounts (amount owed)
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common import month_start
from ..models import Asset, NetWorthSnapshot
from .balances import balances, is_liability
from .portfolio import portfolio_summary

INVESTMENT_GROUP = {
    "stock": "stocks",
    "mutual_fund": "mutual_funds",
    "sip": "mutual_funds",
    "fd": "fd_rd",
    "rd": "fd_rd",
    "ppf": "retirement",
    "epf": "retirement",
    "nps": "retirement",
    "gold": "gold",
    "other": "other_assets",
}
ASSET_GROUP = {"property": "property", "gold_physical": "gold", "vehicle": "other_assets", "other": "other_assets"}
LIABILITY_GROUP = {"credit_card": "credit_cards", "loan": "loans", "other_debt": "other_debts"}

ASSET_GROUPS = ["bank", "cash", "stocks", "mutual_funds", "fd_rd", "retirement", "gold", "property", "other_assets"]
LIABILITY_GROUPS = ["loans", "credit_cards", "other_debts"]


def current_networth(db: Session, user_id: int) -> dict:
    assets = {k: Decimal(0) for k in ASSET_GROUPS}
    liabilities = {k: Decimal(0) for k in LIABILITY_GROUPS}

    for account, balance in balances(db, user_id):
        if is_liability(account):
            liabilities[LIABILITY_GROUP[account.type]] += max(balance, Decimal(0))
        else:
            # An overdrawn account counts as zero asset rather than a negative asset
            assets["bank" if account.type == "bank" else "cash"] += max(balance, Decimal(0))

    portfolio = portfolio_summary(db, user_id)
    for t in portfolio["by_type"]:
        assets[INVESTMENT_GROUP[t["type"]]] += t["current_value"]

    for a in db.scalars(select(Asset).where(Asset.user_id == user_id)):
        assets[ASSET_GROUP[a.type]] += a.value

    total_assets = sum(assets.values(), Decimal(0))
    total_liabilities = sum(liabilities.values(), Decimal(0))
    return {
        "assets": assets,
        "liabilities": liabilities,
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "net_worth": total_assets - total_liabilities,
        "investment_value": portfolio["current_value"],
        "portfolio": portfolio,
    }


def record_snapshot(db: Session, user_id: int, nw: dict) -> None:
    """Upsert this month's snapshot so the history chart builds itself over time."""
    month = month_start(date.today())
    snap = db.scalar(select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user_id, NetWorthSnapshot.month == month))
    breakdown = {
        "assets": {k: str(v) for k, v in nw["assets"].items()},
        "liabilities": {k: str(v) for k, v in nw["liabilities"].items()},
    }
    if snap is None:
        snap = NetWorthSnapshot(user_id=user_id, month=month)
        db.add(snap)
    snap.total_assets = nw["total_assets"]
    snap.total_liabilities = nw["total_liabilities"]
    snap.net_worth = nw["net_worth"]
    snap.breakdown = breakdown
    db.commit()


def history(db: Session, user_id: int, months: int = 24) -> list[NetWorthSnapshot]:
    rows = db.scalars(
        select(NetWorthSnapshot)
        .where(NetWorthSnapshot.user_id == user_id)
        .order_by(NetWorthSnapshot.month.desc())
        .limit(months)
    ).all()
    return list(reversed(rows))
