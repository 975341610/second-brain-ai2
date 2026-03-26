# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

root = Path.cwd()
frontend_dist = root / "frontend_dist"
backend_data = root / "backend" / "data"

datas = [
    ("VERSION.txt", "."),
]
if (root / "metadata.json").exists():
    datas.append(("metadata.json", "."))
if frontend_dist.exists():
    datas.append((str(frontend_dist), "frontend_dist"))

# 注意：不建议将开发中的 backend/data 目录直接打包，而是让程序启动时动态创建
# 但如果需要内置一些样本数据，可以将其放在 sample_docs 中
sample_docs = root / "data" / "sample_docs"
if sample_docs.exists():
    datas.append((str(sample_docs), "data/sample_docs"))

datas += collect_data_files("chromadb")

hiddenimports = collect_submodules("chromadb") + collect_submodules("keyboard") + collect_submodules("plyer") + [
    "backend",
    "backend.api",
    "backend.agent",
    "backend.models",
    "backend.rag",
    "backend.services",
    "backend.utils",
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.loops.uvloop",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan",
    "uvicorn.lifespan.auto",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "uvicorn.server",
    "uvicorn.config",
    "chromadb",
    "pypdf",
    "sqlalchemy",
    "pydantic",
    "pydantic_settings",
    "webview",
    "keyboard",
    "keyboard._winkeyboard",
    "keyboard._nixkeyboard",
    "plyer",
    "plyer.platforms.win.notification",
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
    [],
    exclude_binaries=True,
    name="SecondBrainAI",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,   # 🚀 Release: 彻底关闭黑窗口
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
