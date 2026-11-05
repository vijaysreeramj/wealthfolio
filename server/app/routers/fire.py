from dataclasses import asdict
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import FireProfile, User
from ..security import current_user
from ..services.fire import fire_for_user
from ..services.portfolio import portfolio_summary

router = APIRouter(prefix="/api/fire", tags=["fire"])

ASSUMPTIONS_NOTE = (
    "Inflation and return rates are assumptions, not guarantees. Real returns vary year to year and can be negative. "
    "The withdrawal rate rule comes from historical studies, mostly of US markets; many planners suggest 3–3.5% for India "
    "because of higher inflation."
)


class FireIn(BaseModel):
    current_age: int = Field(ge=15, le=90)
    retirement_age: int = Field(ge=16, le=100)
    annual_expenses: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    current_portfolio: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    use_tracked_portfolio: bool = True
    monthly_contribution: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    inflation_pct: Decimal = Field(default=Decimal(6), ge=0, le=20)
    return_pct: Decimal = Field(default=Decimal(10), ge=0, le=30)
    withdrawal_rate_pct: Decimal = Field(default=Decimal(4), gt=0, le=10)

    @model_validator(mode="after")
    def ages(self):
        if self.retirement_age <= self.current_age:
            raise ValueError("Target retirement age must be after your current age")
        return self


def _response(db: Session, user: User) -> dict:
    portfolio = portfolio_summary(db, user.id)["current_value"]
    profile, plan = fire_for_user(db, user.id, portfolio)
    return {
        "tracked_portfolio": portfolio,
        "profile": None if profile is None else {
            c.name: getattr(profile, c.name) for c in FireProfile.__table__.columns if c.name not in ("user_id", "updated_at")
        },
        "plan": None if plan is None else asdict(plan),
        "assumptions_note": ASSUMPTIONS_NOTE,
    }


@router.get("")
def get_fire(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _response(db, user)


@router.put("")
def save_fire(data: FireIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    profile = db.get(FireProfile, user.id) or FireProfile(user_id=user.id)
    for k, v in data.model_dump().items():
        setattr(profile, k, v)
    db.add(profile)
    db.commit()
    return _response(db, user)
