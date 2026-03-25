from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

try:
    import webview
except ImportError:
    webview = None

import uvicorn
import tkinter as tk
from tkinter import messagebox
import requests
import keyboard
from plyer import notification


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
import subprocess
from backend.utils import log_buffer, setup_log_interceptor

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
    setup_log_interceptor()
    setup_desktop_env()
    
    # 打印一些调试信息到控制台 (此时会被拦截并存入 buffer)
    from backend.config import resource_root
    import json
    metadata_file = resource_root() / "metadata.json"
    metadata = {}
    if metadata_file.exists():
        try:
            with open(metadata_file, "r") as f:
                metadata = json.load(f)
        except: pass

    print(f"[*] Starting Second Brain AI (Native Window Mode)...")
    print(f"[*] Version: {metadata.get('version', 'unknown')}")
    print(f"[*] Git Commit: {metadata.get('git_commit', 'unknown')}")
    print(f"[*] Build Time: {metadata.get('build_time', 'unknown')}")
    print(f"[*] Frozen: {getattr(sys, 'frozen', False)}")
    print(f"[*] Executable: {sys.executable}")
    print(f"[*] Current Working Directory: {os.getcwd()}")

    # 启动后端线程
    def run_api():
        print("[*] Launching API server...")
        host = os.environ.get("HOST", "127.0.0.1")
        port = int(os.environ.get("PORT", "8765"))
        uvicorn.run(
            app,
            host=host,
            port=port,
            log_config=None,
            log_level="info",
        )

    threading.Thread(target=run_api, daemon=True).start()

    # ============================================================
    # 📝 全局灵感捕获 (Quick Capture)
    # ============================================================
    
    def show_quick_capture():
        """弹出 Tkinter 输入框"""
        root = tk.Tk()
        root.title("灵感捕获")
        
        # 窗口样式：无边框、置顶
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        
        # 居中显示
        screen_width = root.winfo_screenwidth()
        screen_height = root.winfo_screenheight()
        width, height = 500, 60
        x = (screen_width - width) // 2
        y = (screen_height - height) // 3
        root.geometry(f"{width}x{height}+{x}+{y}")
        
        # 简易输入框
        frame = tk.Frame(root, bg="#2d2d2d", highlightthickness=2, highlightbackground="#3d3d3d")
        frame.pack(fill="both", expand=True)
        
        entry = tk.Entry(frame, bg="#2d2d2d", fg="white", font=("Arial", 16), insertbackground="white", borderwidth=0)
        entry.pack(fill="x", padx=15, pady=15)
        entry.focus_set()
        
        def submit(event=None):
            content = entry.get().strip()
            if content:
                try:
                    port = os.environ.get("PORT", "8765")
                    resp = requests.post(f"http://127.0.0.1:{port}/api/notes/quick-capture", json={"content": content}, timeout=3)
                    if resp.status_code == 200:
                        data = resp.json()
                        exp = data.get("exp_gained", 10)
                        # 系统通知 (plyer)
                        notification.notify(
                            title="灵感已捕获！",
                            message=f"灵感已飞向收集箱。经验值 +{exp}",
                            app_name="Second Brain AI",
                            timeout=3
                        )
                except Exception as e:
                    print(f"[!] Quick capture error: {str(e)}")
            root.destroy()

        def cancel(event=None):
            root.destroy()

        # 绑定热键
        entry.bind("<Return>", submit)
        entry.bind("<Escape>", cancel)
        
        root.mainloop()

    def setup_hotkeys():
        """在后台注册全局快捷键"""
        print("[*] Registering global hotkey: Ctrl+Alt+N")
        keyboard.add_hotkey("ctrl+alt+n", lambda: threading.Thread(target=show_quick_capture, daemon=True).start())
        keyboard.wait()

    # 在单独线程运行快捷键监听
    threading.Thread(target=setup_hotkeys, daemon=True).start()

    # 启动前端窗口
    if webview:
        print("[*] Opening Native Window...")
        webview.create_window(
            "Second Brain AI",
            "http://127.0.0.1:8765",
            width=1280,
            height=800,
            background_color="#ffffff"
        )
        webview.start()
    else:
        print("[!] pywebview not installed. Falling back to browser...")
        threading.Thread(target=open_browser, daemon=True).start()
        # 这种情况下主线程不能结束，因为 uvicorn 是在子线程跑的
        while True:
            time.sleep(1)
