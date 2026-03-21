from functools import lru_cache
from pathlib import Path
import sys

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent


def runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return PROJECT_DIR


class Settings(BaseSettings):
    app_name: str = "Second Brain AI"
    api_prefix: str = "/api"
    sqlite_url: str = Field(default=f"sqlite:///{(runtime_root() / 'data' / 'second_brain.db').as_posix()}")
    chroma_path: str = Field(default=(runtime_root() / "data" / "chroma_store").as_posix())
    default_provider: str = "openclaw"
    default_model: str = "glm-4.7-flash"
    openclaw_api_key: str = ""
    openclaw_base_url: str = "https://api.openclaw.ai/v1"
    embedding_dimension: int = 256
    chunk_size_words: int = 650
    chunk_overlap_words: int = 80
    top_k: int = 5
    cors_origins: list[str] = ["*"]
    sample_docs_path: str = Field(default=(runtime_root() / "data" / "sample_docs").as_posix())

    model_config = SettingsConfigDict(env_file=str(PROJECT_DIR / ".env"), extra="ignore")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    Path(settings.sqlite_url.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)
    Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)
    return settings
