import os
import sys
import subprocess
import shutil
from pathlib import Path

def build_backend():
    # 路径设置
    project_root = Path(__file__).parent.parent
    backend_dir = project_root / "backend"
    dist_dir = backend_dir / "dist"
    
    # 确保在 backend 目录
    os.chdir(backend_dir)
    
    print(f"[*] Starting Backend Build at {backend_dir}...")
    
    # 清理旧产物
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    
    # 构建命令
    # 注意：针对 ChromaDB 和其他库的优化
    # --collect-all chromadb 确保包含所有必要文件
    # --hidden-import 避免关键库遗漏
    # --onefile 打包成单个 exe (或者根据需求使用 --onedir)
    # 根据用户反馈，之前出现过循环导入，这里我们使用 --onedir 更加稳健
    
    cmd = [
        "pyinstaller",
        "--noconfirm",
        "--onedir",
        "--console",
        "--name", "backend",
        "--collect-all", "chromadb",
        "--collect-all", "uvicorn",
        "--collect-all", "fastapi",
        "--hidden-import", "chromadb.api.segment",
        "--hidden-import", "chromadb.telemetry.posthog",
        "--hidden-import", "chromadb.db.responses",
        "--hidden-import", "pydantic.deprecated.decorator",
        "--hidden-import", "sqlalchemy.ext.baked",
        "--hidden-import", "sqlite3",
        "main.py"
    ]
    
    # 将 assets 包含进去 (如果后端需要这些静态资源)
    if (backend_dir / "assets").exists():
        separator = ";" if sys.platform == "win32" else ":"
        cmd.extend(["--add-data", f"assets{separator}assets"])
    
    print(f"[*] Executing command: {' '.join(cmd)}")
    
    try:
        subprocess.run(cmd, check=True)
        print("[+] Backend Build Completed Successfully!")
        
        # 将产物移动到 dist/backend 统一结构
        # pyinstaller 默认输出到 backend/dist/backend
        # 我们需要确保 electron-builder 能找到它
        
    except subprocess.CalledProcessError as e:
        print(f"[-] Backend Build Failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    build_backend()
