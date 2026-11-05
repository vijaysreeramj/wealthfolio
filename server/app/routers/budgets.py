from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..common import add_months, get_owned, month_start
from ..db import get_db
from ..models import Budget, Category, Transaction, User
from ..security import current_user

router = APIRouter(prefix="/api/budgets", tags=["budgets"])

ALERT_LEVELS = ((100, "exceeded"), (90, "critical"), (75, "warning"))


def alert_level(pct: float) -> str | None:
    return next((name for limit, name in ALERT_LEVELS if pct >= limit), None)


class BudgetIn(BaseModel):
    category_id: int
    month: date
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class BudgetUpdate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class BudgetLine(BaseModel):
    id: int
    category_id: int
    category_name: str
    category_color: str
    month: date
    amount: Decimal
    spent: Decimal
    remaining: Decimal
    utilization_pct: float
    alert: str | None


class BudgetMonth(BaseModel):
    month: date
    items: list[BudgetLine]
    total_budget: Decimal
    total_spent: Decimal  # spent in budgeted categories
    total_remaining: Decimal
    utilization_pct: float
    unbudgeted_spent: Decimal  # spending in categories without a budget
    unbudgeted: list[dict]


class CopyIn(BaseModel):
    from_month: date
    to_month: date


def spent_by_category(db: Session, user_id: int, start: date, end_exclusive: date) -> dict[int, Decimal]:
    t = Transaction
    rows = db.execute(
        select(t.category_id, func.sum(t.amount))
        .where(t.user_id == user_id, t.type == "expense", t.date >= start, t.date < end_exclusive)
        .group_by(t.category_id)
    ).all()
    return dict(rows)


def budget_month(db: Session, user_id: int, month: date) -> BudgetMonth:
    month = month_start(month)
    spent = spent_by_category(db, user_id, month, add_months(month, 1))
    budgets = db.scalars(
        select(Budget).where(Budget.user_id == user_id, Budget.month == month).join(Budget.category).order_by(Category.name)
    ).all()

    items = []
    for b in budgets:
        s = spent.pop(b.category_id, Decimal(0))
        pct = float(s / b.amount * 100) if b.amount else 0.0
        items.append(
            BudgetLine(
                id=b.id,
                category_id=b.category_id,
                category_name=b.category.name,
                category_color=b.category.color,
                month=b.month,
                amount=b.amount,
                spent=s,
                remaining=b.amount - s,
                utilization_pct=round(pct, 1),
                alert=alert_level(pct),
            )
        )
    total_budget = sum((i.amount for i in items), Decimal(0))
    total_spent = sum((i.spent for i in items), Decimal(0))

    unbudgeted = []
    if spent:
        cats = {c.id: c for c in db.scalars(select(Category).where(Category.id.in_(spent.keys())))}
        unbudgeted = sorted(
            (
                {"category_id": cid, "category_name": cats[cid].name, "category_color": cats[cid].color, "spent": amt}
                for cid, amt in spent.items()
            ),
            key=lambda x: -x["spent"],
        )

    return BudgetMonth(
        month=month,
        items=items,
        total_budget=total_budget,
        total_spent=total_spent,
        total_remaining=total_budget - total_spent,
        utilization_pct=round(float(total_spent / total_budget * 100), 1) if total_budget else 0.0,
        unbudgeted_spent=sum(spent.values(), Decimal(0)),
        unbudgeted=unbudgeted,
    )


@router.get("", response_model=BudgetMonth)
def get_budgets(month: date, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return budget_month(db, user.id, month)


@router.get("/history")
def budget_history(
    months: int = Query(default=6, ge=1, le=24),
    end: date | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Budget vs actual for each of the last N months (only budgeted categories count as 'spent')."""
    last = month_start(end or date.today())
    result = []
    for i in range(months - 1, -1, -1):
        m = add_months(last, -i)
        bm = budget_month(db, user.id, m)
        result.append(
            {
                "month": m,
                "total_budget": bm.total_budget,
                "total_spent": bm.total_spent,
                "utilization_pct": bm.utilization_pct,
                "over_budget_categories": [i.category_name for i in bm.items if i.alert == "exceeded"],
            }
        )
    return result


@router.post("", response_model=BudgetLine, status_code=201)
def create_budget(data: BudgetIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    category = get_owned(db, Category, data.category_id, user.id, "Category")
    if category.kind != "expense":
        raise HTTPException(422, "Budgets can only be set for expense categories")
    month = month_start(data.month)
    db.add(Budget(user_id=user.id, category_id=category.id, month=month, amount=data.amount))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"'{category.name}' already has a budget for this month. Edit it instead.") from None
    return next(i for i in budget_month(db, user.id, month).items if i.category_id == category.id)


@router.put("/{budget_id}", response_model=BudgetLine)
def update_budget(budget_id: int, data: BudgetUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    budget = get_owned(db, Budget, budget_id, user.id, "Budget")
    budget.amount = data.amount
    db.commit()
    return next(i for i in budget_month(db, user.id, budget.month).items if i.id == budget.id)


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Budget, budget_id, user.id, "Budget"))
    db.commit()


@router.post("/copy")
def copy_budgets(data: CopyIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Copy one month's budgets to another, skipping categories that already have a budget there."""
    src, dst = month_start(data.from_month), month_start(data.to_month)
    existing = set(db.scalars(select(Budget.category_id).where(Budget.user_id == user.id, Budget.month == dst)))
    copied = 0
    for b in db.scalars(select(Budget).where(Budget.user_id == user.id, Budget.month == src)):
        if b.category_id not in existing:
            db.add(Budget(user_id=user.id, category_id=b.category_id, month=dst, amount=b.amount))
            copied += 1
    db.commit()
    return {"copied": copied}
