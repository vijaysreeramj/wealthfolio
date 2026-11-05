import inspect
import json

from anthropic.resources.beta.messages import Messages

from app.services import advisor
from tests.conftest import category_id, make_account


def _events(text):
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


def test_snapshot_and_request_shape(client, db):
    bank = make_account(client, opening=10000)["id"]
    client.post("/api/transactions", json={"type": "income", "amount": 90000, "date": "2026-11-01",
                                           "account_id": bank, "category_id": category_id(client, "Salary")})
    client.post("/api/investments", json={"name": "Infosys", "type": "stock", "symbol": "INFY", "current_price": 1500,
                                          "initial": {"type": "buy", "date": "2026-01-01", "units": 10, "price": 1400}})
    user_id = client.get("/api/auth/me").json()["id"]
    snap = advisor.financial_snapshot(db, user_id)
    assert snap["investments"]["holdings"][0]["symbol"] == "INFY"
    assert snap["net_worth"]["assets"]["stocks"] == 15000

    req = advisor.build_request(snap, [{"role": "user", "content": "hi"}])
    # Every argument must exist on the installed SDK's beta stream() method
    inspect.signature(Messages.stream).bind(None, **req)
    assert req["model"] == "claude-opus-5-5"
    assert "<user_financial_snapshot>" in req["system"][1]["text"]
    json.dumps(req, default=str)


def test_chat_streams_and_persists(client, monkeypatch):
    monkeypatch.setattr(advisor, "credentials_available", lambda: True)
    seen = {}

    def fake_stream(snapshot, history):
        seen["history"] = history
        yield {"type": "status", "text": "Searching the web"}
        yield {"type": "text", "text": "Your savings rate "}
        yield {"type": "text", "text": "is healthy."}
        yield {"type": "done", "text": "Your savings rate is healthy.", "sources": [{"url": "https://www.nseindia.com", "title": "NSE"}]}

    monkeypatch.setattr(advisor, "stream_answer", fake_stream)
    r = client.post("/api/advisor/chat", json={"message": "How am I doing?"})
    assert r.status_code == 200
    ev = _events(r.text)
    assert ev[0]["type"] == "thread" and ev[-1]["type"] == "done"
    thread_id = ev[0]["thread_id"]

    # Second turn includes the earlier conversation
    r = client.post("/api/advisor/chat", json={"message": "And my portfolio?", "thread_id": thread_id})
    assert [m["role"] for m in seen["history"]] == ["user", "assistant", "user"]

    t = client.get(f"/api/advisor/threads/{thread_id}").json()
    assert [m["role"] for m in t["messages"]] == ["user", "assistant", "user", "assistant"]
    assert t["messages"][1]["sources"][0]["title"] == "NSE"
    assert client.get("/api/advisor/threads").json()[0]["title"] == "How am I doing?"


def test_chat_without_credentials(client, monkeypatch):
    monkeypatch.setattr(advisor, "credentials_available", lambda: False)
    assert client.get("/api/advisor/status").json()["configured"] is False
    assert client.post("/api/advisor/chat", json={"message": "hi"}).status_code == 503
