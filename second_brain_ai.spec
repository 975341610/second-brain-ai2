# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

root = Path.cwd()
frontend_dist = root / "frontend_dist"
backend_data = root / "backend" / "data"

datas = []
if frontend_dist.exists():
    datas.append((str(frontend_dist), "frontend_dist"))
if backend_data.exists():
    datas.append((str(backend_data), "backend/data"))

datas += collect_data_files("chromadb")

hiddenimports = collect_submodules("chromadb") + [
    "backend",
    "backend.api",
    "backend.agent",
    "backend.models",
    "backend.rag",
    "backend.services",
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "uvicorn.server",
    "uvicorn.config",
    "chromadb",
    "pypdf",
    "sqlalchemy",
    "pydantic",
    "pydantic_settings",
]

a = Analysis(
    ["backend/desktop.py"],
    pathex=[str(root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="SecondBrainAI",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="SecondBrainAI",
)
