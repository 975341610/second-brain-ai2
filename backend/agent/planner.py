from __future__ import annotations

from sqlalchemy.orm import Session

from backend.agent.tools import create_task_tool, list_tasks_tool, search_knowledge_tool
from backend.models.schemas import AgentResponse
from backend.services.ai_client import AIClient
from backend.services.local_workspace import workspace_store
from backend.services.repositories import get_or_create_model_config


def private_note_ids() -> set[int]:
    return {note["id"] for note in workspace_store.list_notes(include_deleted=True) if note.get("is_private")}


async def run_agent(db: Session, goal: str, ai_client: AIClient) -> AgentResponse:
    evidence = await search_knowledge_tool(db, ai_client, goal, excluded_note_ids=private_note_ids())
    config = get_or_create_model_config(db)
    llm_config = {
        "provider": config.provider,
        "api_key": config.api_key,
        "base_url": config.base_url,
        "model_name": config.model_name,
    }
    todo_titles = await ai_client.plan(goal, evidence, llm_config)
    created = [create_task_tool(db, task) for task in todo_titles]
    existing = list_tasks_tool(db)
    answer = (
        f"我已经检索你的知识库，并基于现有笔记生成了 {len(created)} 条任务。"
        f" 当前系统里一共有 {len(existing)} 条任务可继续推进。"
    )
    return AgentResponse(answer=answer, tasks_created=created, evidence=evidence)
