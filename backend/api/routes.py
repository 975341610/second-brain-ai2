from __future__ import annotations
import os
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Form, BackgroundTasks
from fastapi.responses import StreamingResponse
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
    InlineAIRequest,
    ModelConfigPayload,
    NotebookCreate,
    NotebookUpdate,
    NotebookResponse,
    NoteCreate,
    NoteMovePayload,
    NotePropertyCreate,
    NotePropertyResponse,
    NotePropertyUpdate,
    NoteResponse,
    NoteUpdate,
    QuickCaptureRequest,
    QuickCaptureResponse,
    SearchRequest,
    TagSuggestRequest,
    TagSuggestResponse,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    TrashResponse,
    UploadResponse,
    UserStatsResponse,
    AchievementResponse,
    UserAchievementResponse,
    ThemeUpdatePayload,
)
from backend.database import get_db, SessionLocal, engine
from backend.utils import log_buffer
import subprocess
import json
from backend.config import get_settings, get_custom_config_path, PROJECT_DIR
from backend.rag.pipeline import citations_from_results, cosine_similarity, search_knowledge
from backend.services.ai_client import AIClient
from backend.services.document_service import chunk_text, parse_document
from backend.services.repositories import (
    add_exp,
    create_note,
    create_notebook,
    create_note_property,
    create_task,
    delete_note_property,
    delete_task,
    clear_completed_tasks,
    get_note,
    get_note_properties,
    get_or_create_default_notebook,
    get_or_create_inbox_notebook,
    get_or_create_model_config,
    get_or_create_user_stats,
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
    purge_trash,
    update_notebook,
    update_note,
    update_model_config,
    update_note_property,
    update_task,
    list_user_achievements,
    check_and_unlock_achievements,
    update_user_theme,
    update_user_wallpaper,
)
from backend.services.vector_store import vector_store

router = APIRouter()
settings = get_settings()
ai_client = AIClient()

async def background_index_note(note_id: int, title: str, content: str, tags: list[str] | None = None, icon: str = "\U0001f4dd", parent_id: int | None = None, is_title_manually_edited: bool = False):
    """异步执行 AI 处理：摘要、向量化、自动链接"""
    db = SessionLocal()
    try:
        # 获取最新的 AI 配置
        model_config = get_or_create_model_config(db)
        llm_config = {
            "provider": model_config.provider,
            "api_key": model_config.api_key,
            "base_url": model_config.base_url,
            "model_name": model_config.model_name,
        }
        
        # 1. 摘要处理
        summary = await ai_client.summarize(content, llm_config)
        
        # 2. 更新数据库摘要 (这里不需要重复传入 content 以免大并发下覆盖新数据，但后端接口通常是全量)
        # 引入重试机制以应对可能的 SQLite 锁竞争
        from backend.database import with_db_retry
        @with_db_retry(max_retries=5, delay=0.5)
        def save_summary():
            update_note(db, note_id, title=title, content=content, summary=summary, tags=tags, icon=icon, parent_id=parent_id, is_title_manually_edited=is_title_manually_edited)
        
        save_summary()
        
        # 3. 向量索引处理
        chunks = chunk_text(content, settings.chunk_size_words, settings.chunk_overlap_words)
        records = []
        vector_store.delete_note_chunks(note_id)
        
        # 笔记级向量（基于摘要和前 3000 字）
        note_embedding = await ai_client.embed(f"{title}\n{summary}\n{content[:3000]}", llm_config)
        
        for index, chunk in enumerate(chunks):
            embedding = await ai_client.embed(chunk, llm_config)
            records.append({
                "id": f"note-{note_id}-chunk-{index}",
                "document": chunk,
                "embedding": embedding,
                "metadata": {"note_id": note_id, "title": title, "chunk_index": index},
            })
        
        if records:
            vector_store.upsert_chunks(records)
            
        # 4. 自动链接处理
        results = vector_store.search(note_embedding, top_k=6)
        link_targets: list[tuple[int, float]] = []
        seen_notes = {note_id}
        for item in results:
            target_id = item["metadata"]["note_id"]
            if target_id not in seen_notes and item["score"] >= 0.2:
                link_targets.append((target_id, item["score"]))
                seen_notes.add(target_id)
        
        if link_targets:
            @with_db_retry(max_retries=5, delay=0.5)
            def save_links():
                replace_note_links(db, note_id, sorted(link_targets, key=lambda pair: pair[1], reverse=True)[:5])
            save_links()
            
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error in background indexing note {note_id}: {str(e)}")
        # In case of DB errors, we rollback the current session
        db.rollback()
    finally:
        db.close()


def note_to_response(note: Note) -> NoteResponse:
    links = [link.target_note_id for link in note.links_from]
    properties = [NotePropertyResponse.model_validate(p) for p in note.properties]
    return NoteResponse(
        id=note.id,
        title=note.title,
        icon=note.icon,
        content=note.content,
        summary=note.summary,
        tags=[tag for tag in note.tags.split(",") if tag],
        properties=properties,
        links=links,
        notebook_id=note.notebook_id,
        parent_id=note.parent_id,
        position=note.position,
        is_title_manually_edited=(note.is_title_manually_edited == 1),
        created_at=note.created_at,
        deleted_at=note.deleted_at,
    )

def notebook_to_response(notebook: Notebook) -> NotebookResponse:
    return NotebookResponse.model_validate(notebook)

async def persist_note(db: Session, title: str, content: str, background_tasks: BackgroundTasks, notebook_id: int | None = None, icon: str = "\U0001f4dd", parent_id: int | None = None, is_title_manually_edited: bool = False, tags: list[str] | None = None) -> NoteResponse:
    # 1. 快速创建数据库记录
    from backend.database import with_db_retry
    
    @with_db_retry(max_retries=3)
    def do_create():
        nonlocal notebook_id
        notebook_id = notebook_id or get_or_create_default_notebook(db).id
        return create_note(db, title=title, content=content, summary="", tags=tags, notebook_id=notebook_id, icon=icon, parent_id=parent_id, is_title_manually_edited=is_title_manually_edited)
    
    note = do_create()
    
    # 2. 异步执行 AI 任务
    background_tasks.add_task(
        background_index_note, 
        note.id, title, content, 
        tags, icon, parent_id, is_title_manually_edited
    )
    
    return note_to_response(note)

@router.post("/notes/quick-capture", response_model=QuickCaptureResponse)
async def quick_capture_api(payload: QuickCaptureRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> QuickCaptureResponse:
    from datetime import datetime
    title = f"灵感碎片 - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    # 1. 确保 Inbox 笔记本存在
    inbox = get_or_create_inbox_notebook(db)
    
    # 2. 持久化笔记
    note_resp = await persist_note(db, title, payload.content, background_tasks, notebook_id=inbox.id, icon="⚡")
    
    # 3. 增加 EXP
    exp_gained = 10
    stats = add_exp(db, exp_gained)
    
    return QuickCaptureResponse(
        status="success",
        note=note_resp,
        exp_gained=exp_gained,
        current_exp=stats.exp,
        current_level=stats.level
    )

@router.get("/user/stats", response_model=UserStatsResponse)
def get_user_stats_api(db: Session = Depends(get_db)) -> UserStatsResponse:
    stats = get_or_create_user_stats(db)
    # 每次获取 stats 时检查是否有新成就解锁
    check_and_unlock_achievements(db)
    return UserStatsResponse.model_validate(stats)


@router.get("/user/achievements", response_model=list[UserAchievementResponse])
def get_user_achievements_api(db: Session = Depends(get_db)) -> list[UserAchievementResponse]:
    return [UserAchievementResponse.model_validate(ua) for ua in list_user_achievements(db)]


@router.patch("/user/theme", response_model=UserStatsResponse)
def update_user_theme_api(payload: ThemeUpdatePayload, db: Session = Depends(get_db)) -> UserStatsResponse:
    stats = update_user_theme(db, payload.theme)
    return UserStatsResponse.model_validate(stats)


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(background_tasks: BackgroundTasks, files: list[UploadFile] = File(...), db: Session = Depends(get_db)) -> UploadResponse:
    imported: list[NoteResponse] = []
    default_notebook = get_or_create_default_notebook(db)
    for file in files:
        content = await file.read()
        title, parsed = parse_document(file.filename, content)
        imported.append(await persist_note(db, title, parsed, background_tasks, default_notebook.id))
    return UploadResponse(imported_notes=imported)

@router.post("/media/upload")
async def upload_media_api(file: UploadFile = File(...)):
    try:
        ext = os.path.splitext(file.filename)[1]
        unique_name = f"{uuid.uuid4()}{ext}"
        save_path = Path(settings.uploads_path) / unique_name
        with open(save_path, "wb") as f:
            f.write(await file.read())
        return {
            "url": f"/api/media/files/{unique_name}",
            "name": file.filename,
            "size": save_path.stat().st_size,
            "type": file.content_type
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.post("/media/upload/init")
async def upload_media_init(filename: str = Form(...), size: int = Form(...)):
    upload_id = str(uuid.uuid4())
    temp_dir = Path(settings.uploads_path) / "temp" / upload_id
    temp_dir.mkdir(parents=True, exist_ok=True)
    return {"upload_id": upload_id}

@router.post("/media/upload/chunk")
async def upload_media_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    file: UploadFile = File(...)
):
    temp_dir = Path(settings.uploads_path) / "temp" / upload_id
    if not temp_dir.exists():
        raise HTTPException(status_code=400, detail="Invalid upload_id")
    chunk_path = temp_dir / f"chunk_{chunk_index}"
    with open(chunk_path, "wb") as f:
        f.write(await file.read())
    return {"status": "ok"}

@router.post("/media/upload/complete")
async def upload_media_complete(
    upload_id: str = Form(...),
    filename: str = Form(...),
    content_type: str = Form(...)
):
    temp_dir = Path(settings.uploads_path) / "temp" / upload_id
    if not temp_dir.exists():
        raise HTTPException(status_code=400, detail="Invalid upload_id")
    
    ext = os.path.splitext(filename)[1]
    unique_name = f"{uuid.uuid4()}{ext}"
    final_path = Path(settings.uploads_path) / unique_name
    
    chunks = sorted(temp_dir.glob("chunk_*"), key=lambda p: int(p.name.split("_")[1]))
    with open(final_path, "wb") as outfile:
        for chunk_path in chunks:
            with open(chunk_path, "rb") as infile:
                shutil.copyfileobj(infile, outfile)
    
    shutil.rmtree(temp_dir)
    return {
        "url": f"/api/media/files/{unique_name}",
        "name": filename,
        "size": final_path.stat().st_size,
        "type": content_type
    }

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
    elif payload.mode == "chat":
        answer = await ai_client.answer(payload.question, [], llm_config)
        return AskResponse(answer=answer, citations=[], mode="chat")
    else:
        results = await search_knowledge(payload.question, ai_client=ai_client)
        citations = citations_from_results(db, results)
        answer = await ai_client.answer(payload.question, citations, llm_config)
        return AskResponse(answer=answer, citations=[Citation(**item) for item in citations], mode="rag")

@router.post("/search")
async def search_api(payload: SearchRequest, db: Session = Depends(get_db)) -> dict:
    results = await search_knowledge(payload.query, ai_client=ai_client, top_k=payload.top_k)
    return {"results": citations_from_results(db, results)}

@router.post("/ai/inline")
async def inline_ai(payload: InlineAIRequest, db: Session = Depends(get_db)):
    model_config = get_or_create_model_config(db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    system_prompts = {
        "continue": "You are a writing assistant. Continue writing the following text naturally. Return only the new text.",
        "expand": "You are a writing assistant. Expand the following text with more details and depth. Return only the expanded version.",
        "summarize": "You are a writing assistant. Summarize the following text concisely. Return only the summary.",
        "rewrite": "You are a writing assistant. Rewrite the following text to be more professional and clear. Return only the rewritten text.",
        "translate": "You are a writing assistant. Translate the following text to Chinese (if it is English) or English (if it is Chinese). Return only the translation.",
        "outline": "You are a writing assistant. Generate a structured outline for the following topic or text. Return only the outline.",
        "ask": "You are a writing assistant. Based on the selected text and context, answer the user's intent or improve the text accordingly. Return only the result.",
    }
    messages = [
        {"role": "system", "content": system_prompts.get(payload.action, "You are a helpful writing assistant.")},
        {"role": "user", "content": f"Context: {payload.context or ''}\n\nInput: {payload.prompt}"}
    ]
    
    async def generate():
        try:
            async for chunk in ai_client.stream_chat(messages, llm_config):
                yield chunk
        except Exception as e:
            import json
            error_msg = f"Inline AI Error: {str(e)}"
            yield f'data: {json.dumps({"error": error_msg})}\n\n'
    
    return StreamingResponse(
        generate(), 
        media_type="text/plain", 
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

@router.post("/chat")
async def global_chat(payload: AskRequest, db: Session = Depends(get_db)):
    model_config = get_or_create_model_config(db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    
    if payload.mode == "rag":
        results = await search_knowledge(payload.question, ai_client=ai_client, top_k=5)
        citations = citations_from_results(db, results)
        citation_block = "\n\n".join(
            f"[{idx + 1}] {item['title']}\n{item['excerpt']}" for idx, item in enumerate(citations)
        )
        messages = [
            {"role": "system", "content": "You are a personal second-brain assistant. Answer using the provided notes only. Always cite sources as [1], [2] inline."},
            {"role": "user", "content": f"Question: {payload.question}\n\nContext:\n{citation_block}"}
        ]
    else:
        citations = []
        messages = [
            {"role": "system", "content": "You are a helpful second-brain assistant."},
            {"role": "user", "content": payload.question}
        ]
        
    async def generate():
        try:
            if payload.mode == "rag":
                import json
                yield f"__CITATIONS__:{json.dumps(citations)}\n"
            async for chunk in ai_client.stream_chat(messages, llm_config):
                yield chunk
        except Exception as e:
            import json
            error_msg = f"Streaming Error: {str(e)}"
            yield f'data: {json.dumps({"error": error_msg})}\n\n'
            
    return StreamingResponse(
        generate(), 
        media_type="text/plain", 
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

@router.post("/tags/suggest", response_model=TagSuggestResponse)
async def suggest_tags(payload: TagSuggestRequest, db: Session = Depends(get_db)):
    model_config = get_or_create_model_config(db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    tags = await ai_client.tags(payload.content, llm_config)
    return TagSuggestResponse(tags=tags)

@router.get("/notes", response_model=list[NoteResponse])
def get_notes(property_name: str | None = None, property_value: str | None = None, db: Session = Depends(get_db)) -> list[NoteResponse]:
    filter_dict = None
    if property_name and property_value:
        filter_dict = {property_name: property_value}
    return [note_to_response(note) for note in list_notes(db, filter_dict)]

@router.get("/notes/{note_id}/properties", response_model=list[NotePropertyResponse])
def get_note_properties_api(note_id: int, db: Session = Depends(get_db)) -> list[NotePropertyResponse]:
    return [NotePropertyResponse.model_validate(p) for p in get_note_properties(db, note_id)]

@router.post("/notes/{note_id}/properties", response_model=NotePropertyResponse)
def create_note_property_api(note_id: int, payload: NotePropertyCreate, db: Session = Depends(get_db)) -> NotePropertyResponse:
    return NotePropertyResponse.model_validate(create_note_property(db, note_id, payload.name, payload.type, payload.value))

@router.patch("/notes/{note_id}/properties/{property_id}", response_model=NotePropertyResponse)
def update_note_property_api(note_id: int, property_id: int, payload: NotePropertyUpdate, db: Session = Depends(get_db)) -> NotePropertyResponse:
    prop = update_note_property(db, property_id, payload.name, payload.type, payload.value)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return NotePropertyResponse.model_validate(prop)

@router.delete("/notes/{note_id}/properties/{property_id}")
def delete_note_property_api(note_id: int, property_id: int, db: Session = Depends(get_db)) -> dict:
    if not delete_note_property(db, property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    return {"status": "ok"}

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
async def create_note_api(payload: NoteCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> NoteResponse:
    return await persist_note(db, payload.title, payload.content, background_tasks, payload.notebook_id, payload.icon, payload.parent_id, payload.is_title_manually_edited, payload.tags)

@router.put("/notes/{note_id}", response_model=NoteResponse)
async def update_note_api(note_id: int, payload: NoteUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> NoteResponse:
    existing = get_note(db, note_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # 1. 快速更新基本信息
    title = payload.title if payload.title is not None else existing.title
    content = payload.content if payload.content is not None else existing.content
    icon = payload.icon if payload.icon is not None else existing.icon
    parent_id = payload.parent_id if payload.parent_id is not None else existing.parent_id
    is_title_manually_edited = payload.is_title_manually_edited if payload.is_title_manually_edited is not None else (existing.is_title_manually_edited == 1)
    tags = payload.tags
    
    # 同步更新数据库
    from backend.database import with_db_retry
    @with_db_retry(max_retries=3)
    def do_update():
        return update_note(db, note_id, title, content, existing.summary, tags, icon, parent_id, is_title_manually_edited)
    
    note = do_update()
    
    # 2. 异步执行 AI 后台任务
    background_tasks.add_task(
        background_index_note,
        note.id, title, content,
        tags, icon, parent_id, is_title_manually_edited
    )
    
    return note_to_response(note)

@router.patch("/notes/{note_id}/tags", response_model=NoteResponse)
def update_note_tags_api(note_id: int, tags: list[str], db: Session = Depends(get_db)) -> NoteResponse:
    note = update_note(db, note_id, tags=tags)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)

@router.patch("/notes/{note_id}/move", response_model=NoteResponse)
def move_note_api(note_id: int, payload: NoteMovePayload, db: Session = Depends(get_db)) -> NoteResponse:
    target_notebook_id = payload.notebook_id or get_or_create_default_notebook(db).id
    note = move_note(db, note_id, target_notebook_id, payload.position, payload.parent_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)

@router.post("/notes/bulk-move")
def bulk_move_notes_api(payload: BulkNoteAction, db: Session = Depends(get_db)) -> dict:
    notebook_id = payload.notebook_id or get_or_create_default_notebook(db).id
    notes = bulk_move_notes(db, payload.note_ids, notebook_id, payload.position, payload.parent_id)
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
def delete_note_purge_api(note_id: int, db: Session = Depends(get_db)) -> dict:
    if not purge_note(db, note_id):
        raise HTTPException(status_code=404, detail="Note not found")
    return {"status": "ok"}

@router.delete("/trash/purge")
def purge_trash_api(db: Session = Depends(get_db)) -> dict:
    if not purge_trash(db):
        raise HTTPException(status_code=500, detail="Failed to purge trash")
    return {"status": "ok"}

# ============================================================
# 🎵 BGM 播放器接口
# ============================================================

@router.get("/bgm/list", response_model=list[str])
def list_bgm():
    """获取 BGM 文件列表"""
    bgm_path = Path(settings.data_root) / "bgm"
    if not bgm_path.exists():
        bgm_path.mkdir(parents=True, exist_ok=True)
    
    files = []
    for ext in ["*.mp3", "*.wav", "*.ogg"]:
        files.extend([f.name for f in bgm_path.glob(ext)])
    return sorted(files)

@router.get("/bgm/stream/{filename}")
def stream_bgm(filename: str):
    """流式返回 BGM 文件"""
    bgm_path = Path(settings.data_root) / "bgm" / filename
    if not bgm_path.exists():
        raise HTTPException(status_code=404, detail="BGM file not found")
    
    def iterfile():
        with open(bgm_path, mode="rb") as f:
            yield from f
            
    return StreamingResponse(iterfile(), media_type="audio/mpeg")

@router.get("/tasks", response_model=list[TaskResponse])
def get_tasks(db: Session = Depends(get_db)) -> list[TaskResponse]:
    return [TaskResponse.model_validate(task) for task in list_tasks(db)]

@router.post("/tasks", response_model=TaskResponse)
def create_task_api(payload: TaskCreate, db: Session = Depends(get_db)) -> TaskResponse:
    return TaskResponse.model_validate(create_task(db, payload.title, payload.status, payload.priority, payload.task_type, payload.deadline))

@router.post("/tasks/clear-completed")
def clear_completed_tasks_api(db: Session = Depends(get_db)) -> dict:
    count = clear_completed_tasks(db)
    return {"status": "ok", "cleared_count": count}

@router.patch("/tasks/{task_id:int}", response_model=TaskResponse)
def update_task_api(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)) -> TaskResponse:
    task = update_task(db, task_id, title=payload.title, status=payload.status, priority=payload.priority, task_type=payload.task_type, deadline=payload.deadline)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskResponse.model_validate(task)

@router.delete("/tasks/{task_id:int}")
def delete_task_api(task_id: int, db: Session = Depends(get_db)) -> dict:
    if not delete_task(db, task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "ok"}

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

# ============================================================
# 🖥️ 系统管理接口 (Windows 窗口化增强)
# ============================================================

@router.get("/system/logs")
async def get_system_logs():
    """获取实时日志 Buffer"""
    return {"logs": log_buffer.get_logs()}

@router.post("/system/switch-data-path")
async def switch_data_path(payload: dict):
    """切换数据存储路径。如果目标路径不存在数据库，则迁移；如果已存在，则直接切换。"""
    new_path_str = payload.get("data_path")
    if not new_path_str:
        raise HTTPException(status_code=400, detail="Missing data_path")
    
    new_path = Path(new_path_str).resolve()
    old_path = settings.data_root.resolve()
    
    if new_path == old_path:
        return {"status": "ok", "message": "Path is same"}

    try:
        # 1. 确保新路径父目录存在
        new_path.mkdir(parents=True, exist_ok=True)
        
        # 2. 检查目标路径是否已存在数据库
        target_db = new_path / "second_brain.db"
        if not target_db.exists():
            # 目标路径没有数据库，执行“迁移”逻辑：将当前 data_root 的所有文件剪切/移动到新路径
            if old_path.exists():
                print(f"[*] Moving data from {old_path} to {new_path}...")
                # 遍历旧目录下的所有文件和文件夹
                for item in old_path.iterdir():
                    dest = new_path / item.name
                    # 如果目标已存在，先尝试删除（通常新目录下不会有同名文件）
                    if dest.exists():
                        if dest.is_dir():
                            shutil.rmtree(dest)
                        else:
                            dest.unlink()
                    
                    # 尝试移动
                    try:
                        shutil.move(str(item), str(dest))
                    except Exception:
                        if item.is_dir():
                            shutil.copytree(item, dest, dirs_exist_ok=True)
                            shutil.rmtree(item)
                        else:
                            shutil.copy2(item, dest)
                            item.unlink()
        else:
            # 目标路径已存在数据库，直接切换指向新路径（相当于自动读取新路径的旧数据）
            print(f"[*] Target database exists at {target_db}, switching engine to use it.")

        # 3. 更新 data_config.json
        config_path = get_custom_config_path()
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump({"data_path": str(new_path)}, f, indent=4)
            
        return {"status": "ok", "message": "路径切换成功，请重启软件生效"}
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to switch data path: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to switch data path: {str(e)}")

@router.get("/system/version")
async def get_system_version():
    """读取 VERSION.txt 或 metadata.json 获取详细版本信息"""
    import sys
    from backend.config import resource_root
    
    res_root = resource_root()
    metadata_file = res_root / "metadata.json"
    version_file = res_root / "VERSION.txt"
    
    info = {
        "version": "unknown",
        "git_commit": "unknown",
        "build_time": "unknown",
        "executable": sys.executable,
    }
    
    try:
        if metadata_file.exists():
            with open(metadata_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                info.update(data)
        elif version_file.exists():
            info["version"] = version_file.read_text(encoding="utf-8").strip()
    except Exception as e:
        print(f"[!] Error reading version info: {str(e)}")
        
    return info

@router.post("/system/update")
async def system_update(force: bool = False):
    """检查更新或执行 git pull origin main"""
    import shutil as _shutil
    import sys as _sys
    import os as _os
    
    try:
        # 1. 确定正确的 git 仓库根目录
        from backend.config import runtime_root
        if getattr(_sys, "frozen", False):
            repo_dir = str(runtime_root())
        else:
            repo_dir = str(PROJECT_DIR)
        
        # 2. 检查 git 是否可用 (增强检测：主动寻找安装路径)
        git_cmd = _shutil.which("git")
        if not git_cmd:
            # 常见安装路径探测 (Windows)
            possible_git_paths = [
                "C:\\Program Files\\Git\\bin\\git.exe",
                "C:\\Program Files\\Git\\cmd\\git.exe",
                "C:\\Program Files (x86)\\Git\\bin\\git.exe",
                "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
                _os.path.join(_os.environ.get("LOCALAPPDATA", ""), "Programs", "Git", "cmd", "git.exe")
            ]
            for path in possible_git_paths:
                if _os.path.exists(path):
                    git_cmd = path
                    break
        
        if not git_cmd:
            return {"status": "error", "output": "❌ 系统未找到 git 命令。\n请确保已安装 Git 并在终端中可访问。\n下载地址: https://git-scm.com/download/win"}
        
        # 3. 检查 .git 目录是否存在
        from pathlib import Path as _Path
        if not (_Path(repo_dir) / ".git").exists():
            return {"status": "error", "output": f"❌ 未找到 Git 仓库（.git 目录不存在）\n查找路径: {repo_dir}\n\n请确认您是从源码目录运行，而非只复制了 .exe 文件。"}
        
        print(f"[*] Using git at: {git_cmd}")
        print(f"[*] Git repo dir: {repo_dir}")
        print("[*] Checking for updates...")
        
        # 4. 先执行 fetch 获取远程状态 (设置超时)
        try:
            subprocess.run([git_cmd, "fetch", "origin", "main"], cwd=repo_dir, capture_output=True, timeout=15)
        except subprocess.TimeoutExpired:
            return {"status": "error", "output": "❌ git fetch 超时 (15s)，请检查网络连接后再重试。"}
        
        # 5. 比较本地和远程版本
        local_res = subprocess.run([git_cmd, "rev-parse", "HEAD"], cwd=repo_dir, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        remote_res = subprocess.run([git_cmd, "rev-parse", "origin/main"], cwd=repo_dir, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        
        local = local_res.stdout.strip()
        remote = remote_res.stdout.strip()
        
        if not local or not remote:
            return {"status": "error", "output": f"❌ 获取版本号失败。请确保当前分支是 main，且网络通畅。\nLocal: {local[:7]}\nRemote: {remote[:7]}"}

        if local == remote and not force:
            return {"status": "up-to-date", "output": f"🎉 已是最新版本！无需更新。\n当前版本: {local[:7]}"}

        if not force:
            return {"status": "pending", "output": f"🔍 发现新版本！\n当前版本: {local[:7]}\n最新版本: {remote[:7]}\n\n请点击「确认更新」下载并安装最新代码。"}

        # 6. 执行更新
        process = subprocess.run(
            [git_cmd, "pull", "origin", "main"],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore'
        )
        output = process.stdout + "\n" + process.stderr
        print(output)
        return {"status": "ok", "output": f"✅ 更新完成！\n{output}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/system/restart")
async def system_restart():
    """执行 fast_update.bat 脚本"""
    import sys as _sys
    try:
        from backend.config import runtime_root
        if getattr(_sys, "frozen", False):
            repo_dir = runtime_root()
        else:
            repo_dir = PROJECT_DIR
            
        bat_path = repo_dir / "fast_update.bat"
        if not bat_path.exists():
            raise HTTPException(status_code=404, detail=f"fast_update.bat not found at {bat_path}")
        
        print(f"[*] Restarting application via {bat_path}...")
        # 启动脚本，不阻塞当前进程
        subprocess.Popen([str(bat_path)], shell=True, cwd=str(repo_dir))
        return {"status": "ok", "message": "Restarting..."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/system/import-data")
async def import_data(payload: dict):
    """从源目录导入数据并覆盖当前数据。"""
    source_path_str = payload.get("source_path")
    if not source_path_str:
        raise HTTPException(status_code=400, detail="Missing source_path")
    
    source_path = Path(source_path_str).resolve()
    data_root = settings.data_root.resolve()
    
    # 1. 验证路径
    if not source_path.exists() or not source_path.is_dir():
        raise HTTPException(status_code=400, detail="Invalid source path")
    
    # 2. 检查源目录是否包含数据库文件
    if not (source_path / "second_brain.db").exists():
        raise HTTPException(status_code=400, detail="second_brain.db not found in source path")
    
    # 3. 检查源目录是否等于目标目录
    if source_path == data_root:
        raise HTTPException(status_code=400, detail="选择的导入目录与当前数据目录相同，无需导入")

    try:
        # 4. 关闭所有数据库连接以便文件操作
        engine.dispose()
        
        # 5. 复制数据
        print(f"[*] Importing data from {source_path} to {data_root}...")
        
        # 定义要复制的文件和目录
        items_to_copy = ["second_brain.db", "chroma_store", "uploads"]
        
        for item_name in items_to_copy:
            src_item = source_path / item_name
            dest_item = data_root / item_name
            
            if src_item.exists():
                if src_item.is_dir():
                    # 如果目标存在，先删除
                    if dest_item.exists():
                        shutil.rmtree(dest_item)
                    shutil.copytree(src_item, dest_item)
                else:
                    # 如果目标是文件且存在，直接复制会覆盖
                    shutil.copy2(src_item, dest_item)
                    
        return {"status": "ok", "message": "数据导入成功，请重启软件以加载新数据"}
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to import data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import data: {str(e)}")
