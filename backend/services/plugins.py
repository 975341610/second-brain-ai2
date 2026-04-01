from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.config import get_settings


MANIFEST_NAMES = ("plugin.json", "manifest.json")


def _read_manifest(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _plugin_record(manifest_path: Path, data: dict[str, Any], enabled_ids: set[str]) -> dict[str, Any] | None:
    plugin_id = str(data.get("id") or manifest_path.parent.name if manifest_path.parent != manifest_path.parent.parent else manifest_path.stem).strip()
    if not plugin_id:
        return None
    name = str(data.get("name") or plugin_id).strip() or plugin_id
    capabilities = data.get("capabilities") if isinstance(data.get("capabilities"), list) else []
    return {
        "id": plugin_id,
        "name": name,
        "version": str(data.get("version") or "0.1.0").strip() or "0.1.0",
        "description": str(data.get("description") or "").strip(),
        "author": str(data.get("author") or "").strip(),
        "kind": str(data.get("kind") or "declarative").strip() or "declarative",
        "capabilities": [str(item).strip() for item in capabilities if str(item).strip()],
        "manifest_path": manifest_path.as_posix(),
        "enabled": plugin_id in enabled_ids,
      }


def list_plugins(enabled_ids: list[str] | None = None) -> list[dict[str, Any]]:
    settings = get_settings()
    plugin_root = Path(settings.plugin_packages_path)
    enabled = {item for item in (enabled_ids or []) if item}
    discovered: list[dict[str, Any]] = []
    seen: set[str] = set()

    for manifest_name in MANIFEST_NAMES:
        for manifest_path in sorted(plugin_root.glob(f"*/{manifest_name}")):
            data = _read_manifest(manifest_path)
            if not data:
                continue
            record = _plugin_record(manifest_path, data, enabled)
            if not record or record["id"] in seen:
                continue
            seen.add(record["id"])
            discovered.append(record)

    for manifest_path in sorted(plugin_root.glob("*.json")):
        data = _read_manifest(manifest_path)
        if not data:
            continue
        record = _plugin_record(manifest_path, data, enabled)
        if not record or record["id"] in seen:
            continue
        seen.add(record["id"])
        discovered.append(record)

    return sorted(discovered, key=lambda item: item["name"].lower())
