from decimal import Decimal

from tests.conftest import category_id, make_account


def spend(client, account, cat, amount, d="2026-11-10"):
    r = client.post("/api/transactions", json={"type": "expense", "amount": amount, "date": d,
                                               "account_id": account, "category_id": category_id(client, cat)})
    assert r.status_code == 201, r.text


def test_budget_alerts_and_history(client):
    bank = make_account(client, opening=100000)["id"]
    for cat, amt in [("Outside food", 5000), ("Groceries", 4000), ("Shopping", 3000), ("Transport", 2000)]:
        r = client.post("/api/budgets", json={"category_id": category_id(client, cat), "month": "2026-11-01", "amount": amt})
        assert r.status_code == 201, r.text
    # duplicate budget rejected
    r = client.post("/api/budgets", json={"category_id": category_id(client, "Groceries"), "month": "2026-11-15", "amount": 1})
    assert r.status_code == 409

    spend(client, bank, "Outside food", 3800)  # 76% -> warning
    spend(client, bank, "Groceries", 3700)  # 92.5% -> critical
    spend(client, bank, "Shopping", 3100)  # 103% -> exceeded
    spend(client, bank, "Health", 999)  # no budget
    spend(client, bank, "Transport", 500, d="2026-10-31")  # previous month, ignored

    month = client.get("/api/budgets", params={"month": "2026-11-01"}).json()
    by = {i["category_name"]: i for i in month["items"]}
    assert by["Outside food"]["alert"] == "warning"
    assert by["Groceries"]["alert"] == "critical"
    assert by["Shopping"]["alert"] == "exceeded"
    assert Decimal(by["Shopping"]["remaining"]) == Decimal("-100")
    assert by["Transport"]["alert"] is None and Decimal(by["Transport"]["spent"]) == 0
    assert Decimal(month["total_budget"]) == 14000
    assert Decimal(month["unbudgeted_spent"]) == 999

    assert client.post("/api/budgets/copy", json={"from_month": "2026-11-01", "to_month": "2026-12-01"}).json()["copied"] == 4
    assert client.post("/api/budgets/copy", json={"from_month": "2026-11-01", "to_month": "2026-12-01"}).json()["copied"] == 0
    hist = client.get("/api/budgets/history", params={"months": 2, "end": "2026-12-01"}).json()
    assert [h["over_budget_categories"] for h in hist] == [["Shopping"], []]


def test_dashboard_numbers(client):
    bank = make_account(client, opening=10000)["id"]
    client.post("/api/transactions", json={"type": "income", "amount": 100000, "date": "2026-11-01",
                                           "account_id": bank, "category_id": category_id(client, "Salary")})
    spend(client, bank, "Groceries", 20000)
    spend(client, bank, "Rent", 25000)
    loan = make_account(client, name="Car loan", type="loan", opening=300000)["id"]

    d = client.get("/api/dashboard", params={"mode": "month", "start": "2026-11-01", "end": "2026-11-30"}).json()
    assert Decimal(d["income"]) == 100000
    assert Decimal(d["expense"]) == 45000
    assert Decimal(d["savings"]) == 55000
    assert d["savings_rate_pct"] == 55.0
    assert len(d["trend"]) == 6 and Decimal(d["trend"][-1]["expense"]) == 45000
    assert d["expense_breakdown"][0]["category"] == "Rent"
    # Bank: 10000 + 100000 - 45000 = 65000; loan 3,00,000 owed
    assert Decimal(d["net_worth"]["total_assets"]) == 65000
    assert Decimal(d["net_worth"]["total_liabilities"]) == 300000
    assert Decimal(d["net_worth"]["net_worth"]) == -235000
    assert len(d["net_worth"]["history"]) == 1

    y = client.get("/api/dashboard", params={"mode": "year", "start": "2026-01-01", "end": "2026-12-31"}).json()
    assert len(y["trend"]) == 12 and Decimal(y["income"]) == 100000
