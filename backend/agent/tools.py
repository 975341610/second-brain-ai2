from __future__ import annotations

from sqlalchemy.orm import Session

from backend.models.schemas import TaskResponse
from backend.rag.pipeline import citations_from_results, search_knowledge
from backend.services.ai_client import AIClient
from backend.services.repositories import create_task, find_task_by_title, list_tasks


async def search_knowledge_tool(db: Session, ai_client: AIClient, query: str, excluded_note_ids: set[int] | None = None) -> list[dict]:
    results = await search_knowledge(query, ai_client=ai_client, top_k=5, excluded_note_ids=excluded_note_ids)
    return citations_from_results(db, results)


def create_task_tool(db: Session, task: str) -> TaskResponse:
    existing = find_task_by_title(db, task)
    if existing:
        return TaskResponse.model_validate(existing)
    created = create_task(db, task)
    return TaskResponse.model_validate(created)


def list_tasks_tool(db: Session) -> list[TaskResponse]:
    return [TaskResponse.model_validate(item) for item in list_tasks(db)]
