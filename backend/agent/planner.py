from __future__ import annotations

from sqlalchemy.orm import Session

from backend.agent.tools import create_task_tool, list_tasks_tool, search_knowledge_tool
from backend.models.schemas import AgentResponse
from backend.services.ai_client import AIClient
from backend.services.repositories import get_or_create_model_config


async def run_agent(db: Session, goal: str, ai_client: AIClient) -> AgentResponse:
    evidence = await search_knowledge_tool(db, ai_client, goal)
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
        f"I searched your knowledge base, created {len(created)} tasks, and aligned the plan with your stored notes. "
        f"You now have {len(existing)} tasks in the system."
    )
    return AgentResponse(answer=answer, tasks_created=created, evidence=evidence)
