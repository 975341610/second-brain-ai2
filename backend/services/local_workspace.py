from __future__ import annotations

import base64
import hashlib
import json
import re
import secrets
import shutil
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from backend.config import get_settings
from backend.services.offline_ai import generate_tags, summarize_text


DEFAULT_NOTEBOOK_NAME = "快速笔记"
DEFAULT_NOTEBOOK_ICON = "⚡"
NOTE_META_PREFIX = "<!-- second-brain-meta\n"
NOTE_META_SUFFIX = "\n-->\n"
INDEX_FILE_NAME = "index.md"
PRIVATE_PLACEHOLDER_TITLE = "私密笔记"
PRIVATE_PLACEHOLDER_ICON = "🔒"
PRIVATE_VERIFIER = "second-brain-private-vault"


@dataclass
class NotebookRecord:
    id: int
    name: str
    icon: str
    created_at: datetime
    deleted_at: datetime | None = None


@dataclass
class NoteRecord:
    id: int
    title: str
    icon: str
    content: str
    summary: str
    tags: list[str]
    links: list[int]
    notebook_id: int | None
    position: int
    created_at: datetime
    deleted_at: datetime | None = None
    parent_id: int | None = None
    path: str = ""
    revision: str = ""
    is_draft: bool = False
    children_count: int = 0
    is_folder: bool = False
    note_type: str = "note"
    template_id: int | None = None
    is_private: bool = False
    journal_date: str | None = None
    period_type: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    private_unlocked: bool = True


class LocalWorkspaceStore:
    def __init__(self) -> None:
        settings = get_settings()
        self.root = Path(settings.workspace_path)
        self.trash_dir = self.root / ".trash"
        self.meta_dir = self.root / ".meta"
        self.state_file = self.meta_dir / "state.json"
        self.vault_state_file = self.meta_dir / "private_vault.json"
        self.root.mkdir(parents=True, exist_ok=True)
        self.trash_dir.mkdir(parents=True, exist_ok=True)
        self.meta_dir.mkdir(parents=True, exist_ok=True)
        if not self.state_file.exists():
            self._write_state({"next_notebook_id": 1, "next_note_id": 1, "notebooks": [], "notes": []})
        if not self.vault_state_file.exists():
            self._write_vault_state({"configured": False, "salt": "", "verifier": ""})
        self._private_key: bytes | None = None
        self._private_unlocked = False
        self._ensure_default_notebook()

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _iso(self, value: datetime | None) -> str | None:
        return value.astimezone(timezone.utc).isoformat() if value else None

    def _parse_datetime(self, value: str | None) -> datetime | None:
        if not value:
            return None
        return datetime.fromisoformat(value)

    def _read_state(self) -> dict[str, Any]:
        return json.loads(self.state_file.read_text(encoding="utf-8"))

    def _write_state(self, state: dict[str, Any]) -> None:
        self.state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    def _read_vault_state(self) -> dict[str, Any]:
        return json.loads(self.vault_state_file.read_text(encoding="utf-8"))

    def _write_vault_state(self, state: dict[str, Any]) -> None:
        self.vault_state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    def _derive_key(self, passphrase: str, salt: bytes) -> bytes:
        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=390000)
        return base64.urlsafe_b64encode(kdf.derive(passphrase.encode("utf-8")))

    def _require_private_access(self) -> None:
        if not self._private_unlocked or not self._private_key:
            raise ValueError("Private vault is locked")

    def _encrypt_content(self, content: str) -> str:
        self._require_private_access()
        return Fernet(self._private_key).encrypt(content.encode("utf-8")).decode("utf-8")

    def _decrypt_content(self, payload: str) -> str:
        self._require_private_access()
        return Fernet(self._private_key).decrypt(payload.encode("utf-8")).decode("utf-8")

    def private_vault_status(self) -> dict[str, bool]:
        state = self._read_vault_state()
        return {"configured": bool(state.get("configured")), "unlocked": self._private_unlocked}

    def configure_private_vault(self, passphrase: str) -> dict[str, bool]:
        state = self._read_vault_state()
        if state.get("configured"):
            return self.unlock_private_vault(passphrase)
        salt = secrets.token_bytes(16)
        key = self._derive_key(passphrase, salt)
        verifier = Fernet(key).encrypt(PRIVATE_VERIFIER.encode("utf-8")).decode("utf-8")
        self._write_vault_state({
            "configured": True,
            "salt": base64.b64encode(salt).decode("utf-8"),
            "verifier": verifier,
        })
        self._private_key = key
        self._private_unlocked = True
        return self.private_vault_status()

    def unlock_private_vault(self, passphrase: str) -> dict[str, bool]:
        state = self._read_vault_state()
        if not state.get("configured"):
            return self.configure_private_vault(passphrase)
        salt = base64.b64decode(state.get("salt", ""))
        key = self._derive_key(passphrase, salt)
        try:
            payload = Fernet(key).decrypt(state.get("verifier", "").encode("utf-8")).decode("utf-8")
        except InvalidToken as error:
            raise ValueError("Invalid private vault passphrase") from error
        if payload != PRIVATE_VERIFIER:
            raise ValueError("Invalid private vault passphrase")
        self._private_key = key
        self._private_unlocked = True
        return self.private_vault_status()

    def lock_private_vault(self) -> dict[str, bool]:
        self._private_key = None
        self._private_unlocked = False
        return self.private_vault_status()

    def _slugify(self, text: str) -> str:
        base = re.sub(r"[^\w\u4e00-\u9fa5-]+", "-", text.strip().lower()).strip("-")
        return base or "untitled"

    def _note_dir(self, notebook_name: str, segments: list[str]) -> Path:
        return self.root / notebook_name / Path(*segments)

    def _note_file(self, notebook_name: str, segments: list[str]) -> Path:
        return self._note_dir(notebook_name, segments) / INDEX_FILE_NAME

    def _load_meta(self, text: str) -> tuple[dict[str, Any], str]:
        if text.startswith(NOTE_META_PREFIX):
            end = text.find(NOTE_META_SUFFIX, len(NOTE_META_PREFIX))
            if end != -1:
                raw = text[len(NOTE_META_PREFIX):end]
                try:
                    meta = json.loads(raw)
                except json.JSONDecodeError:
                    meta = {}
                body = text[end + len(NOTE_META_SUFFIX):]
                return meta, body
        return {}, text

    def _dump_meta(self, meta: dict[str, Any], content: str) -> str:
        return f"{NOTE_META_PREFIX}{json.dumps(meta, ensure_ascii=False, indent=2)}{NOTE_META_SUFFIX}{content}"

    def _load_note_content(self, file_path: Path) -> tuple[dict[str, Any], str]:
        if not file_path.exists():
            return {}, ""
        meta, content = self._load_meta(file_path.read_text(encoding="utf-8"))
        if meta.get("content_encrypted"):
            if not self._private_unlocked:
                return meta, ""
            try:
                return meta, self._decrypt_content(content)
            except (InvalidToken, ValueError):
                return meta, ""
        return meta, content

    def _write_note_content(self, file_path: Path, meta: dict[str, Any], content: str) -> None:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        if meta.get("is_private"):
            meta = {**meta, "content_encrypted": True}
            payload = self._encrypt_content(content)
            file_path.write_text(self._dump_meta(meta, payload), encoding="utf-8")
            return
        meta = {**meta, "content_encrypted": False}
        file_path.write_text(self._dump_meta(meta, content), encoding="utf-8")

    def _file_revision(self, file_path: Path) -> str:
        if not file_path.exists():
            return ""
        payload = file_path.read_bytes()
        return hashlib.sha1(payload).hexdigest()

    def _folder_children_count(self, notebook_name: str, segments: list[str]) -> int:
        note_dir = self._note_dir(notebook_name, segments)
        if not note_dir.exists():
            return 0
        count = 0
        for child in note_dir.iterdir():
            if child.name.startswith("."):
                continue
            if child.is_dir() and (child / INDEX_FILE_NAME).exists():
                count += 1
        return count

    def _note_sort_key(self, note: dict[str, Any]) -> tuple[int, str, int]:
        path = note.get("path", "")
        depth = path.count("/")
        parent = note.get("parent_id") or 0
        return (depth, f"{parent}:{path}", note.get("id", 0))

    def _notebook_record(self, notebook: dict[str, Any]) -> NotebookRecord:
        return NotebookRecord(
            id=notebook["id"],
            name=notebook["name"],
            icon=notebook.get("icon") or "📒",
            created_at=self._parse_datetime(notebook.get("created_at")) or self._now(),
            deleted_at=self._parse_datetime(notebook.get("deleted_at")),
        )

    def _all_note_titles(self, state: dict[str, Any]) -> dict[int, str]:
        titles: dict[int, str] = {}
        for note in state["notes"]:
            notebook = next((item for item in state["notebooks"] if item["id"] == note.get("notebook_id")), None)
            notebook_name = notebook["name"] if notebook else DEFAULT_NOTEBOOK_NAME
            segments = [segment for segment in str(note.get("path") or "").split("/") if segment]
            meta, _content = self._load_note_content(self._note_file(notebook_name, segments))
            if meta.get("is_private") or note.get("is_private"):
                continue
            titles[note["id"]] = meta.get("title") or note.get("title") or (segments[-1] if segments else "未命名笔记")
        return titles

    def _extract_links(self, state: dict[str, Any], note_id: int, content: str) -> list[int]:
        titles = {title: item_id for item_id, title in self._all_note_titles(state).items() if item_id != note_id}
        links: list[int] = []
        for match in re.findall(r"\[\[([^\]]+)\]\]", content):
            target = titles.get(match.strip())
            if target and target not in links:
                links.append(target)
        return links[:8]

    def _note_record(self, state: dict[str, Any], note: dict[str, Any]) -> NoteRecord:
        notebook = next((item for item in state["notebooks"] if item["id"] == note.get("notebook_id")), None)
        notebook_name = notebook["name"] if notebook else DEFAULT_NOTEBOOK_NAME
        segments = [segment for segment in str(note.get("path", "")).split("/") if segment]
        file_path = self._note_file(notebook_name, segments)
        meta, content = self._load_note_content(file_path)
        is_private = bool(meta.get("is_private") or note.get("is_private"))
        private_unlocked = not is_private or self._private_unlocked
        note_type = str(meta.get("note_type") or note.get("note_type") or "note")
        template_id = meta.get("template_id") if meta.get("template_id") is not None else note.get("template_id")
        journal_date = meta.get("journal_date") or note.get("journal_date")
        period_type = meta.get("period_type") or note.get("period_type")
        start_at = self._parse_datetime(meta.get("start_at") or note.get("start_at"))
        end_at = self._parse_datetime(meta.get("end_at") or note.get("end_at"))
        if private_unlocked:
            if meta.get("title"):
                title = meta["title"]
            elif note.get("title"):
                title = str(note["title"])
            elif segments:
                title = segments[-1]
            else:
                title = "未命名笔记"
            icon = meta.get("icon") or note.get("icon") or "📝"
        else:
            title = PRIVATE_PLACEHOLDER_TITLE
            icon = PRIVATE_PLACEHOLDER_ICON
            content = ""
        summary = ""
        tags: list[str] = []
        links: list[int] = []
        if content.strip() and not is_private:
            summary = summarize_text(content)
            tags = generate_tags(content)
            links = self._extract_links(state, note["id"], content)
        return NoteRecord(
            id=note["id"],
            title=title,
            icon=icon,
            content=content,
            summary=summary,
            tags=tags,
            links=links,
            notebook_id=note.get("notebook_id"),
            position=note.get("position", 0),
            created_at=self._parse_datetime(note.get("created_at")) or self._now(),
            deleted_at=self._parse_datetime(note.get("deleted_at")),
            parent_id=note.get("parent_id"),
            path=str(note.get("path") or "") if private_unlocked else "",
            revision=self._file_revision(file_path),
            children_count=self._folder_children_count(notebook_name, segments),
            is_folder=True,
            note_type=note_type,
            template_id=template_id,
            is_private=is_private,
            journal_date=journal_date,
            period_type=period_type,
            start_at=start_at,
            end_at=end_at,
            private_unlocked=private_unlocked,
        )

    def _journal_period_label(self, period_type: str, journal_day: date) -> str:
        if period_type == "daily":
            return journal_day.strftime("%Y-%m-%d")
        if period_type == "weekly":
            week_start = journal_day - timedelta(days=journal_day.weekday())
            week_end = week_start + timedelta(days=6)
            return f"{week_start.strftime('%Y-%m-%d')} ~ {week_end.strftime('%Y-%m-%d')}"
        if period_type == "monthly":
            return journal_day.strftime("%Y-%m")
        raise ValueError("Unsupported journal period")

    def _journal_title(self, period_type: str, journal_day: date) -> str:
        labels = {
            "daily": "每日笔记",
            "weekly": "每周复盘",
            "monthly": "每月总结",
        }
        return f"{labels[period_type]} · {self._journal_period_label(period_type, journal_day)}"

    def _journal_anchor_date(self, period_type: str, target_at: datetime | None = None) -> date:
        current = (target_at or self._now()).astimezone(timezone.utc).date()
        if period_type == "daily":
            return current
        if period_type == "weekly":
            return current - timedelta(days=current.weekday())
        if period_type == "monthly":
            return current.replace(day=1)
        raise ValueError("Unsupported journal period")

    def find_journal_note(
        self,
        period_type: str,
        notebook_id: int | None = None,
        parent_id: int | None = None,
        is_private: bool = False,
        target_at: datetime | None = None,
    ) -> dict[str, Any] | None:
        journal_date = self._journal_anchor_date(period_type, target_at).isoformat()
        for note in self.list_notes(include_deleted=False):
            if note.get("note_type") != "bullet_journal":
                continue
            if note.get("period_type") != period_type:
                continue
            if note.get("journal_date") != journal_date:
                continue
            if (note.get("notebook_id") or None) != (notebook_id or None):
                continue
            if (note.get("parent_id") or None) != (parent_id or None):
                continue
            if bool(note.get("is_private")) != is_private:
                continue
            return note
        return None

    def create_or_get_journal_note(
        self,
        period_type: str,
        notebook_id: int | None = None,
        parent_id: int | None = None,
        is_private: bool = False,
        target_at: datetime | None = None,
    ) -> tuple[dict[str, Any], bool]:
        existing = self.find_journal_note(period_type, notebook_id, parent_id, is_private, target_at)
        if existing:
            return existing, False
        journal_day = self._journal_anchor_date(period_type, target_at)
        content = (
            "<h1>{title}</h1>"
            "<p>记录今天的重点、迁移项和复盘。</p>"
            "<ul>"
            "<li data-bullet-kind=\"task\" data-bullet-state=\"open\">待办：</li>"
            "<li data-bullet-kind=\"note\" data-bullet-state=\"open\">笔记：</li>"
            "<li data-bullet-kind=\"event\" data-bullet-state=\"open\">事件：</li>"
            "</ul>"
        ).format(title=self._journal_title(period_type, journal_day))
        created = self.create_note(
            title=self._journal_title(period_type, journal_day),
            content=content,
            notebook_id=notebook_id,
            parent_id=parent_id,
            icon="📓",
            note_type="bullet_journal",
            is_private=is_private,
            journal_date=journal_day.isoformat(),
            period_type=period_type,
        )
        return created, True

    def _ensure_default_notebook(self) -> None:
        state = self._read_state()
        existing = next((item for item in state["notebooks"] if item["name"] == DEFAULT_NOTEBOOK_NAME), None)
        if existing:
            if existing.get("deleted_at"):
                existing["deleted_at"] = None
                self._write_state(state)
            (self.root / DEFAULT_NOTEBOOK_NAME).mkdir(parents=True, exist_ok=True)
            return
        now = self._iso(self._now())
        notebook = {
            "id": state["next_notebook_id"],
            "name": DEFAULT_NOTEBOOK_NAME,
            "icon": DEFAULT_NOTEBOOK_ICON,
            "created_at": now,
            "deleted_at": None,
        }
        state["next_notebook_id"] += 1
        state["notebooks"].append(notebook)
        self._write_state(state)
        (self.root / DEFAULT_NOTEBOOK_NAME).mkdir(parents=True, exist_ok=True)

    def list_notebooks(self, include_deleted: bool = False) -> list[dict[str, Any]]:
        state = self._read_state()
        items = [self._notebook_record(item) for item in state["notebooks"] if include_deleted or not item.get("deleted_at")]
        items.sort(key=lambda item: (item.created_at, item.id))
        return [self.notebook_to_dict(item) for item in items]

    def list_notes(self, include_deleted: bool = False, raw_state: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        state = raw_state or self._read_state()
        items = [
            self._note_record(state, item)
            for item in sorted(state["notes"], key=self._note_sort_key)
            if include_deleted or not item.get("deleted_at")
        ]
        return [self.note_to_dict(item) for item in items]

    def get_trash(self) -> dict[str, Any]:
        notes = self.list_notes(include_deleted=True)
        notebooks = self.list_notebooks(include_deleted=True)
        return {
            "notes": [note for note in notes if note.get("deleted_at")],
            "notebooks": [item for item in notebooks if item.get("deleted_at")],
        }

    def create_notebook(self, name: str, icon: str = "📒") -> dict[str, Any]:
        state = self._read_state()
        trimmed = name.strip()
        if not trimmed:
            raise ValueError("Notebook name is required")
        if any(item["name"] == trimmed and not item.get("deleted_at") for item in state["notebooks"]):
            raise ValueError("Notebook already exists")
        now = self._iso(self._now())
        notebook = {"id": state["next_notebook_id"], "name": trimmed, "icon": icon, "created_at": now, "deleted_at": None}
        state["next_notebook_id"] += 1
        state["notebooks"].append(notebook)
        self._write_state(state)
        (self.root / trimmed).mkdir(parents=True, exist_ok=True)
        return self.notebook_to_dict(self._notebook_record(notebook))

    def update_notebook(self, notebook_id: int, name: str | None = None, icon: str | None = None) -> dict[str, Any] | None:
        state = self._read_state()
        notebook = next((item for item in state["notebooks"] if item["id"] == notebook_id), None)
        if not notebook:
            return None
        old_name = notebook["name"]
        if name is not None:
            trimmed = name.strip()
            if not trimmed:
                raise ValueError("Notebook name is required")
            if trimmed != old_name and any(item["name"] == trimmed and not item.get("deleted_at") for item in state["notebooks"]):
                raise ValueError("Notebook already exists")
            old_path = self.root / old_name
            new_path = self.root / trimmed
            if old_path.exists():
                old_path.rename(new_path)
            else:
                new_path.mkdir(parents=True, exist_ok=True)
            notebook["name"] = trimmed
        if icon is not None:
            notebook["icon"] = icon
        self._write_state(state)
        return self.notebook_to_dict(self._notebook_record(notebook))

    def create_note(
        self,
        title: str,
        content: str,
        notebook_id: int | None = None,
        icon: str = "📝",
        parent_id: int | None = None,
        note_type: str = "note",
        template_id: int | None = None,
        is_private: bool = False,
        journal_date: str | None = None,
        period_type: str | None = None,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
    ) -> dict[str, Any]:
        state = self._read_state()
        target_notebook_id = notebook_id or next((item["id"] for item in state["notebooks"] if item["name"] == DEFAULT_NOTEBOOK_NAME and not item.get("deleted_at")), None)
        notebook = next((item for item in state["notebooks"] if item["id"] == target_notebook_id and not item.get("deleted_at")), None)
        if not notebook:
            raise ValueError("Notebook not found")
        parent = next((item for item in state["notes"] if item["id"] == parent_id and not item.get("deleted_at")), None) if parent_id else None
        if parent and parent.get("notebook_id") != target_notebook_id:
            raise ValueError("Parent note must stay in the same notebook")
        if is_private:
            self._require_private_access()
        parent_path = str(parent.get("path") or "") if parent else ""
        slug_base = self._slugify(title)
        slug = slug_base
        sibling_paths = {item.get("path") for item in state["notes"] if item.get("notebook_id") == target_notebook_id and item.get("parent_id") == parent_id and not item.get("deleted_at")}
        index = 2
        full_path = "/".join(filter(None, [parent_path, slug]))
        while full_path in sibling_paths:
            slug = f"{slug_base}-{index}"
            index += 1
            full_path = "/".join(filter(None, [parent_path, slug]))
        now = self._iso(self._now())
        note = {
            "id": state["next_note_id"],
            "title": title.strip() or "未命名笔记",
            "icon": icon,
            "notebook_id": target_notebook_id,
            "parent_id": parent_id,
            "path": full_path,
            "created_at": now,
            "deleted_at": None,
            "position": len([item for item in state["notes"] if item.get("notebook_id") == target_notebook_id and item.get("parent_id") == parent_id and not item.get("deleted_at")]) + 1,
            "note_type": note_type,
            "template_id": template_id,
            "is_private": is_private,
            "journal_date": journal_date,
            "period_type": period_type,
            "start_at": self._iso(start_at),
            "end_at": self._iso(end_at),
        }
        state["next_note_id"] += 1
        state["notes"].append(note)
        self._write_state(state)
        file_path = self._note_file(notebook["name"], [segment for segment in full_path.split("/") if segment])
        self._write_note_content(
            file_path,
            {
                "id": note["id"],
                "title": note["title"],
                "icon": icon,
                "parent_id": parent_id,
                "note_type": note_type,
                "template_id": template_id,
                "is_private": is_private,
                "journal_date": journal_date,
                "period_type": period_type,
                "start_at": self._iso(start_at),
                "end_at": self._iso(end_at),
            },
            content,
        )
        return self.note_to_dict(self._note_record(state, note))

    def update_note(
        self,
        note_id: int,
        title: str | None = None,
        content: str | None = None,
        icon: str | None = None,
        note_type: str | None = None,
        template_id: int | None = None,
        is_private: bool | None = None,
        journal_date: str | None = None,
        period_type: str | None = None,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
    ) -> dict[str, Any] | None:
        state = self._read_state()
        note = next((item for item in state["notes"] if item["id"] == note_id), None)
        if not note or note.get("deleted_at"):
            return None
        notebook = next((item for item in state["notebooks"] if item["id"] == note.get("notebook_id")), None)
        if not notebook:
            return None
        old_segments = [segment for segment in str(note.get("path") or "").split("/") if segment]
        old_path = self._note_dir(notebook["name"], old_segments)
        meta, existing_content = self._load_note_content(old_path / INDEX_FILE_NAME)
        current_private = bool(meta.get("is_private") or note.get("is_private"))
        next_private = current_private if is_private is None else is_private
        if next_private:
            self._require_private_access()
        next_title = (title.strip() if title is not None else meta.get("title") or note.get("title") or "未命名笔记") or "未命名笔记"
        next_icon = icon if icon is not None else meta.get("icon") or note.get("icon") or "📝"
        next_content = content if content is not None else existing_content
        next_note_type = note_type if note_type is not None else meta.get("note_type") or note.get("note_type") or "note"
        next_template_id = template_id if template_id is not None else meta.get("template_id") if meta.get("template_id") is not None else note.get("template_id")
        next_journal_date = journal_date if journal_date is not None else meta.get("journal_date") or note.get("journal_date")
        next_period_type = period_type if period_type is not None else meta.get("period_type") or note.get("period_type")
        next_start_at = self._iso(start_at) if start_at is not None else (meta.get("start_at") or note.get("start_at"))
        next_end_at = self._iso(end_at) if end_at is not None else (meta.get("end_at") or note.get("end_at"))
        if title is not None:
            parent_path = "/".join(old_segments[:-1])
            parent_id = note.get("parent_id")
            sibling_paths = {item.get("path") for item in state["notes"] if item["id"] != note_id and item.get("notebook_id") == note.get("notebook_id") and item.get("parent_id") == parent_id and not item.get("deleted_at")}
            slug_base = self._slugify(next_title)
            slug = slug_base
            new_relative = "/".join(filter(None, [parent_path, slug]))
            index = 2
            while new_relative in sibling_paths:
                slug = f"{slug_base}-{index}"
                index += 1
                new_relative = "/".join(filter(None, [parent_path, slug]))
            if new_relative != note.get("path"):
                new_dir = self._note_dir(notebook["name"], [segment for segment in new_relative.split("/") if segment])
                new_dir.parent.mkdir(parents=True, exist_ok=True)
                if old_path.exists():
                    old_path.rename(new_dir)
                note["path"] = new_relative
                prefix_old = f"{'/'.join(old_segments)}/"
                prefix_new = f"{new_relative}/"
                for item in state["notes"]:
                    path = str(item.get("path") or "")
                    if item["id"] != note_id and path.startswith(prefix_old):
                        item["path"] = prefix_new + path[len(prefix_old):]
        note["title"] = next_title
        note["icon"] = next_icon
        note["note_type"] = next_note_type
        note["template_id"] = next_template_id
        note["is_private"] = next_private
        note["journal_date"] = next_journal_date
        note["period_type"] = next_period_type
        note["start_at"] = next_start_at
        note["end_at"] = next_end_at
        new_segments = [segment for segment in str(note.get("path") or "").split("/") if segment]
        file_path = self._note_file(notebook["name"], new_segments)
        self._write_note_content(
            file_path,
            {
                "id": note["id"],
                "title": next_title,
                "icon": next_icon,
                "parent_id": note.get("parent_id"),
                "note_type": next_note_type,
                "template_id": next_template_id,
                "is_private": next_private,
                "journal_date": next_journal_date,
                "period_type": next_period_type,
                "start_at": next_start_at,
                "end_at": next_end_at,
            },
            next_content,
        )
        self._write_state(state)
        return self.note_to_dict(self._note_record(state, note))

    def move_note(self, note_id: int, notebook_id: int | None, position: int = 0, parent_id: int | None = None) -> dict[str, Any] | None:
        state = self._read_state()
        note = next((item for item in state["notes"] if item["id"] == note_id and not item.get("deleted_at")), None)
        target_notebook = next((item for item in state["notebooks"] if item["id"] == (notebook_id or note.get("notebook_id")) and not item.get("deleted_at")), None) if note else None
        if not note or not target_notebook:
            return None
        source_notebook = next((item for item in state["notebooks"] if item["id"] == note.get("notebook_id")), None)
        if not source_notebook:
            return None
        if parent_id == note_id:
            raise ValueError("Cannot move a note into itself")
        descendant_ids = {item["id"] for item in state["notes"] if str(item.get("path") or "").startswith(f"{note.get('path')}/")}
        if parent_id in descendant_ids:
            raise ValueError("Cannot move a parent note into its child")
        target_parent = next((item for item in state["notes"] if item["id"] == parent_id and not item.get("deleted_at")), None) if parent_id else None
        if target_parent and target_parent.get("notebook_id") != target_notebook["id"]:
            raise ValueError("Parent note must stay in the same notebook")
        parent_path = str(target_parent.get("path") or "") if target_parent else ""
        slug_base = self._slugify(note.get("title") or "untitled")
        slug = slug_base
        sibling_paths = {item.get("path") for item in state["notes"] if item["id"] != note_id and item.get("notebook_id") == target_notebook["id"] and item.get("parent_id") == parent_id and not item.get("deleted_at")}
        new_relative = "/".join(filter(None, [parent_path, slug]))
        index = 2
        while new_relative in sibling_paths:
            slug = f"{slug_base}-{index}"
            index += 1
            new_relative = "/".join(filter(None, [parent_path, slug]))
        old_relative = str(note.get("path") or "")
        old_dir = self._note_dir(source_notebook["name"], [segment for segment in old_relative.split("/") if segment])
        new_dir = self._note_dir(target_notebook["name"], [segment for segment in new_relative.split("/") if segment])
        new_dir.parent.mkdir(parents=True, exist_ok=True)
        if old_dir.exists():
            old_dir.rename(new_dir)
        note["notebook_id"] = target_notebook["id"]
        note["parent_id"] = parent_id
        note["path"] = new_relative
        prefix_old = f"{old_relative}/"
        prefix_new = f"{new_relative}/"
        for item in state["notes"]:
            path = str(item.get("path") or "")
            if item["id"] != note_id and path.startswith(prefix_old):
                item["path"] = prefix_new + path[len(prefix_old):]
                item["notebook_id"] = target_notebook["id"]
        siblings = [item for item in state["notes"] if item.get("notebook_id") == target_notebook["id"] and item.get("parent_id") == parent_id and not item.get("deleted_at")]
        siblings.sort(key=lambda item: item.get("position", 0))
        siblings = [item for item in siblings if item["id"] != note_id]
        insert_at = max(0, min(position, len(siblings)))
        siblings.insert(insert_at, note)
        for sibling_index, item in enumerate(siblings, start=1):
            item["position"] = sibling_index
        self._write_state(state)
        return self.note_to_dict(self._note_record(state, note))

    def soft_delete_note(self, note_id: int) -> dict[str, Any] | None:
        state = self._read_state()
        note = next((item for item in state["notes"] if item["id"] == note_id and not item.get("deleted_at")), None)
        if not note:
            return None
        notebook = next((item for item in state["notebooks"] if item["id"] == note.get("notebook_id")), None)
        if not notebook:
            return None
        now = self._iso(self._now())
        affected = [item for item in state["notes"] if str(item.get("path") or "") == str(note.get("path") or "") or str(item.get("path") or "").startswith(f"{note.get('path')}/")]
        for item in affected:
            item["deleted_at"] = now
        source_dir = self._note_dir(notebook["name"], [segment for segment in str(note.get("path") or "").split("/") if segment])
        if source_dir.exists():
            trash_target = self.trash_dir / f"note-{note_id}-{uuid.uuid4().hex[:8]}"
            shutil.move(str(source_dir), trash_target)
        self._write_state(state)
        return self.note_to_dict(self._note_record(state, note))

    def bulk_soft_delete_notes(self, note_ids: list[int]) -> list[dict[str, Any]]:
        deleted: list[dict[str, Any]] = []
        for note_id in note_ids:
            note = self.soft_delete_note(note_id)
            if note:
                deleted.append(note)
        return deleted

    def restore_note(self, note_id: int) -> dict[str, Any] | None:
        state = self._read_state()
        note = next((item for item in state["notes"] if item["id"] == note_id and item.get("deleted_at")), None)
        if not note:
            return None
        notebook = next((item for item in state["notebooks"] if item["id"] == note.get("notebook_id")), None)
        if not notebook:
            return None
        prefix = str(note.get("path") or "")
        affected = [item for item in state["notes"] if str(item.get("path") or "") == prefix or str(item.get("path") or "").startswith(f"{prefix}/")]
        siblings = {item.get("path") for item in state["notes"] if item["id"] != note_id and item.get("notebook_id") == note.get("notebook_id") and item.get("parent_id") == note.get("parent_id") and not item.get("deleted_at")}
        if prefix in siblings:
            slug_base = prefix.split("/")[-1]
            next_path = prefix
            index = 2
            while next_path in siblings:
                next_path = "/".join(filter(None, ["/".join(prefix.split("/")[:-1]), f"{slug_base}-{index}"]))
                index += 1
            old_prefix = prefix
            note["path"] = next_path
            for item in affected:
                if item["id"] != note_id:
                    path = str(item.get("path") or "")
                    item["path"] = f"{next_path}/{path[len(old_prefix) + 1:]}"
            prefix = next_path
        for item in affected:
            item["deleted_at"] = None
        trash_candidates = sorted(self.trash_dir.glob(f"note-{note_id}-*"), key=lambda path: path.stat().st_mtime, reverse=True)
        if trash_candidates:
            target_dir = self._note_dir(notebook["name"], [segment for segment in prefix.split("/") if segment])
            target_dir.parent.mkdir(parents=True, exist_ok=True)
            if target_dir.exists():
                shutil.rmtree(target_dir)
            shutil.move(str(trash_candidates[0]), target_dir)
        self._write_state(state)
        return self.note_to_dict(self._note_record(state, note))

    def purge_note(self, note_id: int) -> bool:
        state = self._read_state()
        note = next((item for item in state["notes"] if item["id"] == note_id), None)
        if not note:
            return False
        prefix = str(note.get("path") or "")
        state["notes"] = [item for item in state["notes"] if not (str(item.get("path") or "") == prefix or str(item.get("path") or "").startswith(f"{prefix}/"))]
        for trash_path in self.trash_dir.glob(f"note-{note_id}-*"):
            if trash_path.is_dir():
                shutil.rmtree(trash_path, ignore_errors=True)
            else:
                trash_path.unlink(missing_ok=True)
        self._write_state(state)
        return True

    def soft_delete_notebook(self, notebook_id: int) -> dict[str, Any] | None:
        state = self._read_state()
        notebook = next((item for item in state["notebooks"] if item["id"] == notebook_id and not item.get("deleted_at")), None)
        if not notebook or notebook["name"] == DEFAULT_NOTEBOOK_NAME:
            return None
        now = self._iso(self._now())
        notebook["deleted_at"] = now
        for note in state["notes"]:
            if note.get("notebook_id") == notebook_id:
                note["deleted_at"] = now
        source_dir = self.root / notebook["name"]
        if source_dir.exists():
            shutil.move(str(source_dir), self.trash_dir / f"notebook-{notebook_id}-{uuid.uuid4().hex[:8]}")
        self._write_state(state)
        return self.notebook_to_dict(self._notebook_record(notebook))

    def restore_notebook(self, notebook_id: int) -> dict[str, Any] | None:
        state = self._read_state()
        notebook = next((item for item in state["notebooks"] if item["id"] == notebook_id and item.get("deleted_at")), None)
        if not notebook:
            return None
        notebook["deleted_at"] = None
        for note in state["notes"]:
            if note.get("notebook_id") == notebook_id:
                note["deleted_at"] = None
        target_dir = self.root / notebook["name"]
        if target_dir.exists():
            target_dir = self.root / f"{notebook['name']}-restored"
            notebook["name"] = target_dir.name
        trash_candidates = sorted(self.trash_dir.glob(f"notebook-{notebook_id}-*"), key=lambda path: path.stat().st_mtime, reverse=True)
        if trash_candidates:
            shutil.move(str(trash_candidates[0]), target_dir)
        else:
            target_dir.mkdir(parents=True, exist_ok=True)
        self._write_state(state)
        return self.notebook_to_dict(self._notebook_record(notebook))

    def purge_notebook(self, notebook_id: int) -> bool:
        state = self._read_state()
        notebook = next((item for item in state["notebooks"] if item["id"] == notebook_id), None)
        if not notebook or notebook["name"] == DEFAULT_NOTEBOOK_NAME:
            return False
        state["notebooks"] = [item for item in state["notebooks"] if item["id"] != notebook_id]
        state["notes"] = [item for item in state["notes"] if item.get("notebook_id") != notebook_id]
        for trash_path in self.trash_dir.glob(f"notebook-{notebook_id}-*"):
            if trash_path.is_dir():
                shutil.rmtree(trash_path, ignore_errors=True)
            else:
                trash_path.unlink(missing_ok=True)
        self._write_state(state)
        return True

    def notebook_to_dict(self, notebook: NotebookRecord) -> dict[str, Any]:
        return {
            "id": notebook.id,
            "name": notebook.name,
            "icon": notebook.icon,
            "created_at": self._iso(notebook.created_at),
            "deleted_at": self._iso(notebook.deleted_at),
        }

    def note_to_dict(self, note: NoteRecord) -> dict[str, Any]:
        return {
            "id": note.id,
            "title": note.title,
            "icon": note.icon,
            "content": note.content,
            "summary": note.summary,
            "tags": note.tags,
            "links": note.links,
            "notebook_id": note.notebook_id,
            "position": note.position,
            "created_at": self._iso(note.created_at),
            "deleted_at": self._iso(note.deleted_at),
            "is_draft": note.is_draft,
            "parent_id": note.parent_id,
            "path": note.path,
            "revision": note.revision,
            "children_count": note.children_count,
            "is_folder": note.is_folder,
            "note_type": note.note_type,
            "template_id": note.template_id,
            "is_private": note.is_private,
            "journal_date": note.journal_date,
            "period_type": note.period_type,
            "start_at": self._iso(note.start_at),
            "end_at": self._iso(note.end_at),
            "private_unlocked": note.private_unlocked,
        }


workspace_store = LocalWorkspaceStore()
