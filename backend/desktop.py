from __future__ import annotations

import sys
import os
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

# 🚀 紧急修复：绕过 chromadb 在 PyInstaller 环境下的 ONNXMiniLM_L6_V2 NameError 报错
# 原因是 chromadb 的默认嵌入函数在打包时无法正确加载，且作为函数默认值被提前求值。
try:
    import chromadb.utils.embedding_functions as ef
    if not hasattr(ef, "ONNXMiniLM_L6_V2"):
        class MockEF:
            def __init__(self, *args, **kwargs): pass
            def __call__(self, *args, **kwargs): return []
        ef.ONNXMiniLM_L6_V2 = MockEF
except Exception:
    pass

# 处理 PyInstaller 打包后的路径问题
def setup_desktop_env():
    if getattr(sys, "frozen", False):
        # 运行时路径切换到 exe 所在目录
        base_dir = Path(sys.executable).resolve().parent
        os.chdir(base_dir)
        # 确保 data 文件夹存在
        (base_dir / "data").mkdir(parents=True, exist_ok=True)

from backend.main import app


def open_browser() -> None:
    time.sleep(1.5)
    webbrowser.open("http://127.0.0.1:8765")


if __name__ == "__main__":
    setup_desktop_env()
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
