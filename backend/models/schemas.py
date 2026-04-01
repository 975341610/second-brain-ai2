from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class NoteBase(BaseModel):
    title: str = "Untitled"
    content: str
    icon: str = "📝"
    note_type: str = "note"
    template_id: int | None = None
    is_private: bool = False
    journal_date: str | None = None
    period_type: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None


class NoteCreate(NoteBase):
    notebook_id: int | None = None
    parent_id: int | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    icon: str | None = None
    note_type: str | None = None
    template_id: int | None = None
    is_private: bool | None = None
    journal_date: str | None = None
    period_type: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None


class NoteMovePayload(BaseModel):
    notebook_id: int | None = None
    position: int = 0
    parent_id: int | None = None


class BulkNoteAction(BaseModel):
    note_ids: list[int]
    notebook_id: int | None = None
    position: int = 0
    parent_id: int | None = None


class NoteResponse(NoteBase):
    id: int
    summary: str
    tags: list[str]
    links: list[int]
    notebook_id: int | None = None
    position: int = 0
    created_at: datetime
    deleted_at: datetime | None = None
    parent_id: int | None = None
    path: str = ""
    revision: str = ""
    children_count: int = 0
    is_folder: bool = False
    private_unlocked: bool = True

    class Config:
        from_attributes = True


class NoteTemplateBase(BaseModel):
    name: str
    description: str = ""
    icon: str = "📝"
    note_type: str = "note"
    default_title: str = "未命名笔记"
    default_content: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class NoteTemplateCreate(NoteTemplateBase):
    pass


class NoteTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    note_type: str | None = None
    default_title: str | None = None
    default_content: str | None = None
    metadata: dict[str, Any] | None = None


class NoteTemplateResponse(NoteTemplateBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CreateNoteFromTemplatePayload(BaseModel):
    title: str | None = None
    notebook_id: int | None = None
    parent_id: int | None = None
    is_private: bool | None = None
    journal_date: str | None = None
    period_type: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None


class JournalNoteCreatePayload(BaseModel):
    period_type: Literal["daily", "weekly", "monthly"]
    notebook_id: int | None = None
    parent_id: int | None = None
    is_private: bool = False


class TimelineItem(BaseModel):
    id: str
    item_type: Literal["task", "note"]
    title: str
    icon: str = ""
    timestamp: datetime
    end_at: datetime | None = None
    note_id: int | None = None
    task_id: int | None = None
    status: str | None = None
    note_type: str | None = None
    is_private: bool = False


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


class WorkspaceSettingsPayload(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


class WorkspaceSettingsResponse(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


class AppInfoResponse(BaseModel):
    name: str
    version: str
    repository: str
    api_prefix: str
    runtime_root: str
    workspace_path: str
    update_staging_path: str
    plugin_packages_path: str
    theme_assets_path: str


class PluginManifestResponse(BaseModel):
    id: str
    name: str
    version: str
    description: str = ""
    author: str = ""
    kind: str = "declarative"
    capabilities: list[str] = Field(default_factory=list)
    manifest_path: str
    enabled: bool = False


class PrivateVaultPassphrasePayload(BaseModel):
    passphrase: str = Field(min_length=4)


class PrivateVaultStatusResponse(BaseModel):
    configured: bool
    unlocked: bool


class UpdateStatePayload(BaseModel):
    channel: str | None = None
    current_version: str | None = None
    staged_version: str | None = None
    package_path: str | None = None
    package_kind: str | None = None
    manifest: dict[str, Any] | None = None
    status: str | None = None
    last_error: str | None = None


class UpdateAvailabilityResponse(BaseModel):
    current_version: str
    latest_version: str
    update_available: bool
    release_url: str = ""
    manifest_url: str = ""
    published_at: str = ""
    release_name: str = ""
    release_notes: str = ""
    packages: list[dict[str, Any]] = Field(default_factory=list)


class ApplyUpdateResponse(BaseModel):
    status: str
    detail: str
    update_state: UpdateStateResponse


class UpdateStateResponse(BaseModel):
    channel: str
    current_version: str
    staged_version: str | None = None
    package_path: str | None = None
    package_kind: str | None = None
    manifest: dict[str, Any] = Field(default_factory=dict)
    status: str
    last_error: str = ""
    updated_at: datetime


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
