from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class NoteBase(BaseModel):
    title: str = "Untitled"
    content: str
    icon: str = "📝"


class NoteCreate(NoteBase):
    notebook_id: int | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    icon: str | None = None


class NoteMovePayload(BaseModel):
    notebook_id: int | None = None
    position: int = 0


class BulkNoteAction(BaseModel):
    note_ids: list[int]
    notebook_id: int | None = None
    position: int = 0


class NoteResponse(NoteBase):
    id: int
    summary: str
    tags: list[str]
    links: list[int]
    notebook_id: int | None = None
    position: int = 0
    created_at: datetime
    deleted_at: datetime | None = None

    class Config:
        from_attributes = True


class TaskBase(BaseModel):
    title: str
    status: Literal["todo", "doing", "done"] = "todo"
    priority: Literal["low", "medium", "high"] = "medium"
    task_type: Literal["meeting", "work", "travel", "errand", "study", "personal"] = "work"
    deadline: datetime | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = None
    status: Literal["todo", "doing", "done"] | None = None
    priority: Literal["low", "medium", "high"] | None = None
    task_type: Literal["meeting", "work", "travel", "errand", "study", "personal"] | None = None
    deadline: datetime | None = None


class TaskResponse(TaskBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=10)


class AskRequest(BaseModel):
    question: str
    mode: Literal["chat", "rag", "agent"] = "rag"


class Citation(BaseModel):
    note_id: int | None = None
    title: str
    chunk_id: str
    score: float
    excerpt: str


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation] = []
    mode: str


class AgentRequest(BaseModel):
    goal: str


class AgentResponse(BaseModel):
    answer: str
    tasks_created: list[TaskResponse]
    evidence: list[Citation]


class ModelConfigPayload(BaseModel):
    provider: str = "openclaw"
    api_key: str = ""
    base_url: str = ""
    model_name: str = "glm-4.7-flash"


class UploadResponse(BaseModel):
    imported_notes: list[NoteResponse]


class NotebookCreate(BaseModel):
    name: str
    icon: str = "📒"


class NotebookUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None


class NotebookResponse(BaseModel):
    id: int
    name: str
    icon: str
    created_at: datetime
    deleted_at: datetime | None = None

    class Config:
        from_attributes = True


class TrashResponse(BaseModel):
    notes: list[NoteResponse]
    notebooks: list[NotebookResponse]
