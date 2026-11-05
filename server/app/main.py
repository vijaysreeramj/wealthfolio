from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import init_engine
from .routers import accounts, auth, categories, transactions


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_engine()
    yield


def create_app(use_lifespan: bool = True) -> FastAPI:
    app = FastAPI(title="Wealthfolio API", version="0.1.0", lifespan=lifespan if use_lifespan else None)
    for module in (auth, accounts, categories, transactions):
        app.include_router(module.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
