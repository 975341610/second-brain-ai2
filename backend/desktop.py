from __future__ import annotations

import os
import sys
import threading
import time
import traceback
import webbrowser
from pathlib import Path
from urllib.request import urlopen

import uvicorn

from backend.main import app, frontend_dist, frontend_index_html
from backend.version import APP_VERSION


NO_BROWSER_ENV = "SECOND_BRAIN_AI_NO_BROWSER"
APP_URL = "http://127.0.0.1:8765"
LOG_FILE_NAME = "startup-error.log"
_DEVNULL_READER = None
_DEVNULL_WRITER = None


def runtime_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def log_path() -> Path:
    return runtime_dir() / LOG_FILE_NAME


def append_startup_log(message: str) -> None:
    try:
        with log_path().open("a", encoding="utf-8") as handle:
            handle.write(message.rstrip() + "\n")
    except OSError:
        pass


def ensure_stdio() -> None:
    global _DEVNULL_READER, _DEVNULL_WRITER
    if sys.stdout is None or sys.stderr is None:
        if _DEVNULL_WRITER is None:
            _DEVNULL_WRITER = open(os.devnull, "w", encoding="utf-8")
        if sys.stdout is None:
            sys.stdout = _DEVNULL_WRITER
        if sys.stderr is None:
            sys.stderr = _DEVNULL_WRITER
    if sys.stdin is None:
        if _DEVNULL_READER is None:
            _DEVNULL_READER = open(os.devnull, "r", encoding="utf-8")
        sys.stdin = _DEVNULL_READER


def show_startup_error(message: str) -> None:
    append_startup_log(message)
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, message, "Second Brain AI 启动失败", 0x10)
    except Exception:
        pass


def wait_for_server(timeout_seconds: float = 25.0) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urlopen(f"{APP_URL}/health", timeout=1.2) as response:
                if response.status == 200:
                    return True
        except Exception:
            time.sleep(0.4)
    return False


def open_browser() -> None:
    if os.environ.get(NO_BROWSER_ENV) == "1":
        return
    if wait_for_server():
        webbrowser.open(APP_URL)


def main() -> None:
    ensure_stdio()
    append_startup_log(f"Starting Second Brain AI {APP_VERSION}")
    append_startup_log(f"Runtime dir: {runtime_dir()}")
    append_startup_log(f"Frontend dir: {frontend_dist if frontend_dist else 'missing'}")
    append_startup_log(f"Frontend index exists: {bool(frontend_dist and (frontend_dist / 'index.html').exists())}")
    append_startup_log(f"Frontend HTML cached: {frontend_index_html is not None}")
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8765,
        server_header=False,
        headers=[("X-App-Version", APP_VERSION)],
        log_config=None,
        access_log=False,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        error_text = traceback.format_exc()
        show_startup_error(f"Second Brain AI 启动失败。\n\n日志文件：{log_path()}\n\n{error_text}")
        raise
