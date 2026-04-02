import os
import sys
import subprocess
import shutil
from pathlib import Path


def build_backend():
    project_root = Path(__file__).parent.parent
    backend_dir = project_root / "backend"
    dist_dir = backend_dir / "dist"
    output_dir = dist_dir / "backend"
    build_dir = backend_dir / "build"
    spec_file = build_dir / "backend.spec"

    os.chdir(backend_dir)
    print(f"[*] Starting Backend Build at {backend_dir}...")

    if output_dir.exists():
        shutil.rmtree(output_dir)

    if spec_file.exists():
        spec_file.unlink()

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--console",
        "--name", "backend",
        "--distpath", str(dist_dir),
        "--workpath", str(build_dir / "pyinstaller-backend"),
        "--specpath", str(build_dir),
        "--collect-all", "chromadb",
        "--collect-all", "uvicorn",
        "--collect-all", "fastapi",
        "--hidden-import", "pydantic.deprecated.decorator",
        "--hidden-import", "sqlalchemy.ext.baked",
        "--hidden-import", "sqlite3",
        "desktop.py"
    ]

    assets_dir = backend_dir / "assets"
    if assets_dir.exists():
        separator = ";" if sys.platform == "win32" else ":"
        cmd.extend(["--add-data", f"{assets_dir}{separator}assets"])

    print(f"[*] Executing command: {' '.join(cmd)}")

    try:
        subprocess.run(cmd, check=True)
        exe_name = "backend.exe" if sys.platform == "win32" else "backend"
        exe_path = output_dir / exe_name
        if not exe_path.exists():
            raise FileNotFoundError(f"Expected backend sidecar not found at {exe_path}")
        print(f"[+] Backend Build Completed Successfully: {exe_path}")
    except subprocess.CalledProcessError as e:
        print(f"[-] Backend Build Failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    build_backend()
