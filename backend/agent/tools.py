from __future__ import annotations

from sqlalchemy.orm import Session

from backend.models.schemas import TaskResponse
from backend.rag.pipeline import citations_from_results, search_knowledge
from backend.services.ai_client import AIClient
from backend.services.repositories import create_task, list_tasks


async def search_knowledge_tool(db: Session, ai_client: AIClient, query: str) -> list[dict]:
    results = await search_knowledge(query, ai_client=ai_client, top_k=5)
    return citations_from_results(db, results)


def create_task_tool(db: Session, task: str) -> TaskResponse:
    created = create_task(db, task)
    return TaskResponse.model_validate(created)


def list_tasks_tool(db: Session) -> list[TaskResponse]:
    return [TaskResponse.model_validate(item) for item in list_tasks(db)]
