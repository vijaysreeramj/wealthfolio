from decimal import Decimal

from tests.conftest import category_id, make_account


def bal(client, account_id):
    return Decimal(next(a for a in client.get("/api/accounts").json() if a["id"] == account_id)["balance"])


def test_auth_required():
    from fastapi.testclient import TestClient

    from app.main import create_app

    assert TestClient(create_app(use_lifespan=False)).get("/api/accounts").status_code == 401


def test_new_user_gets_defaults(client):
    cats = client.get("/api/categories").json()
    assert any(c["name"] == "Groceries" and c["kind"] == "expense" for c in cats)
    assert any(c["name"] == "Salary" and c["kind"] == "income" for c in cats)
    assert [a["name"] for a in client.get("/api/accounts").json()] == ["Cash"]


def test_balances_and_transfers_not_double_counted(client):
    bank = make_account(client, opening=10000)
    card = make_account(client, name="ICICI Card", type="credit_card", opening=0)

    client.post("/api/transactions", json={"type": "income", "amount": 50000, "date": "2026-11-01",
                                           "account_id": bank["id"], "category_id": category_id(client, "Salary")})
    client.post("/api/transactions", json={"type": "expense", "amount": 1200.50, "date": "2026-11-02",
                                           "account_id": card["id"], "category_id": category_id(client, "Groceries")})
    # Paying the card bill is a transfer, not a second expense
    r = client.post("/api/transactions", json={"type": "transfer", "amount": 1200.50, "date": "2026-11-05",
                                               "account_id": bank["id"], "to_account_id": card["id"]})
    assert r.status_code == 201, r.text

    assert bal(client, bank["id"]) == Decimal("58799.50")
    assert bal(client, card["id"]) == Decimal("0.00")  # card fully paid

    page = client.get("/api/transactions", params={"start": "2026-11-01", "end": "2026-11-30"}).json()
    assert Decimal(page["total_income"]) == Decimal("50000")
    assert Decimal(page["total_expense"]) == Decimal("1200.50")
    assert page["total_count"] == 3


def test_validation(client):
    bank = make_account(client)
    salary = category_id(client, "Salary")
    # expense with an income category
    r = client.post("/api/transactions", json={"type": "expense", "amount": 10, "date": "2026-11-01",
                                               "account_id": bank["id"], "category_id": salary})
    assert r.status_code == 422
    # transfer to same account
    r = client.post("/api/transactions", json={"type": "transfer", "amount": 10, "date": "2026-11-01",
                                               "account_id": bank["id"], "to_account_id": bank["id"]})
    assert r.status_code == 422
    # negative amount
    r = client.post("/api/transactions", json={"type": "income", "amount": -5, "date": "2026-11-01",
                                               "account_id": bank["id"], "category_id": salary})
    assert r.status_code == 422


def test_cannot_touch_other_users_data(client):
    from fastapi.testclient import TestClient

    from app.main import create_app

    bank = make_account(client)
    other = TestClient(create_app(use_lifespan=False))
    other.post("/api/auth/register", json={"name": "B", "email": "other@example.com", "password": "password123"})
    r = other.put(f"/api/accounts/{bank['id']}", json={"name": "x", "type": "bank"})
    assert r.status_code == 404


def test_search_and_delete(client):
    bank = make_account(client)
    r = client.post("/api/transactions", json={"type": "expense", "amount": 450, "date": "2026-11-04",
                                               "account_id": bank["id"], "category_id": category_id(client, "Outside food"),
                                               "note": "Swiggy dinner"})
    tid = r.json()["id"]
    assert client.get("/api/transactions", params={"q": "swiggy"}).json()["total_count"] == 1
    assert client.get("/api/transactions", params={"q": "outside"}).json()["total_count"] == 1
    assert client.delete(f"/api/transactions/{tid}").status_code == 204
    assert client.get("/api/transactions").json()["total_count"] == 0
