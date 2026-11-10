"""History of generations, so any result can be reproduced or varied later."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from audioqi.editor import projects
from audioqi.generation import settings

MAX_RECORDS = 200
_LOCK = threading.RLock()


def _path() -> Path:
    return settings.root() / "history.json"


def list_records() -> list[dict[str, Any]]:
    with _LOCK:
        stored = projects.read_json_safe(_path()) or {}
    items = stored.get("items")
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def add(record: dict[str, Any]) -> dict[str, Any]:
    entry = {"id": projects.new_id(), "created_at": projects.now_iso(), **record}
    with _LOCK:
        items = [entry, *list_records()][:MAX_RECORDS]
        projects.write_json_atomic(_path(), {"items": items})
    return entry


def remove(record_id: str) -> bool:
    with _LOCK:
        items = list_records()
        kept = [item for item in items if item.get("id") != record_id]
        if len(kept) == len(items):
            return False
        projects.write_json_atomic(_path(), {"items": kept})
    return True
