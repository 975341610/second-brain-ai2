from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from backend.models.db_models import AppSetting, ModelConfig, Note, Notebook, NoteLink, NoteTemplate, Task, UpdateState


DEFAULT_NOTEBOOK_NAME = "快速笔记"
WORKSPACE_SETTINGS_KEY = "workspace"
_UNSET = object()


def _json_loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


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


def list_note_templates(db: Session) -> list[NoteTemplate]:
    return list(db.scalars(select(NoteTemplate).order_by(NoteTemplate.updated_at.desc(), NoteTemplate.id.desc())))


def get_note_template(db: Session, template_id: int) -> NoteTemplate | None:
    return db.get(NoteTemplate, template_id)


def create_note_template(
    db: Session,
    name: str,
    description: str = "",
    icon: str = "📝",
    note_type: str = "note",
    default_title: str = "未命名笔记",
    default_content: str = "",
    metadata: dict[str, Any] | None = None,
) -> NoteTemplate:
    template = NoteTemplate(
        name=name.strip(),
        description=description,
        icon=icon,
        note_type=note_type,
        default_title=default_title,
        default_content=default_content,
        metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def update_note_template(
    db: Session,
    template_id: int,
    *,
    name: str | None = None,
    description: str | None = None,
    icon: str | None = None,
    note_type: str | None = None,
    default_title: str | None = None,
    default_content: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> NoteTemplate | None:
    template = db.get(NoteTemplate, template_id)
    if not template:
        return None
    if name is not None:
        template.name = name.strip()
    if description is not None:
        template.description = description
    if icon is not None:
        template.icon = icon
    if note_type is not None:
        template.note_type = note_type
    if default_title is not None:
        template.default_title = default_title
    if default_content is not None:
        template.default_content = default_content
    if metadata is not None:
        template.metadata_json = json.dumps(metadata, ensure_ascii=False)
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def delete_note_template(db: Session, template_id: int) -> bool:
    template = db.get(NoteTemplate, template_id)
    if not template:
        return False
    db.delete(template)
    db.commit()
    return True


def template_to_dict(template: NoteTemplate) -> dict[str, Any]:
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "icon": template.icon,
        "note_type": template.note_type,
        "default_title": template.default_title,
        "default_content": template.default_content,
        "metadata": _json_loads(template.metadata_json, {}),
        "created_at": template.created_at,
        "updated_at": template.updated_at,
    }


def get_workspace_settings(db: Session) -> dict[str, Any]:
    setting = db.get(AppSetting, WORKSPACE_SETTINGS_KEY)
    if not setting:
        return {}
    return _json_loads(setting.value, {})


def update_workspace_settings(db: Session, data: dict[str, Any]) -> dict[str, Any]:
    setting = db.get(AppSetting, WORKSPACE_SETTINGS_KEY)
    if not setting:
        setting = AppSetting(key=WORKSPACE_SETTINGS_KEY)
    setting.value = json.dumps(data, ensure_ascii=False)
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return _json_loads(setting.value, {})


def get_or_create_update_state(db: Session) -> UpdateState:
    state = db.get(UpdateState, 1)
    if not state:
        state = UpdateState(id=1)
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


def update_update_state(
    db: Session,
    *,
    channel: str | object = _UNSET,
    current_version: str | object = _UNSET,
    staged_version: str | None | object = _UNSET,
    package_path: str | None | object = _UNSET,
    package_kind: str | None | object = _UNSET,
    manifest: dict[str, Any] | None | object = _UNSET,
    status: str | object = _UNSET,
    last_error: str | object = _UNSET,
) -> UpdateState:
    state = get_or_create_update_state(db)
    if channel is not _UNSET:
        state.channel = str(channel)
    if current_version is not _UNSET:
        state.current_version = str(current_version)
    if staged_version is not _UNSET:
        state.staged_version = staged_version
    if package_path is not _UNSET:
        state.package_path = package_path
    if package_kind is not _UNSET:
        state.package_kind = package_kind
    if manifest is not _UNSET:
        state.manifest_json = json.dumps(manifest or {}, ensure_ascii=False)
    if status is not _UNSET:
        state.status = str(status)
    if last_error is not _UNSET:
        state.last_error = str(last_error)
    db.add(state)
    db.commit()
    db.refresh(state)
    return state


def update_state_to_dict(state: UpdateState) -> dict[str, Any]:
    return {
        "channel": state.channel,
        "current_version": state.current_version,
        "staged_version": state.staged_version,
        "package_path": state.package_path,
        "package_kind": state.package_kind,
        "manifest": _json_loads(state.manifest_json, {}),
        "status": state.status,
        "last_error": state.last_error,
        "updated_at": state.updated_at,
    }
