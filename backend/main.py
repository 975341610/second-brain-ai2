from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from backend.api.routes import router
from backend.config import bundle_root, get_settings, runtime_root
from backend.database import Base, SessionLocal, engine
from backend.sample_data import seed_database, seed_files
from backend.version import APP_VERSION


settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix=settings.api_prefix)


def resolve_frontend_dist() -> Path | None:
    candidates: list[Path] = []
    for root in [bundle_root(), runtime_root(), runtime_root() / "_internal", bundle_root().parent]:
        candidate = root / "frontend_dist"
        if candidate not in candidates:
            candidates.append(candidate)
    for candidate in candidates:
        if (candidate / "index.html").exists():
            return candidate
    return None


frontend_dist = resolve_frontend_dist()
index_file = frontend_dist / "index.html" if frontend_dist else None
try:
    frontend_index_html = index_file.read_text(encoding="utf-8") if index_file and index_file.exists() else None
except OSError:
    frontend_index_html = None
assets_dir = frontend_dist / "assets" if frontend_dist else None
if assets_dir and assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


def spa_index_response():
    if frontend_index_html is not None:
        return HTMLResponse(frontend_index_html)
    return JSONResponse({"status": "backend-only"})


def _ensure_table(connection, table_name: str, create_sql: str) -> None:
    inspector = inspect(connection)
    if table_name not in inspector.get_table_names():
        connection.execute(text(create_sql))


def _ensure_column(connection, table_name: str, column_name: str, definition: str) -> None:
    inspector = inspect(connection)
    columns = {column["name"] for column in inspector.get_columns(table_name)} if table_name in inspector.get_table_names() else set()
    if column_name not in columns:
        connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {definition}"))


def run_migrations() -> None:
    with engine.begin() as connection:
        _ensure_table(connection, "notebooks", "CREATE TABLE notebooks (id INTEGER PRIMARY KEY, name VARCHAR(255) UNIQUE, created_at DATETIME)")
        _ensure_table(connection, "tasks", "CREATE TABLE tasks (id INTEGER PRIMARY KEY, title VARCHAR(255), status VARCHAR(20) DEFAULT 'todo', created_at DATETIME)")
        _ensure_table(connection, "notes", "CREATE TABLE notes (id INTEGER PRIMARY KEY, title VARCHAR(255), content TEXT, summary TEXT DEFAULT '', tags VARCHAR(500) DEFAULT '', created_at DATETIME, updated_at DATETIME)")
        _ensure_table(connection, "model_configs", "CREATE TABLE model_configs (id INTEGER PRIMARY KEY, provider VARCHAR(50) DEFAULT 'openclaw', api_key VARCHAR(255) DEFAULT '', base_url VARCHAR(255) DEFAULT '', model_name VARCHAR(255) DEFAULT 'glm-4.7-flash', updated_at DATETIME)")
        _ensure_table(connection, "note_templates", "CREATE TABLE note_templates (id INTEGER PRIMARY KEY, name VARCHAR(255) UNIQUE, description TEXT DEFAULT '', icon VARCHAR(500) DEFAULT '📝', note_type VARCHAR(50) DEFAULT 'note', default_title VARCHAR(255) DEFAULT '未命名笔记', default_content TEXT DEFAULT '', metadata_json TEXT DEFAULT '{}', created_at DATETIME, updated_at DATETIME)")
        _ensure_table(connection, "app_settings", "CREATE TABLE app_settings (key VARCHAR(100) PRIMARY KEY, value TEXT DEFAULT '{}', updated_at DATETIME)")
        _ensure_table(connection, "update_states", f"CREATE TABLE update_states (id INTEGER PRIMARY KEY, channel VARCHAR(20) DEFAULT 'stable', current_version VARCHAR(50) DEFAULT '{APP_VERSION}', staged_version VARCHAR(50), package_path VARCHAR(500), package_kind VARCHAR(50), manifest_json TEXT DEFAULT '{{}}', status VARCHAR(50) DEFAULT 'idle', last_error TEXT DEFAULT '', updated_at DATETIME)")

        _ensure_column(connection, "notebooks", "icon", "icon VARCHAR(500) DEFAULT '📒'")
        _ensure_column(connection, "notebooks", "deleted_at", "deleted_at DATETIME")

        _ensure_column(connection, "notes", "notebook_id", "notebook_id INTEGER")
        _ensure_column(connection, "notes", "position", "position INTEGER DEFAULT 0")
        _ensure_column(connection, "notes", "icon", "icon VARCHAR(500) DEFAULT '📝'")
        _ensure_column(connection, "notes", "deleted_at", "deleted_at DATETIME")
        _ensure_column(connection, "notes", "note_type", "note_type VARCHAR(50) DEFAULT 'note'")
        _ensure_column(connection, "notes", "template_id", "template_id INTEGER")
        _ensure_column(connection, "notes", "is_private", "is_private BOOLEAN DEFAULT 0")
        _ensure_column(connection, "notes", "journal_date", "journal_date VARCHAR(20)")
        _ensure_column(connection, "notes", "period_type", "period_type VARCHAR(20)")
        _ensure_column(connection, "notes", "start_at", "start_at DATETIME")
        _ensure_column(connection, "notes", "end_at", "end_at DATETIME")

        _ensure_column(connection, "tasks", "priority", "priority VARCHAR(20) DEFAULT 'medium'")
        _ensure_column(connection, "tasks", "task_type", "task_type VARCHAR(50) DEFAULT 'work'")
        _ensure_column(connection, "tasks", "deadline", "deadline DATETIME")

        _ensure_column(connection, "model_configs", "updated_at", "updated_at DATETIME")
        _ensure_column(connection, "note_templates", "description", "description TEXT DEFAULT ''")
        _ensure_column(connection, "note_templates", "icon", "icon VARCHAR(500) DEFAULT '📝'")
        _ensure_column(connection, "note_templates", "note_type", "note_type VARCHAR(50) DEFAULT 'note'")
        _ensure_column(connection, "note_templates", "default_title", "default_title VARCHAR(255) DEFAULT '未命名笔记'")
        _ensure_column(connection, "note_templates", "default_content", "default_content TEXT DEFAULT ''")
        _ensure_column(connection, "note_templates", "metadata_json", "metadata_json TEXT DEFAULT '{}'")
        _ensure_column(connection, "note_templates", "created_at", "created_at DATETIME")
        _ensure_column(connection, "note_templates", "updated_at", "updated_at DATETIME")
        _ensure_column(connection, "app_settings", "value", "value TEXT DEFAULT '{}'")
        _ensure_column(connection, "app_settings", "updated_at", "updated_at DATETIME")
        _ensure_column(connection, "update_states", "channel", "channel VARCHAR(20) DEFAULT 'stable'")
        _ensure_column(connection, "update_states", "current_version", f"current_version VARCHAR(50) DEFAULT '{APP_VERSION}'")
        _ensure_column(connection, "update_states", "staged_version", "staged_version VARCHAR(50)")
        _ensure_column(connection, "update_states", "package_path", "package_path VARCHAR(500)")
        _ensure_column(connection, "update_states", "package_kind", "package_kind VARCHAR(50)")
        _ensure_column(connection, "update_states", "manifest_json", "manifest_json TEXT DEFAULT '{}'")
        _ensure_column(connection, "update_states", "status", "status VARCHAR(50) DEFAULT 'idle'")
        _ensure_column(connection, "update_states", "last_error", "last_error TEXT DEFAULT ''")
        _ensure_column(connection, "update_states", "updated_at", "updated_at DATETIME")


@app.on_event("startup")
async def startup_event() -> None:
    Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    run_migrations()
    seed_files()
    with SessionLocal() as db:
        seed_database(db)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_model=None)
async def spa_root():
    return spa_index_response()


@app.get("/{full_path:path}", response_model=None)
async def spa(full_path: str):
    if full_path.startswith("api") or full_path == "health":
        return JSONResponse({"status": "backend-only"})
    return spa_index_response()
