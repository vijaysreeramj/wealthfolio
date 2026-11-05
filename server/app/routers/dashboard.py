from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from ..common import add_months, month_start
from ..db import get_db
from ..models import Budget, Category, Transaction, User
from ..security import current_user
from ..services import networth as nw_service
from ..services.fire import fire_for_user
from .budgets import budget_month
from .transactions import to_out

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _sum_by_type(db: Session, user_id: int, start: date, end: date) -> dict[str, Decimal]:
    t = Transaction
    rows = db.execute(
        select(t.type, func.sum(t.amount))
        .where(t.user_id == user_id, t.date >= start, t.date <= end, t.type.in_(("income", "expense")))
        .group_by(t.type)
    ).all()
    return {k: v for k, v in rows}


def _monthly_trend(db: Session, user_id: int, first: date, months: int) -> list[dict]:
    t = Transaction
    last = add_months(first, months)
    rows = db.execute(
        select(extract("year", t.date), extract("month", t.date), t.type, func.sum(t.amount))
        .where(t.user_id == user_id, t.date >= first, t.date < last, t.type.in_(("income", "expense")))
        .group_by(extract("year", t.date), extract("month", t.date), t.type)
    ).all()
    data = {(int(y), int(m), typ): amt for y, m, typ, amt in rows}
    out = []
    for i in range(months):
        m = add_months(first, i)
        inc = data.get((m.year, m.month, "income"), Decimal(0))
        exp = data.get((m.year, m.month, "expense"), Decimal(0))
        out.append({"month": m, "income": inc, "expense": exp, "savings": inc - exp})
    return out


@router.get("")
def dashboard(
    mode: Literal["month", "year"] = "month",
    start: date | None = None,
    end: date | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    if not start or not end:
        start = month_start(today) if mode == "month" else date(today.year, 1, 1)
        end = date.fromordinal(add_months(start, 1 if mode == "month" else 12).toordinal() - 1)

    sums = _sum_by_type(db, user.id, start, end)
    income = sums.get("income", Decimal(0))
    expense = sums.get("expense", Decimal(0))
    months_in_period = 1 if mode == "month" else 12

    # Trend: last 6 months ending at the selected month, or the 12 months of the selected year
    trend_first = add_months(month_start(start), -5) if mode == "month" else date(start.year, 1, 1)
    trend = _monthly_trend(db, user.id, trend_first, 6 if mode == "month" else 12)

    t = Transaction
    breakdown = db.execute(
        select(Category.name, Category.color, func.sum(t.amount))
        .join(Category, Category.id == t.category_id)
        .where(t.user_id == user.id, t.type == "expense", t.date >= start, t.date <= end)
        .group_by(Category.name, Category.color)
        .order_by(func.sum(t.amount).desc())
    ).all()

    # Budget utilisation: the selected month, or the whole year's budgets vs spending
    if mode == "month":
        bm = budget_month(db, user.id, start)
        budget = {
            "items": [i.model_dump() for i in bm.items],
            "total_budget": bm.total_budget,
            "total_spent": bm.total_spent,
            "utilization_pct": bm.utilization_pct,
        }
    else:
        rows = db.execute(
            select(Category.name, Category.color, func.sum(Budget.amount))
            .join(Category, Category.id == Budget.category_id)
            .where(Budget.user_id == user.id, Budget.month >= start, Budget.month <= end)
            .group_by(Category.id, Category.name, Category.color)
        ).all()
        spent = dict(
            db.execute(
                select(Category.name, func.sum(t.amount))
                .join(Category, Category.id == t.category_id)
                .where(t.user_id == user.id, t.type == "expense", t.date >= start, t.date <= end)
                .group_by(Category.name)
            ).all()
        )
        items = []
        for name, color, amt in rows:
            s = spent.get(name, Decimal(0))
            items.append({"category_name": name, "category_color": color, "amount": amt, "spent": s,
                          "utilization_pct": round(float(s / amt * 100), 1) if amt else 0})
        tb = sum((i["amount"] for i in items), Decimal(0))
        ts = sum((i["spent"] for i in items), Decimal(0))
        budget = {"items": items, "total_budget": tb, "total_spent": ts,
                  "utilization_pct": round(float(ts / tb * 100), 1) if tb else 0}

    recent = db.scalars(
        select(t).where(t.user_id == user.id, t.date <= end).order_by(t.date.desc(), t.id.desc()).limit(8)
    ).all()

    nw = nw_service.current_networth(db, user.id)
    nw_service.record_snapshot(db, user.id, nw)
    history = nw_service.history(db, user.id, 12)
    portfolio = nw["portfolio"]

    profile, fire = fire_for_user(db, user.id, nw["investment_value"])

    has_data = bool(db.scalar(select(t.id).where(t.user_id == user.id).limit(1))) or nw["total_assets"] > 0

    return {
        "period": {"mode": mode, "start": start, "end": end},
        "has_data": has_data,
        "income": income,
        "expense": expense,
        "savings": income - expense,
        "savings_rate_pct": round(float((income - expense) / income * 100), 1) if income else None,
        "avg_monthly_expense": expense / months_in_period,
        "trend": trend,
        "expense_breakdown": [{"category": n, "color": c, "amount": a} for n, c, a in breakdown],
        "budget": budget,
        "recent_transactions": [to_out(r) for r in recent],
        "investments": {k: v for k, v in portfolio.items() if k != "holdings"},
        "net_worth": {
            "total_assets": nw["total_assets"],
            "total_liabilities": nw["total_liabilities"],
            "net_worth": nw["net_worth"],
            "history": [{"month": h.month, "net_worth": h.net_worth} for h in history],
        },
        "fire": None
        if fire is None
        else {
            "fire_number": fire.fire_number_today,
            "progress_pct": fire.progress_pct,
            "fire_age": fire.fire_age,
            "fire_date": fire.fire_date,
            "withdrawal_rate_pct": profile.withdrawal_rate_pct,
        },
    }
