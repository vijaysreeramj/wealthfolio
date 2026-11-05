from decimal import Decimal

from tests.conftest import make_account


def D(v):
    return Decimal(str(v))


def test_networth_sources_and_assets(client):
    make_account(client, opening=50000)
    make_account(client, name="Card", type="credit_card", opening=8000)
    client.post("/api/investments", json={"name": "Gold ETF", "type": "gold", "current_price": 100,
                                          "initial": {"type": "buy", "date": "2026-01-01", "units": 100, "price": 80}})
    r = client.post("/api/net-worth/assets", json={"name": "Flat", "type": "property", "value": 5000000})
    assert r.status_code == 201
    flat = r.json()
    client.post("/api/net-worth/assets", json={"name": "Jewellery", "type": "gold_physical", "value": 200000})

    nw = client.get("/api/net-worth").json()
    assert D(nw["assets"]["bank"]) == 50000
    assert D(nw["assets"]["gold"]) == 210000  # ETF 10,000 + physical 2,00,000
    assert D(nw["assets"]["property"]) == 5000000
    assert D(nw["liabilities"]["credit_cards"]) == 8000
    assert D(nw["net_worth"]) == 50000 + 210000 + 5000000 - 8000
    assert nw["monthly_change"] is None and len(nw["history"]) == 1

    r = client.put(f"/api/net-worth/assets/{flat['id']}", json={"name": "Flat", "type": "property", "value": 5500000})
    assert len(r.json()["valuations"]) == 2
    assert D(client.get("/api/net-worth").json()["assets"]["property"]) == 5500000
    assert len(client.get("/api/net-worth").json()["history"]) == 1  # same month snapshot updated, not duplicated


def test_fire_profile(client):
    assert client.get("/api/fire").json()["plan"] is None
    r = client.put("/api/fire", json={"current_age": 30, "retirement_age": 25, "annual_expenses": 600000})
    assert r.status_code == 422
    r = client.put("/api/fire", json={"current_age": 30, "retirement_age": 50, "annual_expenses": 600000,
                                      "use_tracked_portfolio": False, "current_portfolio": 1500000,
                                      "monthly_contribution": 50000})
    assert r.status_code == 200, r.text
    plan = r.json()["plan"]
    assert D(plan["fire_number_today"]) == 15000000
    assert plan["progress_pct"] == 10.0
    assert client.get("/api/dashboard").json()["fire"]["progress_pct"] == 10.0
