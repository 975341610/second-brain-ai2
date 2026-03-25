# Second Brain AI

Production-style MVP for a local-first AI second brain with notes, RAG search, card links, TODO planning, and multi-model configuration.

## Stack

- Frontend: React + TypeScript + TailwindCSS + Zustand
- Backend: FastAPI + SQLAlchemy
- Storage: SQLite + local Chroma vector store
- AI: OpenClaw-compatible API by default, with OpenAI/Claude-compatible base URL support and offline fallback

## Features

- Import `.txt`, `.md`, `.pdf` documents
- Auto chunking, embeddings, summaries, tags, and related-card links
- RAG-based answers with source citations
- AI agent planning with `search_knowledge`, `create_task`, and `list_tasks`
- TODO board with manual edits and status transitions
- Local-first persistence and offline-safe responses when no API key is configured
- Model configuration UI for provider, base URL, API key, and model name

## Versions

- `v0.5.3`: (Current) fix: AI SSL certificate verification, robust import validation, and elegant table row drag UX.
- `v0.5.2`: Diagnostic fixes for update persistence, taskkill integration, and robocopy verification.
- `v0.5.1`: Robust AI stream parsing, Table TDD fixes, and improved fast update logic.
- `v0.5.0`: Initial system fix release.

## Project Structure

```text
second-brain-ai/
├── backend/
│   ├── api/
│   ├── agent/
│   ├── models/
│   ├── rag/
│   ├── services/
│   ├── data/sample_docs/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/components/
│   ├── src/lib/
│   ├── src/pages/
│   └── src/store/
└── README.md
```

## Quick Start

### 1. Backend

```bash
cd /home/cai/second-brain-ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
uvicorn backend.main:app --reload
```

Backend runs at `http://127.0.0.1:8000`.

### 2. Frontend

```bash
cd /home/cai/second-brain-ai/frontend
npm install
cp .env.example .env
npm run dev
```

Frontend runs at `http://127.0.0.1:5173`.

### 3. Stable Local Web

If you want a more stable local preview without relying on the Vite dev server, use the backend-served build:

```bash
cd /home/cai/second-brain-ai
./run_local_web.sh
```

Then open:

```text
http://127.0.0.1:8000
```

This mode builds the frontend once, serves it from FastAPI, and is more stable for long manual testing sessions.

## Default Model Behavior

- Default provider: `openclaw`
- Default model: `glm-4.7-flash`
- If no API key is configured, the app falls back to deterministic local embeddings, local summaries, local tag extraction, and citation-grounded template answers

## API Endpoints

- `POST /api/upload`
- `POST /api/ask`
- `POST /api/search`
- `GET /api/notes`
- `POST /api/notes`
- `PUT /api/notes/{id}`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/{id}`
- `POST /api/agent`
- `GET /api/model-config`
- `POST /api/model-config`

## Example Data

Sample documents are created automatically in `backend/data/sample_docs/` on first backend startup.

- `product_strategy.md`
- `weekly_review.txt`

Sample tasks are also seeded into SQLite on first startup.

## Notes on Architecture

- SQLite stores notes, links, tasks, and model configuration
- Chroma stores chunk vectors for semantic retrieval
- Note cards are generated from imported or created content
- Card links are built from cosine similarity between note-level embeddings
- RAG results are reranked with a simple lexical overlap boost before answer generation
- Agent mode searches knowledge first, generates a plan, and creates TODO items automatically

## Offline Fallback

Without a remote model API:

- embeddings use deterministic local hashing vectors
- summaries use first-sentence extraction
- tags use keyword frequency
- answers use retrieved note excerpts and citations
- planning uses heuristic task generation

## Suggested Next Steps

1. Add authentication and workspace separation
2. Add streaming chat responses
3. Add background ingestion jobs for large PDF batches
4. Add richer graph visualization for note links

## Windows EXE Packaging

This repo now includes a one-click Windows packaging path that builds the frontend, bundles the FastAPI app, and outputs both a portable desktop executable and an installer `Setup.exe`.

Files:

- `one_click_install.bat`
- `setup_build_env.bat`
- `build_windows.bat`
- `second_brain_ai.spec`
- `installer.iss`
- `backend/desktop.py`
- `windows/Start SecondBrainAI.bat`
- `windows/README-Windows.txt`
- `.github/workflows/windows-package.yml`

What the EXE does:

- starts the local backend on `http://127.0.0.1:8765`
- serves the built frontend from the same process
- opens the browser automatically
- stores SQLite and Chroma data beside the EXE in `data/`
- can be distributed either as a portable folder or installed by `Setup.exe`

Build on Windows:

```bat
cd C:\path\to\second-brain-ai
one_click_install.bat
```

Or step by step:

```bat
cd C:\path\to\second-brain-ai
setup_build_env.bat
build_windows.bat
```

Double-click build:

- open the project folder in Windows Explorer
- double-click `one_click_install.bat`
- wait for the script to finish
- run installer: `C:\AI\Setup.exe`
- or run portable app: `C:\AI\SecondBrainAI\Start SecondBrainAI.bat`

Output path:

```text
C:\AI\SecondBrainAI\SecondBrainAI.exe
C:\AI\Setup.exe
```

Notes:

- the EXE must be built on Windows to produce a real Windows `.exe`
- `Setup.exe` requires Inno Setup 6 on the Windows build machine
- the installer uses a per-user install path, so admin rights are not required
- this Linux environment can prepare the packaging files, but cannot emit a native Windows executable directly into `C:\AI`

## GitHub Actions Auto Build

This repo now includes a Windows CI pipeline at `.github/workflows/windows-package.yml`.

- every push builds `Setup.exe`
- every push uploads downloadable workflow artifacts
- every `v*` tag also publishes `Setup.exe` and the portable zip to a GitHub Release

How to use:

1. push the repo to GitHub
2. open the `Actions` tab and enable workflows if needed
3. push any commit to trigger a Windows build
4. download artifacts from the workflow run
5. create a tag like `v1.0.0` to get release assets automatically
