from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from backend.api.routes import router
from backend.config import get_settings, runtime_root
from backend.database import Base, SessionLocal, engine
from backend.sample_data import seed_database, seed_files


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

frontend_dist = runtime_root() / "frontend_dist"
assets_dir = frontend_dist / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

def run_migrations() -> None:
    inspector = inspect(engine)
    with engine.begin() as connection:
        if "notebooks" not in inspector.get_table_names():
            connection.execute(text("CREATE TABLE notebooks (id INTEGER PRIMARY KEY, name VARCHAR(255) UNIQUE, created_at DATETIME)"))
        notebook_columns = {column["name"] for column in inspector.get_columns("notebooks")} if "notebooks" in inspector.get_table_names() else set()
        if "icon" not in notebook_columns:
            connection.execute(text("ALTER TABLE notebooks ADD COLUMN icon VARCHAR(500) DEFAULT '📒'"))
        if "deleted_at" not in notebook_columns:
            connection.execute(text("ALTER TABLE notebooks ADD COLUMN deleted_at DATETIME"))
        note_columns = {column["name"] for column in inspector.get_columns("notes")} if "notes" in inspector.get_table_names() else set()
        if "notebook_id" not in note_columns:
            connection.execute(text("ALTER TABLE notes ADD COLUMN notebook_id INTEGER"))
        if "position" not in note_columns:
            connection.execute(text("ALTER TABLE notes ADD COLUMN position INTEGER DEFAULT 0"))
        if "icon" not in note_columns:
            connection.execute(text("ALTER TABLE notes ADD COLUMN icon VARCHAR(500) DEFAULT '📝'"))
        if "deleted_at" not in note_columns:
            connection.execute(text("ALTER TABLE notes ADD COLUMN deleted_at DATETIME"))
        task_columns = {column["name"] for column in inspector.get_columns("tasks")} if "tasks" in inspector.get_table_names() else set()
        if "priority" not in task_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN priority VARCHAR(20) DEFAULT 'medium'"))
        if "task_type" not in task_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN task_type VARCHAR(50) DEFAULT 'work'"))
        if "deadline" not in task_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN deadline DATETIME"))


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


@app.get("/{full_path:path}", response_model=None)
async def spa(full_path: str):
    index_file = frontend_dist / "index.html"
    if index_file.exists() and not full_path.startswith("api") and full_path != "health":
        return FileResponse(index_file)
    return FileResponse(index_file) if index_file.exists() else JSONResponse({"status": "backend-only"})
