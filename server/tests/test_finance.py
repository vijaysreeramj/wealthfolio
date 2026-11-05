from datetime import date
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest

from app.services import finance as f


def inv(**kw):
    base = dict(type="stock", current_price=None, manual_current_value=None, interest_rate=None, compounding=None,
                start_date=None, maturity_date=None, installment_amount=None, is_closed=False)
    return NS(**{**base, **kw})


def tx(type, d, amount, units=None, price=None):
    return NS(type=type, date=d, amount=Decimal(str(amount)), units=Decimal(str(units)) if units else None,
              price=Decimal(str(price)) if price else None)


def test_fd_compound_quarterly():
    # ₹1,00,000 at 7% compounded quarterly for 1 year = 100000 × 1.0175^4
    assert f.compound(100000, 7, "quarterly", 1) == pytest.approx(107185.90, abs=0.01)


def test_rd_maturity_matches_bank_formula():
    # ₹1,000/month for 12 months at 7%, quarterly compounding (standard Indian RD formula)
    expected = sum(1000 * (1 + 0.07 / 4) ** (4 * k / 12) for k in range(1, 13))
    got = f.rd_maturity(1000, 7, "quarterly", date(2026, 1, 1), date(2027, 1, 1))
    assert got == pytest.approx(expected)
    assert 12460 < got < 12470


def test_stock_average_cost_and_realized():
    i = inv(type="stock", current_price=Decimal("250"))
    txns = [tx("buy", date(2025, 1, 1), 1000, 10, 100), tx("buy", date(2025, 2, 1), 2000, 10, 200),
            tx("sell", date(2025, 3, 1), 1500, 5, 300), tx("dividend", date(2025, 4, 1), 60)]
    m = f.investment_metrics(i, txns, date(2026, 1, 1))
    assert m.units == Decimal(15)
    assert m.invested == Decimal("2250.00")  # 15 units × ₹150 average cost
    assert m.realized_pl == Decimal("750")  # sold 5 at 300 vs avg 150
    assert m.current_value == Decimal("3750.00")
    assert m.unrealized_pl == Decimal("1500.00")
    assert m.return_pct == pytest.approx(66.67)
    assert m.income == Decimal("60")
    assert m.value_source == "market_price"


def test_equity_never_gets_interest_applied():
    i = inv(type="mutual_fund", interest_rate=Decimal("12"))
    m = f.investment_metrics(i, [tx("buy", date(2020, 1, 1), 10000, 100, 100)], date(2026, 1, 1))
    assert m.current_value == Decimal("10000.00")  # cost, not 12% compounded
    assert m.value_source == "cost"


def test_fd_value_and_maturity():
    i = inv(type="fd", interest_rate=Decimal("7"), compounding="quarterly", maturity_date=date(2027, 1, 1))
    m = f.investment_metrics(i, [tx("deposit", date(2026, 1, 1), 100000)], date(2026, 7, 2))
    assert m.invested == Decimal("100000.00")
    assert m.maturity_value == Decimal("107185.90")
    assert Decimal("103000") < m.current_value < Decimal("104000")
    assert m.value_source == "calculated"


def test_rd_schedule_without_recorded_deposits():
    i = inv(type="rd", interest_rate=Decimal("7"), compounding="quarterly", installment_amount=Decimal("5000"),
            start_date=date(2026, 1, 10), maturity_date=date(2027, 1, 10))
    m = f.investment_metrics(i, [], date(2026, 3, 15))
    assert m.invested == Decimal("15000.00")  # Jan, Feb, Mar instalments
    assert m.maturity_value is not None and m.maturity_value > Decimal("60000")


def test_manual_value_override_and_closed():
    i = inv(type="other", manual_current_value=Decimal("5500"))
    m = f.investment_metrics(i, [tx("deposit", date(2025, 1, 1), 5000)])
    assert m.current_value == Decimal("5500.00") and m.unrealized_pl == Decimal("500.00")
    closed = f.investment_metrics(inv(type="other", is_closed=True), [tx("deposit", date(2025, 1, 1), 5000)])
    assert closed.current_value == 0 and closed.invested == 0


def test_future_value_and_required_monthly_roundtrip():
    fv = f.future_value(100000, 10000, 10, 120)
    need = f.required_monthly(fv, 100000, 10, 120)
    assert need == pytest.approx(10000, rel=1e-9)
    assert f.future_value(0, 1000, 0, 12) == pytest.approx(12000)


def test_fire_default_25x():
    r = f.fire_plan(30, 50, 600000, 1500000, 50000, 6, 10, 4, today=date(2026, 1, 1))
    assert r.fire_multiple == 25
    assert r.fire_number_today == Decimal("15000000.00")  # 6L × 25
    assert r.progress_pct == 10.0
    assert r.fire_number_at_retirement == f.d2(15000000 * 1.06 ** 20)
    assert r.months_to_fire is not None and r.fire_date is not None
    # Required monthly should exactly reach the target
    fv = f.future_value(1500000, float(r.required_monthly_investment), 10, 240)
    assert fv == pytest.approx(float(r.fire_number_at_retirement), rel=1e-6)


def test_fire_withdrawal_rate_configurable():
    r = f.fire_plan(30, 50, 600000, 0, 0, 6, 10, 3.5)
    assert r.fire_multiple == pytest.approx(28.57, abs=0.01)


def test_goal_plan_no_return_scenario():
    g = f.goal_plan(120000, 20000, date(2027, 1, 1), {"no_return": 0, "moderate": 10}, today=date(2026, 1, 1))
    assert g["remaining_amount"] == Decimal("100000.00")
    assert g["remaining_months"] == 12
    assert g["scenarios"][0]["required_monthly"] == Decimal("8333.33")
    assert g["scenarios"][1]["required_monthly"] < g["scenarios"][0]["required_monthly"]


def test_goal_guidance_short_term_avoids_equity():
    text = " ".join(f.goal_guidance(8, "high")["options"]).lower()
    assert "equity" not in text
