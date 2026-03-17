from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models.db_models import ModelConfig, Note, Notebook, NoteLink, Task


DEFAULT_NOTEBOOK_NAME = "快速笔记"


def list_notebooks(db: Session) -> list[Notebook]:
    return list(db.scalars(select(Notebook).where(Notebook.deleted_at.is_(None)).order_by(Notebook.created_at.asc())))


def list_trashed_notebooks(db: Session) -> list[Notebook]:
    return list(db.scalars(select(Notebook).where(Notebook.deleted_at.is_not(None)).order_by(Notebook.deleted_at.desc())))


def get_or_create_default_notebook(db: Session) -> Notebook:
    notebook = db.scalar(select(Notebook).where(Notebook.name == DEFAULT_NOTEBOOK_NAME))
    if notebook:
        if notebook.deleted_at is not None:
            notebook.deleted_at = None
            db.add(notebook)
            db.commit()
            db.refresh(notebook)
        return notebook
    notebook = Notebook(name=DEFAULT_NOTEBOOK_NAME, icon="⚡")
    db.add(notebook)
    db.commit()
    db.refresh(notebook)
    return notebook


def create_notebook(db: Session, name: str, icon: str = "📒") -> Notebook:
    notebook = Notebook(name=name.strip(), icon=icon)
    db.add(notebook)
    db.commit()
    db.refresh(notebook)
    return notebook


def update_notebook(db: Session, notebook_id: int, name: str | None = None, icon: str | None = None) -> Notebook | None:
    notebook = db.get(Notebook, notebook_id)
    if not notebook:
        return None
    if name is not None:
        notebook.name = name.strip()
    if icon is not None:
        notebook.icon = icon
    db.add(notebook)
    db.commit()
    db.refresh(notebook)
    return notebook


def next_note_position(db: Session, notebook_id: int | None) -> int:
    statement = select(func.max(Note.position)).where(Note.notebook_id == notebook_id, Note.deleted_at.is_(None))
    max_position = db.scalar(statement)
    return (max_position or 0) + 1


def list_notes(db: Session) -> list[Note]:
    return list(db.scalars(select(Note).where(Note.deleted_at.is_(None)).order_by(Note.notebook_id.asc(), Note.position.asc(), Note.updated_at.desc())))


def list_trashed_notes(db: Session) -> list[Note]:
    return list(db.scalars(select(Note).where(Note.deleted_at.is_not(None)).order_by(Note.deleted_at.desc())))


def get_note(db: Session, note_id: int) -> Note | None:
    return db.get(Note, note_id)


def create_note(db: Session, title: str, content: str, summary: str, tags: list[str], notebook_id: int | None, icon: str = "📝") -> Note:
    note = Note(
        title=title,
        icon=icon,
        content=content,
        summary=summary,
        tags=",".join(tags),
        notebook_id=notebook_id,
        position=next_note_position(db, notebook_id),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, note_id: int, title: str, content: str, summary: str, tags: list[str], icon: str | None = None) -> Note | None:
    note = db.get(Note, note_id)
    if not note:
        return None
    note.title = title
    note.content = content
    note.summary = summary
    note.tags = ",".join(tags)
    if icon is not None:
        note.icon = icon
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def move_note(db: Session, note_id: int, notebook_id: int | None, position: int) -> Note | None:
    note = db.get(Note, note_id)
    if not note:
        return None
    target_notes = list(db.scalars(select(Note).where(Note.notebook_id == notebook_id, Note.id != note_id, Note.deleted_at.is_(None)).order_by(Note.position.asc())))
    target_index = max(0, min(position, len(target_notes)))
    target_notes.insert(target_index, note)
    for index, item in enumerate(target_notes):
        item.notebook_id = notebook_id
        item.position = index + 1
        db.add(item)
    db.commit()
    db.refresh(note)
    return note


def bulk_move_notes(db: Session, note_ids: list[int], notebook_id: int | None, position: int) -> list[Note]:
    moved: list[Note] = []
    current_position = position
    for note_id in note_ids:
        note = move_note(db, note_id, notebook_id, current_position)
        if note:
            moved.append(note)
            current_position += 1
    return moved


def soft_delete_note(db: Session, note_id: int) -> Note | None:
    note = db.get(Note, note_id)
    if not note:
        return None
    note.deleted_at = datetime.utcnow()
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def bulk_soft_delete_notes(db: Session, note_ids: list[int]) -> list[Note]:
    deleted: list[Note] = []
    for note_id in note_ids:
        note = soft_delete_note(db, note_id)
        if note:
            deleted.append(note)
    return deleted


def restore_note(db: Session, note_id: int) -> Note | None:
    note = db.get(Note, note_id)
    if not note:
        return None
    note.deleted_at = None
    note.notebook_id = note.notebook_id or get_or_create_default_notebook(db).id
    note.position = next_note_position(db, note.notebook_id)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def purge_note(db: Session, note_id: int) -> bool:
    note = db.get(Note, note_id)
    if not note:
        return False
    db.delete(note)
    db.commit()
    return True


def soft_delete_notebook(db: Session, notebook_id: int) -> Notebook | None:
    notebook = db.get(Notebook, notebook_id)
    if not notebook or notebook.name == DEFAULT_NOTEBOOK_NAME:
        return None
    notebook.deleted_at = datetime.utcnow()
    notes = list(db.scalars(select(Note).where(Note.notebook_id == notebook_id, Note.deleted_at.is_(None))))
    for note in notes:
        note.deleted_at = datetime.utcnow()
        db.add(note)
    db.add(notebook)
    db.commit()
    db.refresh(notebook)
    return notebook


def restore_notebook(db: Session, notebook_id: int) -> Notebook | None:
    notebook = db.get(Notebook, notebook_id)
    if not notebook:
        return None
    notebook.deleted_at = None
    db.add(notebook)
    notes = list(db.scalars(select(Note).where(Note.notebook_id == notebook_id)))
    for note in notes:
        note.deleted_at = None
        if note.position <= 0:
            note.position = next_note_position(db, notebook_id)
        db.add(note)
    db.commit()
    db.refresh(notebook)
    return notebook


def purge_notebook(db: Session, notebook_id: int) -> bool:
    notebook = db.get(Notebook, notebook_id)
    if not notebook or notebook.name == DEFAULT_NOTEBOOK_NAME:
        return False
    for note in list(db.scalars(select(Note).where(Note.notebook_id == notebook_id))):
        db.delete(note)
    db.delete(notebook)
    db.commit()
    return True


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


def find_task_by_title(db: Session, title: str) -> Task | None:
    normalized = title.strip().lower()
    if not normalized:
        return None
    statement = select(Task).where(func.lower(Task.title) == normalized).order_by(Task.created_at.desc())
    return db.scalar(statement)


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
