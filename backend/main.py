from __future__ import annotations

import os
import sys

# 🚀 模块导入路径修复：确保项目根目录在 sys.path 中，防止 ModuleNotFoundError
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from backend.api.routes import router
from backend.config import get_settings, resource_root, runtime_root
from backend.database import Base, SessionLocal, engine
from backend.sample_data import seed_database, seed_files


settings = get_settings()
app = FastAPI(title=settings.app_name)

# 读取并打印版本号
version_file = resource_root() / "VERSION.txt"
version = "unknown"
try:
    if version_file.exists():
        version = version_file.read_text(encoding="utf-8").strip()
    else:
        print(f"[!] VERSION.txt not found at {version_file}")
except Exception as e:
    print(f"[!] Error reading VERSION.txt: {str(e)}")
print(f"[*] Second Brain AI Version: {version}")

app.add_middleware(
     CORSMiddleware,
     allow_origins=settings.cors_origins,
     allow_credentials=False,
     allow_methods=["*"],
     allow_headers=["*"],
 )

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # 豁免路径：健康检查、静态文件、以及认证配置本身不开启时
    # 基础初始化 API 也不强制鉴权，避免桌面端启动卡死
    is_exempt = (
        not settings.access_token
        or request.url.path == "/health"
        or not request.url.path.startswith(settings.api_prefix)
        or request.url.path.startswith(f"{settings.api_prefix}/media/files")
        or request.url.path == f"{settings.api_prefix}/system/version"
        or request.url.path == f"{settings.api_prefix}/model-config"
    )

    # 如果是本地桌面端发起的请求 (127.0.0.1)，且没有设置环境变量强制开启鉴权，则自动豁免
    # 这确保了打包版在没有配置 token 时也能正常初始化
    is_local = request.client and request.client.host == "127.0.0.1"
    
    if is_exempt or is_local:
        return await call_next(request)

    # 从 Header 或 Cookie 中获取 Token
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    if not token:
        token = request.cookies.get("access_token")

    if token != settings.access_token:
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized: Invalid or missing access token"}
        )

    return await call_next(request)

app.include_router(router, prefix=settings.api_prefix)

frontend_dist = resource_root() / "frontend_dist"
assets_dir = frontend_dist / "assets"

# 调试信息
print(f"[*] Frontend dist directory: {frontend_dist}")
print(f"[*] Frontend index.html exists: {(frontend_dist / 'index.html').exists()}")

if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
else:
    print(f"[!] Assets directory not found at {assets_dir}")

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
        
        # UserStats migration
        if "user_stats" not in inspector.get_table_names():
            connection.execute(text("CREATE TABLE user_stats (id INTEGER PRIMARY KEY, exp INTEGER DEFAULT 0, level INTEGER DEFAULT 1, total_captures INTEGER DEFAULT 0, updated_at DATETIME)"))
        
        user_stats_columns = {column["name"] for column in inspector.get_columns("user_stats")} if "user_stats" in inspector.get_table_names() else set()
        if "current_theme" not in user_stats_columns:
            connection.execute(text("ALTER TABLE user_stats ADD COLUMN current_theme VARCHAR(50) DEFAULT 'default'"))
        if "wallpaper_url" not in user_stats_columns:
            connection.execute(text("ALTER TABLE user_stats ADD COLUMN wallpaper_url VARCHAR(1000)"))

        # Achievements migration
        if "achievements" not in inspector.get_table_names():
            connection.execute(text("CREATE TABLE achievements (id INTEGER PRIMARY KEY, name VARCHAR(255) UNIQUE, description VARCHAR(500), condition_type VARCHAR(50), condition_value INTEGER, icon VARCHAR(500), created_at DATETIME)"))
        if "user_achievements" not in inspector.get_table_names():
            connection.execute(text("CREATE TABLE user_achievements (id INTEGER PRIMARY KEY, achievement_id INTEGER, unlocked_at DATETIME, FOREIGN KEY(achievement_id) REFERENCES achievements(id) ON DELETE CASCADE)"))


@app.on_event("startup")
async def startup_event() -> None:
    Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    run_migrations()
    seed_files()
    with SessionLocal() as db:
        seed_database(db)
        from backend.services.repositories import init_default_achievements
        init_default_achievements(db)


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


if __name__ == '__main__':
    import uvicorn
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()
    
    # 获取环境变量（由 Electron 传入的覆盖优先）
    port = int(os.environ.get("PORT", args.port))
    host = os.environ.get("HOST", args.host)
    
    print(f"[*] Starting backend server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
