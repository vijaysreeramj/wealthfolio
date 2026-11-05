from datetime import date

from dateutil.relativedelta import relativedelta


def test_goal_lifecycle(client):
    target_date = (date.today() + relativedelta(months=24)).isoformat()
    r = client.post("/api/goals", json={"name": "Car", "category": "car", "target_amount": 800000, "current_savings": 200000,
                                        "target_date": target_date, "priority": "high", "risk_preference": "medium",
                                        "monthly_contribution": 30000})
    assert r.status_code == 201, r.text
    g = r.json()
    assert g["remaining_months"] in (23, 24)
    names = [s["name"] for s in g["scenarios"]]
    assert names == ["no_return", "conservative", "moderate"]
    no_ret = g["scenarios"][0]
    assert abs(float(no_ret["required_monthly"]) - 600000 / g["remaining_months"]) < 1
    assert g["scenarios"][2]["required_monthly"] < no_ret["required_monthly"]
    assert "return_warning" in g["guidance"]  # 10% assumed on a 2-year goal
    assert "equity" not in " ".join(g["guidance"]["options"]).lower()
    assert g["status"] == "on_track"

    assert client.post("/api/goals", json={"name": "x", "target_amount": 1, "target_date": "2020-01-01"}).status_code == 422
    lst = client.get("/api/goals").json()
    assert len(lst["items"]) == 1 and float(lst["total_target"]) == 800000
    assert client.delete(f"/api/goals/{g['id']}").status_code == 204
