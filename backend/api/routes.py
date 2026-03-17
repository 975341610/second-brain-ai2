from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.agent.planner import run_agent
from backend.config import get_settings
from backend.models.db_models import Note
from backend.models.schemas import (
    AgentRequest,
    AskRequest,
    AskResponse,
    Citation,
    ModelConfigPayload,
    NoteCreate,
    NoteResponse,
    NoteUpdate,
    SearchRequest,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    UploadResponse,
)
from backend.database import get_db
from backend.rag.pipeline import citations_from_results, cosine_similarity, search_knowledge
from backend.services.ai_client import AIClient
from backend.services.document_service import chunk_text, parse_document
from backend.services.repositories import (
    create_note,
    create_task,
    get_note,
    get_or_create_model_config,
    list_notes,
    list_tasks,
    replace_note_links,
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
        content=note.content,
        summary=note.summary,
        tags=[tag for tag in note.tags.split(",") if tag],
        links=links,
        created_at=note.created_at,
    )


async def persist_note(db: Session, title: str, content: str) -> NoteResponse:
    return await index_note(db, None, title, content)


async def index_note(db: Session, note_id: int | None, title: str, content: str) -> NoteResponse:
    model_config = get_or_create_model_config(db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    summary = await ai_client.summarize(content, llm_config)
    tags = await ai_client.tags(content, llm_config)
    note = create_note(db, title=title, content=content, summary=summary, tags=tags) if note_id is None else update_note(db, note_id, title, content, summary, tags)

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
    for file in files:
        content = await file.read()
        title, parsed = parse_document(file.filename, content)
        imported.append(await persist_note(db, title, parsed))
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


@router.post("/notes", response_model=NoteResponse)
async def create_note_api(payload: NoteCreate, db: Session = Depends(get_db)) -> NoteResponse:
    return await persist_note(db, payload.title, payload.content)


@router.put("/notes/{note_id}", response_model=NoteResponse)
async def update_note_api(note_id: int, payload: NoteUpdate, db: Session = Depends(get_db)) -> NoteResponse:
    existing = get_note(db, note_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Note not found")
    title = payload.title or existing.title
    content = payload.content or existing.content
    return await index_note(db, note_id, title, content)


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
