from decimal import Decimal

from tests.conftest import make_account


def balance(client, account_id):
    return Decimal(next(a for a in client.get("/api/accounts").json() if a["id"] == account_id)["balance"])


def test_stock_flow_and_bank_link(client):
    bank = make_account(client, opening=100000)["id"]
    r = client.post("/api/investments", json={
        "name": "Infosys", "type": "stock", "institution": "Zerodha", "symbol": "INFY", "current_price": 1600,
        "interest_rate": 12,  # ignored for equity
        "initial": {"type": "buy", "date": "2026-01-10", "units": 10, "price": 1500, "account_id": bank},
    })
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["interest_rate"] is None
    assert Decimal(inv["metrics"]["invested"]) == 15000
    assert Decimal(inv["metrics"]["current_value"]) == 16000
    assert inv["txns"][0]["account_name"] == "HDFC Savings"
    assert balance(client, bank) == 85000

    # Buying is a transfer, not an expense
    page = client.get("/api/transactions").json()
    assert Decimal(page["total_expense"]) == 0 and page["items"][0]["is_linked"]
    assert page["items"][0]["investment_name"] == "Infosys"
    # and can't be edited from the transactions page
    assert client.delete(f"/api/transactions/{page['items'][0]['id']}").status_code == 409

    # Can't sell more than held
    r = client.post(f"/api/investments/{inv['id']}/txns", json={"type": "sell", "date": "2026-02-01", "units": 11, "price": 1700})
    assert r.status_code == 422
    r = client.post(f"/api/investments/{inv['id']}/txns",
                    json={"type": "sell", "date": "2026-02-01", "units": 4, "price": 1700, "account_id": bank})
    inv = r.json()
    assert Decimal(inv["metrics"]["realized_pl"]) == 800
    assert balance(client, bank) == 85000 + 6800

    # Dividend credited to bank counts as income
    client.post(f"/api/investments/{inv['id']}/txns", json={"type": "dividend", "date": "2026-03-01", "amount": 120, "account_id": bank})
    assert Decimal(client.get("/api/transactions", params={"type": "income"}).json()["total_income"]) == 120

    # Quick price update
    inv = client.patch(f"/api/investments/{inv['id']}/value", json={"current_price": 2000}).json()
    assert Decimal(inv["metrics"]["current_value"]) == 12000

    # Deleting the investment removes its linked bank entries
    assert client.delete(f"/api/investments/{inv['id']}").status_code == 204
    assert balance(client, bank) == 100000


def test_fd_and_networth_no_double_count(client):
    bank = make_account(client, opening=200000)["id"]
    r = client.post("/api/investments", json={
        "name": "SBI FD", "type": "fd", "interest_rate": 7, "compounding": "quarterly",
        "start_date": "2026-01-01", "maturity_date": "2027-01-01",
        "initial": {"type": "deposit", "date": "2026-01-01", "amount": 100000, "account_id": bank},
    })
    assert r.status_code == 201, r.text
    fd = r.json()
    assert Decimal(str(fd["metrics"]["maturity_value"])) == Decimal("107185.90")
    # Equity-style entries are rejected for an FD
    assert client.post(f"/api/investments/{fd['id']}/txns", json={"type": "buy", "date": "2026-02-01", "amount": 5}).status_code == 422

    nw = client.get("/api/dashboard").json()["net_worth"]
    # 1,00,000 left in bank + FD value (>= 1,00,000). The FD money is not counted twice.
    assert Decimal(str(nw["total_assets"])) == 100000 + Decimal(str(fd["metrics"]["current_value"]))


def test_rd_requires_instalment(client):
    r = client.post("/api/investments", json={"name": "RD", "type": "rd", "interest_rate": 7})
    assert r.status_code == 422
    r = client.post("/api/investments", json={"name": "RD", "type": "rd", "interest_rate": 7, "installment_amount": 5000,
                                              "start_date": "2026-01-05", "maturity_date": "2027-01-05"})
    assert r.status_code == 201 and Decimal(r.json()["metrics"]["maturity_value"]) > 60000
