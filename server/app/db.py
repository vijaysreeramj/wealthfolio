from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import SERVER_DIR, get_settings


def embedded_database_url(database: str) -> str:
    """Start (or reuse) the embedded development Postgres in server/.pgdata and ensure `database` exists."""
    import pgserver  # dev dependency
    import psycopg

    server = pgserver.get_server(SERVER_DIR / ".pgdata", cleanup_mode=None)
    with psycopg.connect(server.get_uri(), autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (database,)).fetchone()
        if not exists:
            conn.execute(f'CREATE DATABASE "{database}"')
    return server.get_uri(database)


def resolve_database_url() -> str:
    """Use DATABASE_URL if set, otherwise the embedded development Postgres."""
    url = get_settings().database_url or embedded_database_url("wealthfolio")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


class Base(DeclarativeBase):
    pass


engine = None
SessionLocal = sessionmaker(autoflush=False, expire_on_commit=False)


def init_engine(url: str | None = None):
    global engine
    engine = create_engine(url or resolve_database_url(), pool_pre_ping=True)
    SessionLocal.configure(bind=engine)
    return engine


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
