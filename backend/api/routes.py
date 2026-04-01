from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.agent.planner import run_agent
from backend.config import get_settings, runtime_root
from backend.models.schemas import (
    AgentRequest,
    AppInfoResponse,
    ApplyUpdateResponse,
    AskRequest,
    AskResponse,
    BulkNoteAction,
    Citation,
    CreateNoteFromTemplatePayload,
    JournalNoteCreatePayload,
    ModelConfigPayload,
    NotebookCreate,
    NotebookResponse,
    NotebookUpdate,
    NoteCreate,
    NoteMovePayload,
    NoteResponse,
    NoteTemplateCreate,
    NoteTemplateResponse,
    NoteTemplateUpdate,
    NoteUpdate,
    PluginManifestResponse,
    PrivateVaultPassphrasePayload,
    PrivateVaultStatusResponse,
    SearchRequest,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    TimelineItem,
    TrashResponse,
    UpdateAvailabilityResponse,
    UpdateStatePayload,
    UpdateStateResponse,
    UploadResponse,
    WorkspaceSettingsPayload,
    WorkspaceSettingsResponse,
)
from backend.database import get_db
from backend.rag.pipeline import citations_from_results, search_knowledge
from backend.services.ai_client import AIClient
from backend.services.document_service import parse_document
from backend.services.local_workspace import workspace_store
from backend.services.offline_update import offline_update_service
from backend.services.plugins import list_plugins
from backend.services.repositories import (
    create_note_template,
    create_task,
    delete_note_template,
    get_note_template,
    get_or_create_model_config,
    get_or_create_update_state,
    get_workspace_settings,
    list_note_templates,
    list_tasks,
    template_to_dict,
    update_model_config,
    update_note_template,
    update_state_to_dict,
    update_task,
    update_update_state,
    update_workspace_settings,
)
from backend.version import app_info_payload


router = APIRouter()
settings = get_settings()
ai_client = AIClient()


def note_to_response(note: dict[str, Any]) -> NoteResponse:
    return NoteResponse(**note)


def notebook_to_response(notebook: dict[str, Any]) -> NotebookResponse:
    return NotebookResponse(**notebook)


def template_to_response(template: dict[str, Any]) -> NoteTemplateResponse:
    return NoteTemplateResponse(**template)


def update_state_response(db: Session) -> UpdateStateResponse:
    state = get_or_create_update_state(db)
    if state.current_version != offline_update_service.runtime_version():
        state = update_update_state(db, current_version=offline_update_service.runtime_version())
    synced = offline_update_service.sync_runtime_result(update_state_to_dict(state))
    state = update_update_state(
        db,
        current_version=synced.get("current_version"),
        staged_version=synced.get("staged_version"),
        package_path=synced.get("package_path"),
        package_kind=synced.get("package_kind"),
        manifest=synced.get("manifest"),
        status=synced.get("status"),
        last_error=synced.get("last_error"),
    )
    return UpdateStateResponse(**update_state_to_dict(state))


def app_info_response() -> AppInfoResponse:
    return AppInfoResponse(
        **app_info_payload(
            api_prefix=settings.api_prefix,
            runtime_root=str(runtime_root()),
            workspace_path=settings.workspace_path,
            update_staging_path=settings.update_staging_path,
            plugin_packages_path=settings.plugin_packages_path,
            theme_assets_path=settings.theme_assets_path,
        )
    )


def _private_note_ids() -> set[int]:
    return {note["id"] for note in workspace_store.list_notes(include_deleted=True) if note.get("is_private")}


def _visible_notes_for_navigation() -> list[dict[str, Any]]:
    return [note for note in workspace_store.list_notes() if not note.get("is_private")]


def _timeline_timestamp(note: dict[str, Any]) -> datetime:
    if note.get("start_at"):
        return datetime.fromisoformat(note["start_at"])
    if note.get("journal_date"):
        return datetime.fromisoformat(f"{note['journal_date']}T00:00:00+00:00")
    return datetime.fromisoformat(note["created_at"])


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(files: list[UploadFile] = File(...), db: Session = Depends(get_db)) -> UploadResponse:
    imported: list[NoteResponse] = []
    default_notebook = next((item for item in workspace_store.list_notebooks() if item["name"] == "快速笔记"), None)
    for file in files:
        content = await file.read()
        title, parsed = parse_document(file.filename, content)
        note = workspace_store.create_note(title=title, content=parsed, notebook_id=default_notebook["id"] if default_notebook else None)
        imported.append(note_to_response(note))
    return UploadResponse(imported_notes=imported)


@router.post("/ask", response_model=AskResponse)
async def ask_question(payload: AskRequest, db: Session = Depends(get_db)) -> AskResponse:
    model_config = get_or_create_model_config(db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    if payload.mode == "agent":
        agent_response = await run_agent(db, payload.question, ai_client)
        return AskResponse(answer=agent_response.answer, citations=agent_response.evidence, mode="agent")
    if payload.mode == "chat":
        answer = await ai_client.answer(payload.question, [], llm_config)
        return AskResponse(answer=answer, citations=[], mode="chat")

    private_ids = _private_note_ids()
    results = await search_knowledge(payload.question, ai_client=ai_client, excluded_note_ids=private_ids)
    citations = citations_from_results(db, results)
    answer = await ai_client.answer(payload.question, citations, llm_config)
    return AskResponse(answer=answer, citations=[Citation(**item) for item in citations], mode="rag")


@router.post("/search")
async def search_api(payload: SearchRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    private_ids = _private_note_ids()
    results = await search_knowledge(payload.query, ai_client=ai_client, top_k=payload.top_k, excluded_note_ids=private_ids)
    return {"results": citations_from_results(db, results)}


@router.get("/app-info", response_model=AppInfoResponse)
def get_app_info_api() -> AppInfoResponse:
    return app_info_response()


@router.get("/notes", response_model=list[NoteResponse])
def get_notes(db: Session = Depends(get_db)) -> list[NoteResponse]:
    return [note_to_response(note) for note in workspace_store.list_notes()]


@router.get("/trash", response_model=TrashResponse)
def get_trash(db: Session = Depends(get_db)) -> TrashResponse:
    trash = workspace_store.get_trash()
    return TrashResponse(
        notes=[note_to_response(note) for note in trash["notes"]],
        notebooks=[notebook_to_response(notebook) for notebook in trash["notebooks"]],
    )


@router.get("/notebooks", response_model=list[NotebookResponse])
def get_notebooks(db: Session = Depends(get_db)) -> list[NotebookResponse]:
    return [notebook_to_response(notebook) for notebook in workspace_store.list_notebooks()]


@router.post("/notebooks", response_model=NotebookResponse)
def create_notebook_api(payload: NotebookCreate, db: Session = Depends(get_db)) -> NotebookResponse:
    try:
        return notebook_to_response(workspace_store.create_notebook(payload.name, payload.icon))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/notebooks/{notebook_id}", response_model=NotebookResponse)
def update_notebook_api(notebook_id: int, payload: NotebookUpdate, db: Session = Depends(get_db)) -> NotebookResponse:
    try:
        notebook = workspace_store.update_notebook(notebook_id, payload.name, payload.icon)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook_to_response(notebook)


@router.delete("/notebooks/{notebook_id}")
def delete_notebook_api(notebook_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    notebook = workspace_store.soft_delete_notebook(notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found or cannot delete default notebook")
    return {"status": "ok"}


@router.post("/notebooks/{notebook_id}/restore", response_model=NotebookResponse)
def restore_notebook_api(notebook_id: int, db: Session = Depends(get_db)) -> NotebookResponse:
    notebook = workspace_store.restore_notebook(notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook_to_response(notebook)


@router.delete("/notebooks/{notebook_id}/purge")
def purge_notebook_api(notebook_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    if not workspace_store.purge_notebook(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found or cannot purge default notebook")
    return {"status": "ok"}


@router.post("/notes", response_model=NoteResponse)
def create_note_api(payload: NoteCreate, db: Session = Depends(get_db)) -> NoteResponse:
    try:
        note = workspace_store.create_note(
            title=payload.title,
            content=payload.content,
            notebook_id=payload.notebook_id,
            icon=payload.icon,
            parent_id=payload.parent_id,
            note_type=payload.note_type,
            template_id=payload.template_id,
            is_private=payload.is_private,
            journal_date=payload.journal_date,
            period_type=payload.period_type,
            start_at=payload.start_at,
            end_at=payload.end_at,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return note_to_response(note)


@router.put("/notes/{note_id}", response_model=NoteResponse)
def update_note_api(note_id: int, payload: NoteUpdate, db: Session = Depends(get_db)) -> NoteResponse:
    try:
        note = workspace_store.update_note(
            note_id,
            payload.title,
            payload.content,
            payload.icon,
            payload.note_type,
            payload.template_id,
            payload.is_private,
            payload.journal_date,
            payload.period_type,
            payload.start_at,
            payload.end_at,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)


@router.patch("/notes/{note_id}/move", response_model=NoteResponse)
def move_note_api(note_id: int, payload: NoteMovePayload, db: Session = Depends(get_db)) -> NoteResponse:
    try:
        note = workspace_store.move_note(note_id, payload.notebook_id, payload.position, payload.parent_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)


@router.post("/notes/bulk-move")
def bulk_move_notes_api(payload: BulkNoteAction, db: Session = Depends(get_db)) -> dict[str, Any]:
    moved = []
    for index, note_id in enumerate(payload.note_ids):
        note = workspace_store.move_note(note_id, payload.notebook_id, payload.position + index, payload.parent_id)
        if note:
            moved.append(note)
    return {"notes": moved}


@router.post("/notes/bulk-delete")
def bulk_delete_notes_api(payload: BulkNoteAction, db: Session = Depends(get_db)) -> dict[str, Any]:
    notes = workspace_store.bulk_soft_delete_notes(payload.note_ids)
    return {"notes": notes}


@router.delete("/notes/{note_id}")
def delete_note_api(note_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    note = workspace_store.soft_delete_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"status": "ok"}


@router.post("/notes/{note_id}/restore", response_model=NoteResponse)
def restore_note_api(note_id: int, db: Session = Depends(get_db)) -> NoteResponse:
    note = workspace_store.restore_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)


@router.delete("/notes/{note_id}/purge")
def purge_note_api(note_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    if not workspace_store.purge_note(note_id):
        raise HTTPException(status_code=404, detail="Note not found")
    return {"status": "ok"}


@router.post("/notes/journals", response_model=NoteResponse)
def create_journal_note_api(payload: JournalNoteCreatePayload, db: Session = Depends(get_db)) -> NoteResponse:
    try:
        note, _created = workspace_store.create_or_get_journal_note(
            period_type=payload.period_type,
            notebook_id=payload.notebook_id,
            parent_id=payload.parent_id,
            is_private=payload.is_private,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return note_to_response(note)


@router.get("/timeline", response_model=list[TimelineItem])
def timeline_api(db: Session = Depends(get_db)) -> list[TimelineItem]:
    items: list[TimelineItem] = []
    for task in list_tasks(db):
        timestamp = task.deadline or task.created_at.replace(tzinfo=timezone.utc)
        items.append(
            TimelineItem(
                id=f"task-{task.id}",
                item_type="task",
                title=task.title,
                icon="✅",
                timestamp=timestamp,
                task_id=task.id,
                status=task.status,
            )
        )
    for note in _visible_notes_for_navigation():
        if not (note.get("journal_date") or note.get("start_at") or note.get("end_at")):
            continue
        items.append(
            TimelineItem(
                id=f"note-{note['id']}",
                item_type="note",
                title=note["title"],
                icon=note.get("icon") or "📝",
                timestamp=_timeline_timestamp(note),
                end_at=datetime.fromisoformat(note["end_at"]) if note.get("end_at") else None,
                note_id=note["id"],
                note_type=note.get("note_type"),
                is_private=bool(note.get("is_private")),
            )
        )
    items.sort(key=lambda item: item.timestamp, reverse=True)
    return items


@router.get("/templates", response_model=list[NoteTemplateResponse])
def get_templates_api(db: Session = Depends(get_db)) -> list[NoteTemplateResponse]:
    return [template_to_response(template_to_dict(item)) for item in list_note_templates(db)]


@router.post("/templates", response_model=NoteTemplateResponse)
def create_template_api(payload: NoteTemplateCreate, db: Session = Depends(get_db)) -> NoteTemplateResponse:
    template = create_note_template(
        db,
        name=payload.name,
        description=payload.description,
        icon=payload.icon,
        note_type=payload.note_type,
        default_title=payload.default_title,
        default_content=payload.default_content,
        metadata=payload.metadata,
    )
    return template_to_response(template_to_dict(template))


@router.patch("/templates/{template_id}", response_model=NoteTemplateResponse)
def update_template_api(template_id: int, payload: NoteTemplateUpdate, db: Session = Depends(get_db)) -> NoteTemplateResponse:
    template = update_note_template(
        db,
        template_id,
        name=payload.name,
        description=payload.description,
        icon=payload.icon,
        note_type=payload.note_type,
        default_title=payload.default_title,
        default_content=payload.default_content,
        metadata=payload.metadata,
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template_to_response(template_to_dict(template))


@router.delete("/templates/{template_id}")
def delete_template_api(template_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    if not delete_note_template(db, template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "ok"}


@router.post("/templates/{template_id}/create-note", response_model=NoteResponse)
def create_note_from_template_api(template_id: int, payload: CreateNoteFromTemplatePayload, db: Session = Depends(get_db)) -> NoteResponse:
    template = get_note_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    metadata = template_to_dict(template).get("metadata", {})
    try:
        note = workspace_store.create_note(
            title=(payload.title or template.default_title).strip() or template.default_title,
            content=template.default_content,
            notebook_id=payload.notebook_id,
            parent_id=payload.parent_id,
            icon=template.icon,
            note_type=template.note_type,
            template_id=template.id,
            is_private=payload.is_private if payload.is_private is not None else bool(metadata.get("is_private", False)),
            journal_date=payload.journal_date or metadata.get("journal_date"),
            period_type=payload.period_type or metadata.get("period_type"),
            start_at=payload.start_at,
            end_at=payload.end_at,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return note_to_response(note)


@router.get("/tasks", response_model=list[TaskResponse])
def get_tasks(db: Session = Depends(get_db)) -> list[TaskResponse]:
    return [TaskResponse.model_validate(task) for task in list_tasks(db)]


@router.post("/tasks", response_model=TaskResponse)
def create_task_api(payload: TaskCreate, db: Session = Depends(get_db)) -> TaskResponse:
    return TaskResponse.model_validate(create_task(db, payload.title, payload.status, payload.priority, payload.task_type, payload.deadline))


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task_api(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)) -> TaskResponse:
    task = update_task(db, task_id, title=payload.title, status=payload.status, priority=payload.priority, task_type=payload.task_type, deadline=payload.deadline)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskResponse.model_validate(task)


@router.post("/agent")
async def agent_api(payload: AgentRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    response = await run_agent(db, payload.goal, ai_client)
    return response.model_dump()


@router.get("/model-config")
def get_model_config_api(db: Session = Depends(get_db)) -> dict[str, str]:
    config = get_or_create_model_config(db)
    return {
        "provider": config.provider,
        "api_key": config.api_key,
        "base_url": config.base_url,
        "model_name": config.model_name,
    }


@router.post("/model-config")
def update_model_config_api(payload: ModelConfigPayload, db: Session = Depends(get_db)) -> dict[str, str]:
    config = update_model_config(db, payload.provider, payload.api_key, payload.base_url, payload.model_name)
    return {
        "provider": config.provider,
        "api_key": config.api_key,
        "base_url": config.base_url,
        "model_name": config.model_name,
    }


@router.get("/settings", response_model=WorkspaceSettingsResponse)
def get_settings_api(db: Session = Depends(get_db)) -> WorkspaceSettingsResponse:
    return WorkspaceSettingsResponse(data=get_workspace_settings(db))


@router.post("/settings", response_model=WorkspaceSettingsResponse)
def update_settings_api(payload: WorkspaceSettingsPayload, db: Session = Depends(get_db)) -> WorkspaceSettingsResponse:
    return WorkspaceSettingsResponse(data=update_workspace_settings(db, payload.data))


@router.get("/plugins", response_model=list[PluginManifestResponse])
def list_plugins_api(db: Session = Depends(get_db)) -> list[PluginManifestResponse]:
    workspace_settings = get_workspace_settings(db)
    enabled_ids = workspace_settings.get("enabled_plugins") if isinstance(workspace_settings.get("enabled_plugins"), list) else []
    return [PluginManifestResponse(**plugin) for plugin in list_plugins(enabled_ids)]


@router.get("/private-vault", response_model=PrivateVaultStatusResponse)
def private_vault_status_api() -> PrivateVaultStatusResponse:
    return PrivateVaultStatusResponse(**workspace_store.private_vault_status())


@router.post("/private-vault/unlock", response_model=PrivateVaultStatusResponse)
def unlock_private_vault_api(payload: PrivateVaultPassphrasePayload) -> PrivateVaultStatusResponse:
    try:
        return PrivateVaultStatusResponse(**workspace_store.unlock_private_vault(payload.passphrase))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/private-vault/lock", response_model=PrivateVaultStatusResponse)
def lock_private_vault_api() -> PrivateVaultStatusResponse:
    return PrivateVaultStatusResponse(**workspace_store.lock_private_vault())






@router.get("/updates", response_model=UpdateStateResponse)
def get_update_state_api(db: Session = Depends(get_db)) -> UpdateStateResponse:
    return update_state_response(db)


@router.get("/updates/check", response_model=UpdateAvailabilityResponse)
def check_updates_api() -> UpdateAvailabilityResponse:
    try:
        return UpdateAvailabilityResponse(**offline_update_service.check_latest_release())
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/updates/upload", response_model=UpdateStateResponse)
async def upload_update_package_api(file: UploadFile = File(...), db: Session = Depends(get_db)) -> UpdateStateResponse:
    try:
        uploaded = offline_update_service.save_uploaded_package(file.filename or "update-package", await file.read())
    except ValueError as error:
        update_update_state(db, status="error", last_error=str(error))
        raise HTTPException(status_code=400, detail=str(error)) from error
    state = update_update_state(
        db,
        current_version=offline_update_service.runtime_version(),
        staged_version=None,
        package_path=uploaded["package_path"],
        package_kind=uploaded["package_kind"],
        manifest={},
        status="uploaded",
        last_error="",
    )
    return UpdateStateResponse(**update_state_to_dict(state))


@router.post("/updates/stage", response_model=UpdateStateResponse)
def stage_update_package_api(payload: UpdateStatePayload, db: Session = Depends(get_db)) -> UpdateStateResponse:
    try:
        staged = offline_update_service.stage_package(payload.package_path or "", payload.package_kind, payload.staged_version)
    except ValueError as error:
        update_update_state(db, status="error", last_error=str(error))
        raise HTTPException(status_code=400, detail=str(error)) from error
    state = update_update_state(
        db,
        channel=staged["channel"],
        current_version=staged["current_version"],
        staged_version=staged["staged_version"],
        package_path=staged["package_path"],
        package_kind=staged["package_kind"],
        manifest=staged["manifest"],
        status=staged["status"],
        last_error=staged["last_error"],
    )
    return UpdateStateResponse(**update_state_to_dict(state))


@router.post("/updates/apply", response_model=ApplyUpdateResponse)
def apply_update_package_api(db: Session = Depends(get_db)) -> ApplyUpdateResponse:
    state_dict = update_state_to_dict(get_or_create_update_state(db))
    try:
        prepared = offline_update_service.prepare_apply(state_dict)
    except ValueError as error:
        state = update_update_state(db, status="error", last_error=str(error))
        raise HTTPException(status_code=400, detail=str(error)) from error
    state = update_update_state(
        db,
        channel=prepared["channel"],
        current_version=prepared["current_version"],
        staged_version=prepared["staged_version"],
        package_path=prepared["package_path"],
        package_kind=prepared["package_kind"],
        manifest=prepared["manifest"],
        status=prepared["status"],
        last_error=prepared["last_error"],
    )
    return ApplyUpdateResponse(
        status="ok",
        detail="更新已登记，应用将在退出后启动。",
        update_state=UpdateStateResponse(**update_state_to_dict(state)),
    )


@router.post("/updates/rollback", response_model=ApplyUpdateResponse)
def rollback_update_package_api(db: Session = Depends(get_db)) -> ApplyUpdateResponse:
    state_dict = update_state_to_dict(get_or_create_update_state(db))
    try:
        prepared = offline_update_service.prepare_rollback(state_dict)
    except ValueError as error:
        state = update_update_state(db, status="error", last_error=str(error))
        raise HTTPException(status_code=400, detail=str(error)) from error
    state = update_update_state(
        db,
        channel=prepared["channel"],
        current_version=prepared["current_version"],
        staged_version=prepared["staged_version"],
        package_path=prepared["package_path"],
        package_kind=prepared["package_kind"],
        manifest=prepared["manifest"],
        status=prepared["status"],
        last_error=prepared["last_error"],
    )
    return ApplyUpdateResponse(
        status="ok",
        detail="回滚已登记，应用将在退出后恢复上一版本。",
        update_state=UpdateStateResponse(**update_state_to_dict(state)),
    )
