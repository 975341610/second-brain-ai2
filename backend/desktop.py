from __future__ import annotations

import os
import sys

# 🚀 模块导入路径修复：确保项目根目录在 sys.path 中，防止 ModuleNotFoundError
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

import threading
import time
import webbrowser
from pathlib import Path

import uvicorn
import tkinter as tk
from tkinter import messagebox
import requests
import traceback

try:
    import keyboard
except ImportError:
    keyboard = None

try:
    from plyer import notification
except ImportError:
    notification = None

IS_ELECTRON_SIDECAR = os.environ.get("SECOND_BRAIN_ELECTRON_SIDECAR") == "1"
DISABLE_BROWSER = IS_ELECTRON_SIDECAR or os.environ.get("SECOND_BRAIN_DISABLE_BROWSER") == "1"
DISABLE_HOTKEYS = IS_ELECTRON_SIDECAR or os.environ.get("SECOND_BRAIN_DISABLE_HOTKEYS") == "1"


def show_error_popup(error_msg: str):
    """显示原生的错误弹窗"""
    try:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("启动失败 - Second Brain AI", error_msg)
        root.destroy()
    except Exception:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, error_msg, "启动严重错误", 0x10)
        except Exception:
            print(f"CRITICAL ERROR: {error_msg}")


import builtins
import subprocess
from backend.utils import log_buffer, setup_log_interceptor


class _MockEF:
    def __init__(self, *args, **kwargs):
        pass

    def __call__(self, *args, **kwargs):
        return []


builtins.ONNXMiniLM_L6_V2 = _MockEF
builtins.EmbeddingFunction = _MockEF
builtins.Documents = list
builtins.Embeddings = list


def setup_desktop_env():
    if getattr(sys, "frozen", False):
        base_dir = Path(sys.executable).resolve().parent
        os.chdir(base_dir)
        (base_dir / "data").mkdir(parents=True, exist_ok=True)


from backend.main import app


def open_browser() -> None:
    time.sleep(1.5)
    webbrowser.open("http://127.0.0.1:8765")


# ============================================================
# 📝 全局灵感捕获 (Quick Capture)
# ============================================================

def show_quick_capture():
    """弹出 Tkinter 输入框"""
    root = tk.Tk()
    root.title("灵感捕获")

    root.overrideredirect(True)
    root.attributes("-topmost", True)

    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    width, height = 500, 60
    x = (screen_width - width) // 2
    y = (screen_height - height) // 3
    root.geometry(f"{width}x{height}+{x}+{y}")

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
                    if notification:
                        try:
                            notification.notify(
                                title="灵感已捕获！",
                                message=f"灵感已飞向收集箱。经验值 +{exp}",
                                app_name="Second Brain AI",
                                timeout=3,
                            )
                        except Exception as ne:
                            print(f"[!] Notification error: {str(ne)}")
                    else:
                        print("[*] Notification skipped: plyer not available")
            except Exception as e:
                print(f"[!] Quick capture error: {str(e)}")
        root.destroy()

    def cancel(event=None):
        root.destroy()

    entry.bind("<Return>", submit)
    entry.bind("<Escape>", cancel)

    root.mainloop()


def setup_hotkeys():
    """在后台注册全局快捷键"""
    if DISABLE_HOTKEYS:
        print("[*] Global hotkeys disabled by environment.")
        return

    if not keyboard:
        print("[!] Global hotkeys disabled: 'keyboard' module not found.")
        return

    try:
        print("[*] Registering global hotkey: Ctrl+Alt+N")
        keyboard.add_hotkey("ctrl+alt+n", lambda: threading.Thread(target=show_quick_capture, daemon=True).start())
        keyboard.wait()
    except Exception as e:
        print(f"[!] Hotkey error: {str(e)}")


if __name__ == "__main__":
    try:
        setup_log_interceptor()
        setup_desktop_env()

        from backend.config import resource_root
        import json
        metadata_file = resource_root() / "metadata.json"
        metadata = {}
        if metadata_file.exists():
            try:
                with open(metadata_file, "r") as f:
                    metadata = json.load(f)
            except Exception:
                pass

        print(f"[*] Starting Second Brain AI (Browser Mode)...")
        print(f"[*] Version: {metadata.get('version', 'unknown')}")
        print(f"[*] Git Commit: {metadata.get('git_commit', 'unknown')}")
        print(f"[*] Build Time: {metadata.get('build_time', 'unknown')}")
        print(f"[*] Frozen: {getattr(sys, 'frozen', False)}")
        print(f"[*] Executable: {sys.executable}")
        print(f"[*] Current Working Directory: {os.getcwd()}")
        print(f"[*] Electron Sidecar Mode: {IS_ELECTRON_SIDECAR}")
        print(f"[*] Browser Auto Open Disabled: {DISABLE_BROWSER}")
        print(f"[*] Hotkeys Disabled: {DISABLE_HOTKEYS}")

        def run_api():
            try:
                host = os.environ.get("HOST", "127.0.0.1")
                port = int(os.environ.get("PORT", "8765"))
                print(f"[*] Launching API server on http://{host}:{port} ...")
                uvicorn.run(
                    app,
                    host=host,
                    port=port,
                    log_config=None,
                    log_level="info",
                )
            except Exception:
                err_msg = f"API Server Failed to start:\n{traceback.format_exc()}"
                print(f"[!] {err_msg}")
                show_error_popup(err_msg)

        threading.Thread(target=run_api, daemon=True).start()
        threading.Thread(target=setup_hotkeys, daemon=True).start()

        if DISABLE_BROWSER:
            print("[*] Browser auto-open skipped for Electron sidecar mode.")
        else:
            print("[*] Opening Default System Browser...")
            threading.Thread(target=open_browser, daemon=True).start()

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("[*] Shutting down...")
    except Exception:
        full_error = traceback.format_exc()
        print(f"[CRITICAL ERROR] Failed to initialize Second Brain AI:\n{full_error}")
        show_error_popup(f"程序初始化失败，详细错误信息如下：\n\n{full_error}")
        sys.exit(1)

