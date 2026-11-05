"""Helpers shared by routers."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

PAISA = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value or 0).quantize(PAISA, rounding=ROUND_HALF_UP)


def month_start(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    return date(d.year + y, m + 1, 1)


def get_owned(db: Session, model, obj_id: int, user_id: int, label: str):
    obj = db.get(model, obj_id)
    if obj is None or obj.user_id != user_id:
        raise HTTPException(404, f"{label} not found")
    return obj
