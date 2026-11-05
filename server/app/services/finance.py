"""Pure financial calculations. No database access here, so everything is easy to unit-test.

Conventions
- Rates are annual percentages (7.1 means 7.1% p.a.).
- Time in years is days / 365.
- Results are Decimal rounded to paise at the edges; internal math uses float for powers.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta

PERIODS_PER_YEAR = {"monthly": 12, "quarterly": 4, "half_yearly": 2, "yearly": 1}
MARKET_TYPES = {"stock", "mutual_fund", "sip", "nps", "gold"}
INTEREST_TYPES = {"fd", "rd", "ppf", "epf"}

# Broad asset classes used for allocation and the advisor
ASSET_CLASS = {
    "stock": "equity",
    "mutual_fund": "equity",
    "sip": "equity",
    "nps": "retirement",
    "fd": "debt",
    "rd": "debt",
    "ppf": "debt",
    "epf": "debt",
    "gold": "gold",
    "other": "other",
}


def d2(x) -> Decimal:
    return Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def years_between(start: date, end: date) -> float:
    return max((end - start).days, 0) / 365


def months_between(start: date, end: date) -> int:
    """Whole months from start to end (0 if end <= start)."""
    if end <= start:
        return 0
    rd = relativedelta(end, start)
    return rd.years * 12 + rd.months


# ---- Fixed-interest instruments ---------------------------------------------------------


def compound(principal: float, rate_pct: float, compounding: str, years: float) -> float:
    """A = P (1 + r/n)^(n t)"""
    n = PERIODS_PER_YEAR.get(compounding or "quarterly", 4)
    return principal * (1 + rate_pct / 100 / n) ** (n * years)


def accrued_value(flows: list[tuple[date, float]], rate_pct: float, compounding: str, as_of: date) -> float:
    """Value on `as_of` of deposits (+) and withdrawals (-) each compounding from its own date."""
    return sum(compound(amount, rate_pct, compounding, years_between(d, as_of)) for d, amount in flows if d <= as_of)


def rd_schedule(installment: float, start: date, maturity: date) -> list[tuple[date, float]]:
    """Monthly instalments from start up to (not including) the maturity month."""
    n = max(months_between(start, maturity), 1)
    return [(start + relativedelta(months=k), installment) for k in range(n)]


def rd_maturity(installment: float, rate_pct: float, compounding: str, start: date, maturity: date) -> float:
    """Sum of each instalment compounded until maturity (Indian banks compound RDs quarterly)."""
    n = PERIODS_PER_YEAR.get(compounding or "quarterly", 4)
    months = max(months_between(start, maturity), 1)
    return sum(installment * (1 + rate_pct / 100 / n) ** (n * (months - k) / 12) for k in range(months))


# ---- Investment metrics -----------------------------------------------------------------


@dataclass
class InvestmentMetrics:
    units: Decimal | None = None
    invested: Decimal = Decimal(0)  # cost of what is still held
    current_value: Decimal = Decimal(0)
    unrealized_pl: Decimal = Decimal(0)
    realized_pl: Decimal = Decimal(0)
    income: Decimal = Decimal(0)  # dividends / interest paid out
    total_deposited: Decimal = Decimal(0)
    return_pct: float | None = None
    maturity_value: Decimal | None = None
    value_source: str = "cost"  # market_price | manual | calculated | cost
    asset_class: str = "other"
    notes: list[str] = field(default_factory=list)


def investment_metrics(inv, txns, as_of: date | None = None) -> InvestmentMetrics:
    """Work out holdings, cost, value and returns for one investment.

    `inv` needs: type, current_price, manual_current_value, interest_rate, compounding,
    start_date, maturity_date, installment_amount, is_closed.
    `txns` need: type, date, units, price, amount, sorted by date.
    """
    as_of = as_of or date.today()
    m = InvestmentMetrics(asset_class=ASSET_CLASS.get(inv.type, "other"))
    txns = [t for t in txns if t.date <= as_of]

    if inv.type in MARKET_TYPES:
        # Average-cost method: selling removes cost proportionally
        units = Decimal(0)
        cost = Decimal(0)
        for t in txns:
            if t.type == "buy":
                units += t.units or 0
                cost += t.amount
                m.total_deposited += t.amount
            elif t.type == "sell":
                sold = t.units or 0
                avg = cost / units if units else Decimal(0)
                removed = avg * sold
                m.realized_pl += t.amount - removed
                units -= sold
                cost -= removed
            elif t.type in ("dividend", "interest"):
                m.income += t.amount
        m.units = units
        m.invested = d2(cost)
        if inv.current_price is not None and units > 0:
            m.current_value = d2(units * inv.current_price)
            m.value_source = "market_price"
        elif inv.manual_current_value is not None:
            m.current_value = d2(inv.manual_current_value)
            m.value_source = "manual"
        else:
            m.current_value = m.invested
            m.notes.append("Add the latest price/NAV to see returns")
    else:
        flows: list[tuple[date, float]] = []
        principal = Decimal(0)
        for t in txns:
            if t.type in ("buy", "deposit"):
                principal += t.amount
                m.total_deposited += t.amount
                flows.append((t.date, float(t.amount)))
            elif t.type in ("sell", "withdrawal"):
                principal -= t.amount
                flows.append((t.date, -float(t.amount)))
            elif t.type in ("dividend", "interest"):
                m.income += t.amount

        rate = float(inv.interest_rate) if inv.interest_rate is not None else None
        comp = inv.compounding or ("quarterly" if inv.type in ("fd", "rd") else "yearly")

        # RD without recorded deposits: assume instalments were paid on schedule
        if inv.type == "rd" and not flows and inv.installment_amount and inv.start_date and inv.maturity_date:
            schedule = rd_schedule(float(inv.installment_amount), inv.start_date, inv.maturity_date)
            flows = [(d, a) for d, a in schedule if d <= as_of]
            principal = d2(sum(a for _, a in flows))
            m.total_deposited = principal
            m.notes.append("Assumes every instalment so far was paid on time")

        m.invested = d2(principal)
        if inv.manual_current_value is not None:
            m.current_value = d2(inv.manual_current_value)
            m.value_source = "manual"
        elif rate is not None and inv.type in INTEREST_TYPES and flows:
            end = min(as_of, inv.maturity_date) if inv.maturity_date else as_of
            m.current_value = d2(accrued_value(flows, rate, comp, end))
            m.value_source = "calculated"
        else:
            m.current_value = d2(principal + (m.income if inv.type in ("ppf", "epf") else 0))
            m.value_source = "cost"

        if rate is not None and inv.maturity_date:
            if inv.type == "rd" and inv.installment_amount and inv.start_date:
                m.maturity_value = d2(
                    rd_maturity(float(inv.installment_amount), rate, comp, inv.start_date, inv.maturity_date)
                )
            elif inv.type == "fd" and flows:
                m.maturity_value = d2(accrued_value(flows, rate, comp, inv.maturity_date))

    if inv.is_closed:
        m.current_value = Decimal(0)
        m.invested = Decimal(0)
        m.units = Decimal(0) if m.units is not None else None

    m.unrealized_pl = m.current_value - m.invested
    if m.invested > 0:
        m.return_pct = round(float(m.unrealized_pl / m.invested * 100), 2)
    return m


# ---- FIRE ---------------------------------------------------------------------------------


def monthly_rate(annual_pct: float) -> float:
    """Effective monthly rate equivalent to an annual return."""
    return (1 + annual_pct / 100) ** (1 / 12) - 1


def future_value(present: float, monthly_contribution: float, annual_return_pct: float, months: int) -> float:
    """Portfolio after `months` with contributions at month end."""
    i = monthly_rate(annual_return_pct)
    growth = (1 + i) ** months
    annuity = months if i == 0 else (growth - 1) / i
    return present * growth + monthly_contribution * annuity


def required_monthly(target: float, present: float, annual_return_pct: float, months: int) -> float:
    """Monthly contribution needed to grow `present` into `target` in `months`."""
    if months <= 0:
        return max(target - present, 0)
    i = monthly_rate(annual_return_pct)
    growth = (1 + i) ** months
    annuity = months if i == 0 else (growth - 1) / i
    return max((target - present * growth) / annuity, 0)


@dataclass
class FireResult:
    years_to_retirement: int
    fire_multiple: float
    fire_number_today: Decimal  # in today's rupees
    fire_number_at_retirement: Decimal  # inflated to the retirement year
    annual_expenses_at_retirement: Decimal
    current_portfolio: Decimal
    progress_pct: float
    remaining_today: Decimal
    projected_portfolio_at_retirement: Decimal
    on_track: bool
    required_monthly_investment: Decimal
    months_to_fire: int | None
    fire_date: date | None
    fire_age: float | None
    projection: list[dict]


def fire_plan(
    current_age: int,
    retirement_age: int,
    annual_expenses: float,
    portfolio: float,
    monthly_contribution: float,
    inflation_pct: float,
    return_pct: float,
    withdrawal_rate_pct: float,
    today: date | None = None,
) -> FireResult:
    today = today or date.today()
    years = max(retirement_age - current_age, 0)
    months = years * 12
    multiple = 100 / withdrawal_rate_pct
    target_today = annual_expenses * multiple
    inflate = lambda yrs: (1 + inflation_pct / 100) ** yrs  # noqa: E731
    target_at_retirement = target_today * inflate(years)
    projected = future_value(portfolio, monthly_contribution, return_pct, months)

    # Month-by-month: when does the portfolio first cover the (inflation-growing) FIRE number?
    i = monthly_rate(return_pct)
    value = portfolio
    months_to_fire = 0 if portfolio >= target_today else None
    projection = [{"age": current_age, "portfolio": d2(portfolio), "fire_number": d2(target_today)}]
    for mth in range(1, 100 * 12 + 1):
        value = value * (1 + i) + monthly_contribution
        target = target_today * inflate(mth / 12)
        if months_to_fire is None and value >= target:
            months_to_fire = mth
        if mth % 12 == 0 and mth <= max(months, (months_to_fire or 0)) + 60 and current_age + mth // 12 <= 100:
            projection.append({"age": current_age + mth // 12, "portfolio": d2(value), "fire_number": d2(target)})
        if months_to_fire is not None and mth >= max(months, months_to_fire) + 60:
            break

    fire_date = today + relativedelta(months=months_to_fire) if months_to_fire is not None else None
    return FireResult(
        years_to_retirement=years,
        fire_multiple=round(multiple, 2),
        fire_number_today=d2(target_today),
        fire_number_at_retirement=d2(target_at_retirement),
        annual_expenses_at_retirement=d2(annual_expenses * inflate(years)),
        current_portfolio=d2(portfolio),
        progress_pct=round(min(portfolio / target_today * 100, 999), 1) if target_today else 0.0,
        remaining_today=d2(max(target_today - portfolio, 0)),
        projected_portfolio_at_retirement=d2(projected),
        on_track=projected >= target_at_retirement,
        required_monthly_investment=d2(required_monthly(target_at_retirement, portfolio, return_pct, months)),
        months_to_fire=months_to_fire,
        fire_date=fire_date,
        fire_age=round(current_age + months_to_fire / 12, 1) if months_to_fire is not None else None,
        projection=projection,
    )


# ---- Goals --------------------------------------------------------------------------------


def goal_plan(
    target: float,
    saved: float,
    target_date: date,
    scenarios: dict[str, float],
    monthly_contribution: float | None = None,
    today: date | None = None,
) -> dict:
    today = today or date.today()
    remaining = max(target - saved, 0)
    months = months_between(today, target_date)
    result = {
        "remaining_amount": d2(remaining),
        "remaining_months": months,
        "progress_pct": round(min(saved / target * 100, 100), 1) if target else 0.0,
        "scenarios": [],
    }
    for name, rate in scenarios.items():
        need = required_monthly(target, saved, rate, months) if months > 0 else remaining
        scenario = {"name": name, "annual_return_pct": rate, "required_monthly": d2(need)}
        if monthly_contribution:
            # When would the goal be reached at the contribution the user plans?
            i = monthly_rate(rate)
            value, m = saved, 0
            while value < target and m < 600:
                value = value * (1 + i) + monthly_contribution
                m += 1
            scenario["estimated_completion"] = today + relativedelta(months=m) if value >= target else None
            scenario["months_needed"] = m if value >= target else None
        result["scenarios"].append(scenario)
    return result


def goal_guidance(months: int, risk: str) -> dict:
    """Plain-language saving approach for a goal's time horizon and risk preference."""
    years = months / 12
    if years < 1:
        horizon = "Short term (under 1 year)"
        options = ["Savings account or sweep-in FD", "Liquid or overnight debt mutual funds", "Short-tenure bank FD"]
        note = "Keep this money safe and easy to access. Equity is not suitable: markets can fall 20–30% in a few months."
    elif years < 3:
        horizon = "Short to medium term (1–3 years)"
        options = ["Bank FD or RD matching the goal date", "Short-duration or money-market debt funds"]
        note = "Prioritise capital safety. Equity can stay below your purchase price for over 3 years, so avoid it here."
    elif years < 5:
        horizon = "Medium term (3–5 years)"
        options = ["RD / FD ladder", "Conservative hybrid or balanced advantage funds"]
        if risk != "low":
            options.append("A small equity index fund allocation (up to ~30%) if you can accept a shortfall")
        note = "A mix of debt and a little equity can help beat inflation, but the equity part can still be down when you need it."
    else:
        horizon = "Long term (5+ years)"
        equity = {"low": "30–40%", "medium": "50–60%", "high": "70–80%"}[risk]
        options = [f"Equity index funds via monthly SIP ({equity} of contributions)", "PPF or debt funds for the rest"]
        note = "Over long periods equity has historically beaten inflation in India, but returns vary a lot year to year. Start shifting to debt 2–3 years before the goal date."
    return {"horizon": horizon, "options": options, "risk_note": note}
