from __future__ import annotations

from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from backend.models.db_models import ModelConfig, Note, Notebook, NoteLink, NoteProperty, Task, UserStats, deobfuscate, obfuscate


DEFAULT_NOTEBOOK_NAME = "快速笔记"
INBOX_NOTEBOOK_NAME = "收集箱(Inbox)"


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


def next_note_position(db: Session, notebook_id: int | None, parent_id: int | None = None) -> int:
    statement = select(func.max(Note.position)).where(Note.notebook_id == notebook_id, Note.parent_id == parent_id, Note.deleted_at.is_(None))
    max_position = db.scalar(statement)
    return (max_position or 0) + 1


def list_notes(db: Session, property_filter: dict[str, str] | None = None) -> list[Note]:
    query = select(Note).where(Note.deleted_at.is_(None))
    
    if property_filter:
        for name, value in property_filter.items():
            query = query.join(NoteProperty).where(NoteProperty.name == name, NoteProperty.value == value)
            
    return list(db.scalars(query.order_by(Note.notebook_id.asc(), Note.position.asc(), Note.updated_at.desc())))


def list_trashed_notes(db: Session) -> list[Note]:
    return list(db.scalars(select(Note).where(Note.deleted_at.is_not(None)).order_by(Note.deleted_at.desc())))


def get_note(db: Session, note_id: int) -> Note | None:
    return db.get(Note, note_id)


def create_note(db: Session, title: str, content: str, summary: str, tags: list[str] | None, notebook_id: int | None, icon: str = "📝", parent_id: int | None = None, is_title_manually_edited: bool = False) -> Note:
    note = Note(
        title=title,
        icon=icon,
        content=content,
        summary=summary,
        tags=",".join(tags) if tags else "",
        notebook_id=notebook_id,
        parent_id=parent_id,
        is_title_manually_edited=1 if is_title_manually_edited else 0,
        position=next_note_position(db, notebook_id, parent_id),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, note_id: int, title: str | None = None, content: str | None = None, summary: str | None = None, tags: list[str] | None = None, icon: str | None = None, parent_id: int | None = None, is_title_manually_edited: bool | None = None) -> Note | None:
    note = db.get(Note, note_id)
    if not note:
        return None
    
    changed = False

    if title is not None and note.title != title:
        note.title = title
        changed = True
    if content is not None and note.content != content:
        note.content = content
        changed = True
    if summary is not None and note.summary != summary:
        note.summary = summary
        changed = True
    if tags is not None:
        new_tags = ",".join(tags)
        if note.tags != new_tags:
            note.tags = new_tags
            changed = True
    if icon is not None and note.icon != icon:
        note.icon = icon
        changed = True
    if parent_id is not None and note.parent_id != parent_id:
        note.parent_id = parent_id
        changed = True
    if is_title_manually_edited is not None:
        val = 1 if is_title_manually_edited else 0
        if note.is_title_manually_edited != val:
            note.is_title_manually_edited = val
            changed = True
    
    if changed:
        db.add(note)
        db.commit()
        db.refresh(note)
    
    return note


def move_note(db: Session, note_id: int, notebook_id: int | None, position: int, parent_id: int | None = None) -> Note | None:
    note = db.get(Note, note_id)
    if not note:
        return None
    target_notes = list(db.scalars(select(Note).where(Note.notebook_id == notebook_id, Note.parent_id == parent_id, Note.id != note_id, Note.deleted_at.is_(None)).order_by(Note.position.asc())))
    target_index = max(0, min(position, len(target_notes)))
    target_notes.insert(target_index, note)
    for index, item in enumerate(target_notes):
        item.notebook_id = notebook_id
        item.parent_id = parent_id
        item.position = index + 1
        db.add(item)
    db.commit()
    db.refresh(note)
    return note


def bulk_move_notes(db: Session, note_ids: list[int], notebook_id: int | None, position: int, parent_id: int | None = None) -> list[Note]:
    moved: list[Note] = []
    current_position = position
    for note_id in note_ids:
        note = move_note(db, note_id, notebook_id, current_position, parent_id)
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
    
    # Check if parent is deleted
    if note.parent_id:
        parent = db.get(Note, note.parent_id)
        if not parent or parent.deleted_at is not None:
            note.parent_id = None
            
    note.deleted_at = None
    note.notebook_id = note.notebook_id or get_or_create_default_notebook(db).id
    note.position = next_note_position(db, note.notebook_id, note.parent_id)
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


def purge_trash(db: Session) -> bool:
    try:
        # Purge trashed notes
        db.query(Note).filter(Note.deleted_at.is_not(None)).delete(synchronize_session=False)
        # Purge trashed notebooks (only if not default)
        db.query(Notebook).filter(Notebook.deleted_at.is_not(None), Notebook.name != DEFAULT_NOTEBOOK_NAME).delete(synchronize_session=False)
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False


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
    priority_rank = case(
        (Task.priority == "high", 0),
        (Task.priority == "medium", 1),
        else_=2,
    )
    return list(
        db.scalars(
            select(Task).order_by(
                Task.status.asc(),
                Task.deadline.is_(None),
                Task.deadline.asc(),
                priority_rank,
                Task.created_at.desc(),
            )
        )
    )


def create_task(
    db: Session,
    title: str,
    status: str = "todo",
    priority: str = "medium",
    task_type: str = "work",
    deadline: datetime | None = None,
) -> Task:
    task = Task(title=title, status=status, priority=priority, task_type=task_type, deadline=deadline)
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


def update_task(
    db: Session,
    task_id: int,
    title: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    task_type: str | None = None,
    deadline: datetime | None = None,
) -> Task | None:
    task = db.get(Task, task_id)
    if not task:
        return None
    if title is not None:
        task.title = title
    if status is not None:
        task.status = status
    if priority is not None:
        task.priority = priority
    if task_type is not None:
        task.task_type = task_type
    if deadline is not None or deadline is None:
        task.deadline = deadline
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task_id: int) -> bool:
    task = db.get(Task, task_id)
    if not task:
        return False
    db.delete(task)
    db.commit()
    return True


def clear_completed_tasks(db: Session) -> int:
    statement = select(Task).where(Task.status == "done")
    tasks = list(db.scalars(statement))
    count = len(tasks)
    for task in tasks:
        db.delete(task)
    db.commit()
    return count


def create_note_property(db: Session, note_id: int, name: str, type: str, value: str) -> NoteProperty:
    prop = NoteProperty(note_id=note_id, name=name, type=type, value=value)
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


def update_note_property(db: Session, property_id: int, name: str | None = None, type: str | None = None, value: str | None = None) -> NoteProperty | None:
    prop = db.get(NoteProperty, property_id)
    if not prop:
        return None
    if name is not None:
        prop.name = name
    if type is not None:
        prop.type = type
    if value is not None:
        prop.value = value
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


def delete_note_property(db: Session, property_id: int) -> bool:
    prop = db.get(NoteProperty, property_id)
    if not prop:
        return False
    db.delete(prop)
    db.commit()
    return True


def get_note_properties(db: Session, note_id: int) -> list[NoteProperty]:
    return list(db.scalars(select(NoteProperty).where(NoteProperty.note_id == note_id)))


def get_or_create_model_config(db: Session) -> ModelConfig:
    config = db.get(ModelConfig, 1)
    if not config:
        config = ModelConfig(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    # 返回前解密
    return ModelConfig(
        id=config.id,
        provider=config.provider,
        api_key=deobfuscate(config.api_key),
        base_url=config.base_url,
        model_name=config.model_name,
        updated_at=config.updated_at
    )


def update_model_config(db: Session, provider: str, api_key: str, base_url: str, model_name: str) -> ModelConfig:
    config = db.get(ModelConfig, 1) or ModelConfig(id=1)
    config.provider = provider
    config.api_key = obfuscate(api_key)
    config.base_url = base_url
    config.model_name = model_name
    db.add(config)
    db.commit()
    db.refresh(config)
    return get_or_create_model_config(db)


def get_or_create_inbox_notebook(db: Session) -> Notebook:
    notebook = db.scalar(select(Notebook).where(Notebook.name == INBOX_NOTEBOOK_NAME))
    if notebook:
        if notebook.deleted_at is not None:
            notebook.deleted_at = None
            db.add(notebook)
            db.commit()
            db.refresh(notebook)
        return notebook
    notebook = Notebook(name=INBOX_NOTEBOOK_NAME, icon="📥")
    db.add(notebook)
    db.commit()
    db.refresh(notebook)
    return notebook


def get_or_create_user_stats(db: Session) -> UserStats:
    stats = db.get(UserStats, 1)
    if not stats:
        stats = UserStats(id=1, exp=0, level=1, total_captures=0)
        db.add(stats)
        db.commit()
        db.refresh(stats)
    return stats


def add_exp(db: Session, amount: int) -> UserStats:
    stats = get_or_create_user_stats(db)
    stats.exp += amount
    stats.total_captures += 1
    
    # Simple level up logic: level = floor(sqrt(exp / 100)) + 1
    import math
    new_level = math.floor(math.sqrt(stats.exp / 100)) + 1
    if new_level > stats.level:
        stats.level = new_level
        
    db.add(stats)
    db.commit()
    db.refresh(stats)
    return stats
