from pathlib import Path

from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models.db_models import Note, Task
from backend.services.repositories import create_task


def seed_files() -> None:
    settings = get_settings()
    sample_dir = Path(settings.sample_docs_path)
    sample_dir.mkdir(parents=True, exist_ok=True)

    samples = {
        "product_strategy.md": """# AI Second Brain Product Strategy

The core promise of the product is to turn messy personal knowledge into a reliable operating system.
Users need fast capture, clean retrieval, and AI-generated synthesis that remains grounded in their own notes.

Important principles:
- local-first storage for privacy and offline work
- RAG answers with source citations
- task planning connected to knowledge cards
- flexible model configuration for OpenClaw, OpenAI, and Claude compatible APIs
""",
        "weekly_review.txt": """Weekly review workflow:
1. Scan open tasks and identify blockers.
2. Ask the AI assistant to summarize the latest notes.
3. Connect new research cards to active projects.
4. Archive low-value ideas but keep searchable embeddings.
""",
    }

    for file_name, content in samples.items():
        path = sample_dir / file_name
        if not path.exists():
            path.write_text(content, encoding="utf-8")


def seed_database(db: Session) -> None:
    if not db.query(Note).first():
        pass
    if not db.query(Task).first():
        create_task(db, "Review imported sample notes", "todo")
        create_task(db, "Ask the AI assistant for a weekly plan", "doing")
