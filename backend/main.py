from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

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


@app.on_event("startup")
async def startup_event() -> None:
    Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
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
