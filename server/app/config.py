from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=SERVER_DIR / ".env", extra="ignore")

    # Leave empty in development to use the embedded Postgres in server/.pgdata
    database_url: str = ""
    jwt_secret: str = "dev-only-secret-change-me-in-server-env-file"
    jwt_expire_days: int = 30
    cookie_secure: bool = False
    anthropic_api_key: str = ""
    advisor_model: str = "claude-opus-5-5"
    # low | medium | high | xhigh | max. Higher = deeper research, more tokens.
    advisor_effort: str = "high"


@lru_cache
def get_settings() -> Settings:
    return Settings()
