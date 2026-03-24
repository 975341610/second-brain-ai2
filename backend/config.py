import json
from functools import lru_cache
from pathlib import Path
import sys

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent


def resource_root() -> Path:
    """获取程序资源根目录（用于前端静态文件、内置资源）"""
    if getattr(sys, "frozen", False):
        # PyInstaller 打包后的临时解压目录
        import sys as _sys
        return Path(getattr(_sys, "_MEIPASS", _sys.executable))
    return PROJECT_DIR


def runtime_root() -> Path:
    """获取程序运行时根目录（用于数据库、上传文件等需要持久化的数据）"""
    if getattr(sys, "frozen", False):
        # exe 所在目录
        return Path(sys.executable).resolve().parent
    # 开发环境下，优先检查工作目录下的 data 是否存在
    if (Path.cwd() / "data").exists():
        return Path.cwd()
    return PROJECT_DIR


def get_custom_config_path() -> Path:
    return runtime_root() / "data_config.json"


def load_custom_data_path() -> str | None:
    config_path = get_custom_config_path()
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
                return config.get("data_path")
        except Exception:
            pass
    return None


class Settings(BaseSettings):
    app_name: str = "Second Brain AI"
    api_prefix: str = "/api"
    
    # 基础路径，默认指向 runtime_root() / 'data'
    data_root: Path = Field(default_factory=lambda: Path(load_custom_data_path() or (runtime_root() / "data")))
    
    @property
    def sqlite_url(self) -> str:
        return f"sqlite:///{(self.data_root / 'second_brain.db').as_posix()}"
    
    @property
    def chroma_path(self) -> str:
        return (self.data_root / "chroma_store").as_posix()
        
    @property
    def uploads_path(self) -> str:
        return (self.data_root / "uploads").as_posix()
        
    @property
    def sample_docs_path(self) -> str:
        return (self.data_root / "sample_docs").as_posix()

    default_provider: str = "openclaw"
    default_model: str = "glm-4.7-flash"
    openclaw_api_key: str = ""
    openclaw_base_url: str = "https://api.openclaw.ai/v1"
    embedding_dimension: int = 256
    chunk_size_words: int = 650
    chunk_overlap_words: int = 80
    top_k: int = 5
    cors_origins: list[str] = ["*"]

    model_config = SettingsConfigDict(env_file=str(PROJECT_DIR / ".env"), extra="ignore")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    # 确保目录存在
    settings.data_root.mkdir(parents=True, exist_ok=True)
    Path(settings.sqlite_url.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)
    Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)
    Path(settings.uploads_path).mkdir(parents=True, exist_ok=True)
    return settings
