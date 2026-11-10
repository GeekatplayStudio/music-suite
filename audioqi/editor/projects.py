"""Project storage for the editor: ``<data_dir>/editor/<project_id>/project.json``."""

from __future__ import annotations

import contextlib
import json
import os
import shutil
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from audioqi.config import get_settings
from audioqi.storage import write_json

SETTINGS = get_settings()
MAX_STATE_BYTES = 2 * 1024 * 1024
MAX_NAME_CHARS = 120
_LOCK = threading.RLock()


class EditorError(Exception):
    """An error whose message is safe to show to the user (no paths, no traces)."""

    status_code = 400

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        if status_code is not None:
            self.status_code = status_code


class NotFoundError(EditorError):
    status_code = 404


class ParamError(EditorError):
    status_code = 422


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def new_id() -> str:
    return str(uuid4())


def is_canonical_uuid(value: Any) -> bool:
    if not isinstance(value, str) or len(value) != 36:
        return False
    try:
        return str(UUID(value)) == value
    except ValueError:
        return False


def editor_root() -> Path:
    return SETTINGS.data_dir.resolve() / "editor"


def scratch_dir() -> Path:
    """Scratch space for engines that need files on disk; stays under the data root."""
    path = editor_root() / ".tmp"
    path.mkdir(parents=True, exist_ok=True)
    return path


def project_dir(project_id: str) -> Path:
    """Directory of a project. Rejects non-canonical IDs before touching the filesystem."""
    if not is_canonical_uuid(project_id):
        raise NotFoundError("Project not found.")
    root = editor_root()
    path = (root / project_id).resolve()
    if path.parent != root:
        raise NotFoundError("Project not found.")
    return path


def require_project(project_id: str) -> Path:
    path = project_dir(project_id)
    if not (path / "project.json").is_file():
        raise NotFoundError("Project not found.")
    return path


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    """Write JSON through a temp file so concurrent readers never see a partial file."""
    tmp = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    write_json(tmp, payload)
    for attempt in range(5):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:  # Windows: a reader briefly holds the target open.
            if attempt == 4:
                with contextlib.suppress(OSError):
                    tmp.unlink()
                raise
            time.sleep(0.02)


def write_bytes_atomic(path: Path, payload: bytes) -> None:
    tmp = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    tmp.write_bytes(payload)
    try:
        os.replace(tmp, path)
    except OSError:
        with contextlib.suppress(OSError):
            tmp.unlink()
        raise


def read_json_safe(path: Path) -> dict[str, Any] | None:
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def clean_name(value: Any, *, limit: int = MAX_NAME_CHARS) -> str:
    """Validate a display name: printable, trimmed, 1..limit characters."""
    if not isinstance(value, str):
        raise ParamError("Name must be a string.")
    cleaned = "".join(ch for ch in value if ch.isprintable()).strip()
    if not cleaned or len(cleaned) > limit:
        raise ParamError(f"Name must be 1-{limit} characters.")
    return cleaned


def _summary(record: dict[str, Any]) -> dict[str, Any]:
    return {key: record.get(key) for key in ("id", "name", "created_at", "updated_at")}


def _read_project(project_id: str) -> dict[str, Any]:
    record = read_json_safe(require_project(project_id) / "project.json")
    if record is None:
        raise NotFoundError("Project not found.")
    return record


def list_projects() -> list[dict[str, Any]]:
    root = editor_root()
    if not root.is_dir():
        return []
    found: list[dict[str, Any]] = []
    for child in root.iterdir():
        if not is_canonical_uuid(child.name):
            continue
        record = read_json_safe(child / "project.json")
        if record is not None and record.get("id") == child.name:
            found.append(_summary(record))
    found.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
    return found


def create_project(name: Any) -> dict[str, Any]:
    cleaned = clean_name(name)
    project_id = new_id()
    path = project_dir(project_id)
    for sub in ("assets", "jobs", "analysis"):
        (path / sub).mkdir(parents=True, exist_ok=True)
    stamp = now_iso()
    record = {
        "id": project_id,
        "name": cleaned,
        "created_at": stamp,
        "updated_at": stamp,
        "state": None,
    }
    with _LOCK:
        write_json_atomic(path / "project.json", record)
    return record


def get_project(project_id: str) -> dict[str, Any]:
    record = _read_project(project_id)
    state = record.get("state")
    return {**_summary(record), "state": state if isinstance(state, dict) else None}


def _update(project_id: str, **changes: Any) -> dict[str, Any]:
    with _LOCK:
        record = _read_project(project_id)
        record.update(changes)
        record["updated_at"] = now_iso()
        write_json_atomic(project_dir(project_id) / "project.json", record)
    return record


def save_state(project_id: str, state: Any) -> str:
    if not isinstance(state, dict):
        raise ParamError("Project state must be a JSON object.")
    size = len(json.dumps(state, separators=(",", ":")).encode("utf-8"))
    if size > MAX_STATE_BYTES:
        raise EditorError(f"Project state exceeds the {MAX_STATE_BYTES} byte limit.", 413)
    return str(_update(project_id, state=state)["updated_at"])


def rename_project(project_id: str, name: Any) -> dict[str, Any]:
    record = _update(project_id, name=clean_name(name))
    return {key: record[key] for key in ("id", "name", "updated_at")}


def touch_project(project_id: str) -> None:
    with contextlib.suppress(EditorError, OSError):
        _update(project_id)


def delete_project(project_id: str) -> None:
    path = require_project(project_id)
    with _LOCK:
        shutil.rmtree(path, ignore_errors=True)
