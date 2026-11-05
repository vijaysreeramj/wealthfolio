from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from ..common import get_owned
from ..db import get_db
from ..models import Goal, User
from ..security import current_user
from ..services.finance import goal_guidance, goal_plan

router = APIRouter(prefix="/api/goals", tags=["goals"])

RATE = dict(ge=0, le=20, max_digits=6, decimal_places=3)


class GoalIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: Literal["car", "vacation", "house", "emergency_fund", "education", "other"] = "other"
    target_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    current_savings: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    target_date: date
    priority: Literal["high", "medium", "low"] = "medium"
    risk_preference: Literal["low", "medium", "high"] = "low"
    conservative_return_pct: Decimal = Field(default=Decimal("6.5"), **RATE)
    moderate_return_pct: Decimal = Field(default=Decimal("10"), **RATE)
    monthly_contribution: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def check(self):
        if self.target_date <= date.today():
            raise ValueError("Target date must be in the future")
        return self


def goal_out(g: Goal, today: date | None = None) -> dict:
    plan = goal_plan(
        float(g.target_amount),
        float(g.current_savings),
        g.target_date,
        {
            "no_return": 0.0,
            "conservative": float(g.conservative_return_pct),
            "moderate": float(g.moderate_return_pct),
        },
        float(g.monthly_contribution) if g.monthly_contribution else None,
        today,
    )
    guidance = goal_guidance(plan["remaining_months"], g.risk_preference)
    # Short-horizon goals shouldn't lean on equity-like returns
    if plan["remaining_months"] < 36 and float(g.moderate_return_pct) > 8:
        guidance["return_warning"] = (
            f"The moderate scenario assumes {float(g.moderate_return_pct):g}% a year. Returns like that usually need equity, "
            "which can fall sharply over periods shorter than 3 years. Plan around the no-return or conservative figure."
        )
    if g.current_savings >= g.target_amount:
        status = "achieved"
    elif g.monthly_contribution:
        cons = next(s for s in plan["scenarios"] if s["name"] == "conservative")
        done = cons.get("estimated_completion")
        status = "on_track" if done and done <= g.target_date else "behind"
    else:
        status = "no_plan"
    return {
        "id": g.id,
        "name": g.name,
        "category": g.category,
        "target_amount": g.target_amount,
        "current_savings": g.current_savings,
        "target_date": g.target_date,
        "priority": g.priority,
        "risk_preference": g.risk_preference,
        "conservative_return_pct": g.conservative_return_pct,
        "moderate_return_pct": g.moderate_return_pct,
        "monthly_contribution": g.monthly_contribution,
        "notes": g.notes,
        "status": status,
        **plan,
        "guidance": guidance,
    }


@router.get("")
def list_goals(user: User = Depends(current_user), db: Session = Depends(get_db)):
    order = case({"high": 0, "medium": 1, "low": 2}, value=Goal.priority)
    goals = db.scalars(select(Goal).where(Goal.user_id == user.id).order_by(order, Goal.target_date)).all()
    items = [goal_out(g) for g in goals]
    return {
        "items": items,
        "total_target": sum((g.target_amount for g in goals), Decimal(0)),
        "total_saved": sum((min(g.current_savings, g.target_amount) for g in goals), Decimal(0)),
        "total_required_monthly": sum(
            (next(s["required_monthly"] for s in i["scenarios"] if s["name"] == "conservative") for i in items if i["status"] != "achieved"),
            Decimal(0),
        ),
    }


@router.post("", status_code=201)
def create_goal(data: GoalIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    goal = Goal(user_id=user.id, **data.model_dump())
    db.add(goal)
    db.commit()
    return goal_out(goal)


@router.put("/{goal_id}")
def update_goal(goal_id: int, data: GoalIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    goal = get_owned(db, Goal, goal_id, user.id, "Goal")
    for k, v in data.model_dump().items():
        setattr(goal, k, v)
    db.commit()
    return goal_out(goal)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Goal, goal_id, user.id, "Goal"))
    db.commit()
