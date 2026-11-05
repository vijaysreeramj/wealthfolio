from sqlalchemy.orm import Session

from ..models import FireProfile
from .finance import fire_plan


def fire_for_user(db: Session, user_id: int, tracked_portfolio) -> tuple[FireProfile | None, object | None]:
    profile = db.get(FireProfile, user_id)
    if profile is None:
        return None, None
    portfolio = tracked_portfolio if profile.use_tracked_portfolio else profile.current_portfolio
    return profile, fire_plan(
        current_age=profile.current_age,
        retirement_age=profile.retirement_age,
        annual_expenses=float(profile.annual_expenses),
        portfolio=float(portfolio),
        monthly_contribution=float(profile.monthly_contribution),
        inflation_pct=float(profile.inflation_pct),
        return_pct=float(profile.return_pct),
        withdrawal_rate_pct=float(profile.withdrawal_rate_pct),
    )
