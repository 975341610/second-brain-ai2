import base64
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


def obfuscate(text: str) -> str:
    if not text:
        return ""
    return base64.b64encode(text.encode("utf-8")).decode("utf-8")


def deobfuscate(text: str) -> str:
    if not text:
        return ""
    try:
        return base64.b64decode(text.encode("utf-8")).decode("utf-8")
    except Exception:
        return text


class Notebook(Base):
    __tablename__ = "notebooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    icon: Mapped[str] = mapped_column(String(500), default="📒")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    notes: Mapped[list["Note"]] = relationship(back_populates="notebook")


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), default="Untitled")
    icon: Mapped[str] = mapped_column(String(500), default="📝")
    content: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String(500), default="")
    notebook_id: Mapped[int | None] = mapped_column(ForeignKey("notebooks.id", ondelete="SET NULL"), nullable=True, index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("notes.id", ondelete="SET NULL"), nullable=True, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_title_manually_edited: Mapped[bool] = mapped_column(Integer, default=0)  # 0 for false, 1 for true
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    notebook: Mapped[Notebook | None] = relationship(back_populates="notes")
    parent: Mapped["Note | None"] = relationship("Note", remote_side=[id], back_populates="children")
    children: Mapped[list["Note"]] = relationship("Note", back_populates="parent", cascade="all, delete-orphan")

    properties: Mapped[list["NoteProperty"]] = relationship(back_populates="note", cascade="all, delete-orphan")

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


class NoteProperty(Base):
    __tablename__ = "note_properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    type: Mapped[str] = mapped_column(String(50))  # text, number, date, select, multi_select
    value: Mapped[str] = mapped_column(Text)  # JSON string for complex values

    note: Mapped[Note] = relationship(back_populates="properties")


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


class UserStats(Base):
    __tablename__ = "user_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    exp: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=1)
    total_captures: Mapped[int] = mapped_column(Integer, default=0)
    current_theme: Mapped[str] = mapped_column(String(50), default="default")
    wallpaper_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(500))
    condition_type: Mapped[str] = mapped_column(String(50))  # e.g., "total_captures", "total_notes"
    condition_value: Mapped[int] = mapped_column(Integer)
    icon: Mapped[str] = mapped_column(String(500))  # SVG or Emoji
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    achievement_id: Mapped[int] = mapped_column(ForeignKey("achievements.id", ondelete="CASCADE"), index=True)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    achievement: Mapped[Achievement] = relationship()
