from __future__ import annotations

import os
import threading
import time
import webbrowser

import uvicorn

from backend.main import app
from backend.version import APP_VERSION


NO_BROWSER_ENV = "SECOND_BRAIN_AI_NO_BROWSER"


def open_browser() -> None:
    if os.environ.get(NO_BROWSER_ENV) == "1":
        return
    time.sleep(1.2)
    webbrowser.open("http://127.0.0.1:8765")


if __name__ == "__main__":
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=8765, server_header=False, headers=[("X-App-Version", APP_VERSION)])
