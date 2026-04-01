from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base
from backend.version import APP_VERSION


class Notebook(Base):
    __tablename__ = "notebooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    icon: Mapped[str] = mapped_column(String(500), default="📒")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    notes: Mapped[list["Note"]] = relationship(back_populates="notebook")


class NoteTemplate(Base):
    __tablename__ = "note_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(500), default="📝")
    note_type: Mapped[str] = mapped_column(String(50), default="note")
    default_title: Mapped[str] = mapped_column(String(255), default="未命名笔记")
    default_content: Mapped[str] = mapped_column(Text, default="")
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), default="Untitled")
    icon: Mapped[str] = mapped_column(String(500), default="📝")
    content: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String(500), default="")
    notebook_id: Mapped[int | None] = mapped_column(ForeignKey("notebooks.id", ondelete="SET NULL"), nullable=True, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    note_type: Mapped[str] = mapped_column(String(50), default="note")
    template_id: Mapped[int | None] = mapped_column(ForeignKey("note_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    journal_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    period_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    notebook: Mapped[Notebook | None] = relationship(back_populates="notes")

    links_from: Mapped[list["NoteLink"]] = relationship(
        back_populates="source", foreign_keys="NoteLink.source_note_id", cascade="all, delete-orphan"
    )
    links_to: Mapped[list["NoteLink"]] = relationship(
        back_populates="target", foreign_keys="NoteLink.target_note_id", cascade="all, delete-orphan"
    )


class NoteLink(Base):
    __tablename__ = "note_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    target_note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source: Mapped[Note] = relationship(back_populates="links_from", foreign_keys=[source_note_id])
    target: Mapped[Note] = relationship(back_populates="links_to", foreign_keys=[target_note_id])


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    status: Mapped[str] = mapped_column(String(20), default="todo")
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    task_type: Mapped[str] = mapped_column(String(50), default="work")
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    provider: Mapped[str] = mapped_column(String(50), default="openclaw")
    api_key: Mapped[str] = mapped_column(String(255), default="")
    base_url: Mapped[str] = mapped_column(String(255), default="")
    model_name: Mapped[str] = mapped_column(String(255), default="glm-4.7-flash")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UpdateState(Base):
    __tablename__ = "update_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    channel: Mapped[str] = mapped_column(String(20), default="stable")
    current_version: Mapped[str] = mapped_column(String(50), default=APP_VERSION)
    staged_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    package_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    package_kind: Mapped[str | None] = mapped_column(String(50), nullable=True)
    manifest_json: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(50), default="idle")
    last_error: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
