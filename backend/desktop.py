from __future__ import annotations

import sys
import os
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

# 🚀 紧急修复：绕过 chromadb 在 PyInstaller 环境下的 ONNXMiniLM_L6_V2 NameError 报错
# 原因是 chromadb 的默认嵌入函数在打包时无法正确加载。
# 我们通过提前注入 Mock 对象来拦截这个报错。
import sys
from types import ModuleType

try:
    # 提前定义一个 Mock 的嵌入函数类
    class MockEF:
        def __init__(self, *args, **kwargs): pass
        def __call__(self, *args, **kwargs): return []

    # 1. 注入到 builtins，防止最底层的 NameError
    import builtins
    builtins.ONNXMiniLM_L6_V2 = MockEF

    # 2. 伪造 chromadb.utils.embedding_functions 模块
    # 这样当 chromadb 内部尝试从这里获取 DefaultEmbeddingFunction 时，会拿到我们的 Mock
    ef_module = ModuleType("chromadb.utils.embedding_functions")
    
    # 注入所需的基类和方法，防止继承报错
    class EmbeddingFunction:
        def __call__(self, input): return []
    
    ef_module.EmbeddingFunction = EmbeddingFunction
    ef_module.ONNXMiniLM_L6_V2 = MockEF
    ef_module.DefaultEmbeddingFunction = lambda: MockEF()
    
    # 强制注入 sys.modules
    sys.modules["chromadb.utils.embedding_functions"] = ef_module
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
