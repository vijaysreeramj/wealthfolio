"""Portfolio totals built from investment_metrics()."""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Investment
from .finance import investment_metrics


def load_investments(db: Session, user_id: int) -> list[Investment]:
    return list(
        db.scalars(
            select(Investment)
            .where(Investment.user_id == user_id)
            .options(selectinload(Investment.txns))
            .order_by(Investment.is_closed, Investment.name)
        )
    )


def portfolio_summary(db: Session, user_id: int, as_of: date | None = None) -> dict:
    investments = load_investments(db, user_id)
    by_type: dict[str, dict] = defaultdict(lambda: {"invested": Decimal(0), "current_value": Decimal(0), "count": 0})
    by_class: dict[str, Decimal] = defaultdict(Decimal)
    holdings = []
    invested = value = realized = income = Decimal(0)

    for inv in investments:
        m = investment_metrics(inv, inv.txns, as_of)
        realized += m.realized_pl
        income += m.income
        holdings.append((inv, m))
        if inv.is_closed:
            continue
        invested += m.invested
        value += m.current_value
        t = by_type[inv.type]
        t["invested"] += m.invested
        t["current_value"] += m.current_value
        t["count"] += 1
        by_class[m.asset_class] += m.current_value

    pl = value - invested
    pct = lambda part: round(float(part / value * 100), 1) if value else 0.0  # noqa: E731
    return {
        "total_invested": invested,
        "current_value": value,
        "absolute_pl": pl,
        "return_pct": round(float(pl / invested * 100), 2) if invested else None,
        "realized_pl": realized,
        "income_received": income,
        "count": sum(1 for i, _ in holdings if not i.is_closed),
        "by_type": [
            {"type": k, **v, "allocation_pct": pct(v["current_value"])}
            for k, v in sorted(by_type.items(), key=lambda kv: -kv[1]["current_value"])
        ],
        "by_asset_class": [
            {"asset_class": k, "current_value": v, "allocation_pct": pct(v)}
            for k, v in sorted(by_class.items(), key=lambda kv: -kv[1])
        ],
        "holdings": holdings,
    }
