#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_LOG="/tmp/second-brain-backend.log"

cd "$ROOT/frontend"
npm run build >/tmp/second-brain-build.log 2>&1

rm -rf "$ROOT/frontend_dist"
cp -r "$ROOT/frontend/dist" "$ROOT/frontend_dist"

pkill -f "uvicorn backend.main:app" || true
python3 - <<PY
import os, subprocess
root='$ROOT'
env=os.environ.copy()
env['PYTHONPATH']=root
with open('/tmp/second-brain-backend.log','wb') as f:
    subprocess.Popen([f'{root}/.venv/bin/python','-m','uvicorn','backend.main:app','--host','0.0.0.0','--port','8000'],cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
PY

echo "Stable local web started: http://127.0.0.1:8000"
