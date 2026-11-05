import pytest
from fastapi.testclient import TestClient

from app import models  # noqa: F401
from app.db import Base, SessionLocal, embedded_database_url, init_engine
from app.main import create_app


@pytest.fixture(scope="session")
def engine():
    engine = init_engine(embedded_database_url("wealthfolio_test").replace("postgresql://", "postgresql+psycopg://"))
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


@pytest.fixture
def db(engine):
    session = SessionLocal()
    yield session
    session.close()


_counter = 0


@pytest.fixture
def client(engine):
    """A signed-in client for a brand-new user."""
    global _counter
    _counter += 1
    c = TestClient(create_app(use_lifespan=False))
    r = c.post(
        "/api/auth/register",
        json={"name": "Test", "email": f"user{_counter}@example.com", "password": "password123"},
    )
    assert r.status_code == 201, r.text
    return c


def make_account(client, name="HDFC Savings", type="bank", opening=0):
    r = client.post("/api/accounts", json={"name": name, "type": type, "opening_balance": opening})
    assert r.status_code == 201, r.text
    return r.json()


def category_id(client, name):
    return next(c["id"] for c in client.get("/api/categories").json() if c["name"] == name)
