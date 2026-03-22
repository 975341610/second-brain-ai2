from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
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
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix=settings.api_prefix)

frontend_dist = runtime_root() / "frontend_dist"
assets_dir = frontend_dist / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# Mount media uploads
uploads_dir = Path(settings.uploads_path)
if uploads_dir.exists():
    app.mount("/api/media/files", StaticFiles(directory=uploads_dir), name="media")

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
        if "is_title_manually_edited" not in note_columns:
            connection.execute(text("ALTER TABLE notes ADD COLUMN is_title_manually_edited INTEGER DEFAULT 0"))
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
    """
    SPA Fallback Route:
    1. If requested path matches a file in frontend_dist, serve it.
    2. Otherwise, if not an api call, return index.html for SPA.
    3. Else return 404.
    """
    # 1. Check if it's a direct file in frontend_dist (like favicon.svg, robots.txt)
    # Exclude directories and index.html to avoid infinite loops
    target_file = frontend_dist / full_path
    
    # Special handle for common web files if full_path is empty but requested
    if not full_path:
        # If accessing root, always try index.html first via fallback below
        pass
    elif target_file.is_file() and target_file.name != "index.html":
        return FileResponse(target_file)
    elif full_path == "favicon.ico" and (frontend_dist / "favicon.svg").exists():
        return FileResponse(frontend_dist / "favicon.svg")

    # 2. Skip SPA fallback for API routes, health, and assets to avoid 200 OK for 404
    if full_path.startswith("api") or full_path == "health" or full_path.startswith("assets"):
         raise HTTPException(status_code=404, detail="Resource not found")
    
    # 3. Handle SPA fallback (only if index.html exists)
    index_file = frontend_dist / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    
    # 4. Fallback if no frontend is built
    return JSONResponse({"status": "backend-only"}, status_code=200)
