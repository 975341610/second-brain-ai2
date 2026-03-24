from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

# ============================================================
# 🔧 ChromaDB PyInstaller 最终修复 (v0.3.36)
#
# 之前的方案（Builtins 注入或 sys.modules 劫持）在某些环境下
# 会引发循环导入。现在的核心方案是：
#
# 1. 延迟导入（Lazy Import）：
#    修改 backend/services/vector_store.py，使 chromadb 仅在
#    第一次数据库操作时才被载入。
#
# 2. 注入 Mock 环境：
#    在 desktop.py 启动时，为可能的 chromadb 依赖项提供降级
#    环境，防止打包后的 chromadb 因为缺少 ONNX runtime 报错。
# ============================================================

import builtins

class _MockEF:
    def __init__(self, *args, **kwargs): pass
    def __call__(self, *args, **kwargs): return []

# 注入必要的全局符号，防止 chromadb 内部导入失败时抛出 NameError
builtins.ONNXMiniLM_L6_V2 = _MockEF
builtins.EmbeddingFunction = _MockEF
builtins.Documents = list
builtins.Embeddings = list

# ============================================================

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
    # 等待服务器完全启动
    time.sleep(1.5)
    webbrowser.open("http://127.0.0.1:8765")


if __name__ == "__main__":
    setup_desktop_env()
    threading.Thread(target=open_browser, daemon=True).start()

    # ============================================================
    # 🔧 PyInstaller 打包后 sys.stdout/stderr 为 None
    # uvicorn 的 DefaultFormatter 在初始化时会调用 stream.isatty()
    # 导致 AttributeError → ValueError: Unable to configure formatter
    # 修复：将 None 的流重定向到 os.devnull，同时在 frozen 环境下
    # 使用最简日志配置，绕过 uvicorn 的彩色格式器。
    # ============================================================
    if getattr(sys, "frozen", False):
        # 重定向空流，防止 uvicorn/logging 访问 None.isatty()
        devnull = open(os.devnull, "w")
        if sys.stdout is None:
            sys.stdout = devnull
        if sys.stderr is None:
            sys.stderr = devnull

        # 使用最简日志配置，跳过 uvicorn 的 DefaultFormatter
        import logging
        logging.basicConfig(level=logging.WARNING)

        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8765,
            log_config=None,   # 完全禁用 uvicorn 自带的日志配置
            log_level="warning",
        )
    else:
        uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
