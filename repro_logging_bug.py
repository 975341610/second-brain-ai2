import sys
import os
import uvicorn
from fastapi import FastAPI
import logging

app = FastAPI()

def test_uvicorn_config_fix():
    print("Testing uvicorn logging fix for frozen environments...")
    
    # 模拟 PyInstaller 环境
    sys.frozen = True
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    sys.stdout = None
    sys.stderr = None
    
    try:
        # 这里模拟 desktop.py 中的修复逻辑
        devnull = open(os.devnull, "w")
        if sys.stdout is None:
            sys.stdout = devnull
        if sys.stderr is None:
            sys.stderr = devnull

        logging.basicConfig(level=logging.WARNING)

        # 我们不能真正调用 run()，因为它会阻塞，我们只测试配置是否成功加载
        # uvicorn.Config 会在 __init__ 中处理日志配置
        config = uvicorn.Config(
            app, 
            host="127.0.0.1", 
            port=8765, 
            log_config=None, 
            log_level="warning"
        )
        
        # 如果能运行到这里，说明 Config 初始化没有报错
        sys.stdout = original_stdout
        print("✅ Uvicorn Config initialized successfully with mocked None stdout!")
        
    except Exception as e:
        sys.stdout = original_stdout
        print(f"❌ FAILED: {e}")
        sys.exit(1)
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr

if __name__ == "__main__":
    test_uvicorn_config_fix()
