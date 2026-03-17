from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.agent.planner import run_agent
from backend.config import get_settings
from backend.models.db_models import Note, Notebook
from backend.models.schemas import (
    AgentRequest,
    AskRequest,
    AskResponse,
    BulkNoteAction,
    Citation,
    ModelConfigPayload,
    NotebookCreate,
    NotebookUpdate,
    NotebookResponse,
    NoteCreate,
    NoteMovePayload,
    NoteResponse,
    NoteUpdate,
    SearchRequest,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    TrashResponse,
    UploadResponse,
)
from backend.database import get_db
from backend.rag.pipeline import citations_from_results, cosine_similarity, search_knowledge
from backend.services.ai_client import AIClient
from backend.services.document_service import chunk_text, parse_document
from backend.services.repositories import (
    create_note,
    create_notebook,
    create_task,
    get_note,
    get_or_create_default_notebook,
    get_or_create_model_config,
    list_notes,
    list_notebooks,
    list_trashed_notes,
    list_trashed_notebooks,
    list_tasks,
    bulk_move_notes,
    bulk_soft_delete_notes,
    move_note,
    purge_note,
    purge_notebook,
    replace_note_links,
    restore_note,
    restore_notebook,
    soft_delete_note,
    soft_delete_notebook,
    update_notebook,
    update_note,
    update_model_config,
    update_task,
)
from backend.services.vector_store import vector_store


router = APIRouter()
settings = get_settings()
ai_client = AIClient()


def note_to_response(note: Note) -> NoteResponse:
    links = [link.target_note_id for link in note.links_from]
    return NoteResponse(
        id=note.id,
        title=note.title,
        icon=note.icon,
        content=note.content,
        summary=note.summary,
        tags=[tag for tag in note.tags.split(",") if tag],
        links=links,
        notebook_id=note.notebook_id,
        position=note.position,
        created_at=note.created_at,
        deleted_at=note.deleted_at,
    )


def notebook_to_response(notebook: Notebook) -> NotebookResponse:
    return NotebookResponse.model_validate(notebook)


async def persist_note(db: Session, title: str, content: str, notebook_id: int | None = None, icon: str = "📝") -> NoteResponse:
    return await index_note(db, None, title, content, notebook_id, icon)


async def index_note(db: Session, note_id: int | None, title: str, content: str, notebook_id: int | None = None, icon: str = "📝") -> NoteResponse:
    model_config = get_or_create_model_config(db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    summary = await ai_client.summarize(content, llm_config)
    tags = await ai_client.tags(content, llm_config)
    if note_id is None:
        notebook_id = notebook_id or get_or_create_default_notebook(db).id
        note = create_note(db, title=title, content=content, summary=summary, tags=tags, notebook_id=notebook_id, icon=icon)
    else:
        note = update_note(db, note_id, title, content, summary, tags, icon)

    chunks = chunk_text(content, settings.chunk_size_words, settings.chunk_overlap_words)
    records = []
    vector_store.delete_note_chunks(note.id)
    note_embedding = await ai_client.embed(f"{title}\n{summary}\n{content[:3000]}", llm_config)
    for index, chunk in enumerate(chunks):
        embedding = await ai_client.embed(chunk, llm_config)
        records.append(
            {
                "id": f"note-{note.id}-chunk-{index}",
                "document": chunk,
                "embedding": embedding,
                "metadata": {"note_id": note.id, "title": title, "chunk_index": index},
            }
        )
    vector_store.upsert_chunks(records)

    other_notes = [item for item in list_notes(db) if item.id != note.id]
    link_targets: list[tuple[int, float]] = []
    for item in other_notes:
        other_embedding = await ai_client.embed(f"{item.title}\n{item.summary}\n{item.content[:3000]}", llm_config)
        score = cosine_similarity(note_embedding, other_embedding)
        if score >= 0.2:
            link_targets.append((item.id, score))
    replace_note_links(db, note.id, sorted(link_targets, key=lambda pair: pair[1], reverse=True)[:5])

    db.refresh(note)
    return note_to_response(note)


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(files: list[UploadFile] = File(...), db: Session = Depends(get_db)) -> UploadResponse:
    imported: list[NoteResponse] = []
    default_notebook = get_or_create_default_notebook(db)
    for file in files:
        content = await file.read()
        title, parsed = parse_document(file.filename, content)
        imported.append(await persist_note(db, title, parsed, default_notebook.id))
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

    results = await search_knowledge(payload.question, ai_client=ai_client)
    citations = citations_from_results(db, results)
    answer = await ai_client.answer(payload.question, citations, llm_config)
    return AskResponse(answer=answer, citations=[Citation(**item) for item in citations], mode="rag")


@router.post("/search")
async def search_api(payload: SearchRequest, db: Session = Depends(get_db)) -> dict:
    results = await search_knowledge(payload.query, ai_client=ai_client, top_k=payload.top_k)
    return {"results": citations_from_results(db, results)}


@router.get("/notes", response_model=list[NoteResponse])
def get_notes(db: Session = Depends(get_db)) -> list[NoteResponse]:
    return [note_to_response(note) for note in list_notes(db)]


@router.get("/trash", response_model=TrashResponse)
def get_trash(db: Session = Depends(get_db)) -> TrashResponse:
    return TrashResponse(
        notes=[note_to_response(note) for note in list_trashed_notes(db)],
        notebooks=[notebook_to_response(notebook) for notebook in list_trashed_notebooks(db)],
    )


@router.get("/notebooks", response_model=list[NotebookResponse])
def get_notebooks(db: Session = Depends(get_db)) -> list[NotebookResponse]:
    get_or_create_default_notebook(db)
    return [notebook_to_response(notebook) for notebook in list_notebooks(db)]


@router.post("/notebooks", response_model=NotebookResponse)
def create_notebook_api(payload: NotebookCreate, db: Session = Depends(get_db)) -> NotebookResponse:
    return notebook_to_response(create_notebook(db, payload.name, payload.icon))


@router.patch("/notebooks/{notebook_id}", response_model=NotebookResponse)
def update_notebook_api(notebook_id: int, payload: NotebookUpdate, db: Session = Depends(get_db)) -> NotebookResponse:
    notebook = update_notebook(db, notebook_id, payload.name, payload.icon)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook_to_response(notebook)


@router.delete("/notebooks/{notebook_id}")
def delete_notebook_api(notebook_id: int, db: Session = Depends(get_db)) -> dict:
    notebook = soft_delete_notebook(db, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found or cannot delete default notebook")
    return {"status": "ok"}


@router.post("/notebooks/{notebook_id}/restore", response_model=NotebookResponse)
def restore_notebook_api(notebook_id: int, db: Session = Depends(get_db)) -> NotebookResponse:
    notebook = restore_notebook(db, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook_to_response(notebook)


@router.delete("/notebooks/{notebook_id}/purge")
def purge_notebook_api(notebook_id: int, db: Session = Depends(get_db)) -> dict:
    if not purge_notebook(db, notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found or cannot purge default notebook")
    return {"status": "ok"}


@router.post("/notes", response_model=NoteResponse)
async def create_note_api(payload: NoteCreate, db: Session = Depends(get_db)) -> NoteResponse:
    return await persist_note(db, payload.title, payload.content, payload.notebook_id, payload.icon)


@router.put("/notes/{note_id}", response_model=NoteResponse)
async def update_note_api(note_id: int, payload: NoteUpdate, db: Session = Depends(get_db)) -> NoteResponse:
    existing = get_note(db, note_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Note not found")
    title = payload.title or existing.title
    content = payload.content or existing.content
    icon = payload.icon or existing.icon
    return await index_note(db, note_id, title, content, existing.notebook_id, icon)


@router.patch("/notes/{note_id}/move", response_model=NoteResponse)
def move_note_api(note_id: int, payload: NoteMovePayload, db: Session = Depends(get_db)) -> NoteResponse:
    target_notebook_id = payload.notebook_id or get_or_create_default_notebook(db).id
    note = move_note(db, note_id, target_notebook_id, payload.position)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)


@router.post("/notes/bulk-move")
def bulk_move_notes_api(payload: BulkNoteAction, db: Session = Depends(get_db)) -> dict:
    notebook_id = payload.notebook_id or get_or_create_default_notebook(db).id
    notes = bulk_move_notes(db, payload.note_ids, notebook_id, payload.position)
    return {"notes": [note_to_response(note).model_dump() for note in notes]}


@router.post("/notes/bulk-delete")
def bulk_delete_notes_api(payload: BulkNoteAction, db: Session = Depends(get_db)) -> dict:
    notes = bulk_soft_delete_notes(db, payload.note_ids)
    return {"notes": [note_to_response(note).model_dump() for note in notes]}


@router.delete("/notes/{note_id}")
def delete_note_api(note_id: int, db: Session = Depends(get_db)) -> dict:
    note = soft_delete_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"status": "ok"}


@router.post("/notes/{note_id}/restore", response_model=NoteResponse)
def restore_note_api(note_id: int, db: Session = Depends(get_db)) -> NoteResponse:
    note = restore_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)


@router.delete("/notes/{note_id}/purge")
def purge_note_api(note_id: int, db: Session = Depends(get_db)) -> dict:
    if not purge_note(db, note_id):
        raise HTTPException(status_code=404, detail="Note not found")
    return {"status": "ok"}


@router.get("/tasks", response_model=list[TaskResponse])
def get_tasks(db: Session = Depends(get_db)) -> list[TaskResponse]:
    return [TaskResponse.model_validate(task) for task in list_tasks(db)]


@router.post("/tasks", response_model=TaskResponse)
def create_task_api(payload: TaskCreate, db: Session = Depends(get_db)) -> TaskResponse:
    return TaskResponse.model_validate(create_task(db, payload.title, payload.status))


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task_api(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)) -> TaskResponse:
    task = update_task(db, task_id, title=payload.title, status=payload.status)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskResponse.model_validate(task)


@router.post("/agent")
async def agent_api(payload: AgentRequest, db: Session = Depends(get_db)) -> dict:
    response = await run_agent(db, payload.goal, ai_client)
    return response.model_dump()


@router.get("/model-config")
def get_model_config_api(db: Session = Depends(get_db)) -> dict:
    config = get_or_create_model_config(db)
    return {
        "provider": config.provider,
        "api_key": config.api_key,
        "base_url": config.base_url,
        "model_name": config.model_name,
    }


@router.post("/model-config")
def update_model_config_api(payload: ModelConfigPayload, db: Session = Depends(get_db)) -> dict:
    config = update_model_config(db, payload.provider, payload.api_key, payload.base_url, payload.model_name)
    return {
        "provider": config.provider,
        "api_key": config.api_key,
        "base_url": config.base_url,
        "model_name": config.model_name,
    }
