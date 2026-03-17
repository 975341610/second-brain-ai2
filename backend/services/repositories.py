from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.db_models import ModelConfig, Note, NoteLink, Task


def list_notes(db: Session) -> list[Note]:
    return list(db.scalars(select(Note).order_by(Note.updated_at.desc())))


def get_note(db: Session, note_id: int) -> Note | None:
    return db.get(Note, note_id)


def create_note(db: Session, title: str, content: str, summary: str, tags: list[str]) -> Note:
    note = Note(title=title, content=content, summary=summary, tags=",".join(tags))
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, note_id: int, title: str, content: str, summary: str, tags: list[str]) -> Note | None:
    note = db.get(Note, note_id)
    if not note:
        return None
    note.title = title
    note.content = content
    note.summary = summary
    note.tags = ",".join(tags)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def replace_note_links(db: Session, source_note_id: int, targets: list[tuple[int, float]]) -> None:
    links = list(db.scalars(select(NoteLink).where(NoteLink.source_note_id == source_note_id)))
    for link in links:
        db.delete(link)
    for target_id, score in targets:
        if target_id == source_note_id:
            continue
        db.add(NoteLink(source_note_id=source_note_id, target_note_id=target_id, score=round(score, 4)))
    db.commit()


def list_tasks(db: Session) -> list[Task]:
    return list(db.scalars(select(Task).order_by(Task.created_at.desc())))


def create_task(db: Session, title: str, status: str = "todo") -> Task:
    task = Task(title=title, status=status)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, task_id: int, title: str | None = None, status: str | None = None) -> Task | None:
    task = db.get(Task, task_id)
    if not task:
        return None
    if title is not None:
        task.title = title
    if status is not None:
        task.status = status
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def get_or_create_model_config(db: Session) -> ModelConfig:
    config = db.get(ModelConfig, 1)
    if not config:
        config = ModelConfig(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def update_model_config(db: Session, provider: str, api_key: str, base_url: str, model_name: str) -> ModelConfig:
    config = get_or_create_model_config(db)
    config.provider = provider
    config.api_key = api_key
    config.base_url = base_url
    config.model_name = model_name
    db.add(config)
    db.commit()
    db.refresh(config)
    return config
