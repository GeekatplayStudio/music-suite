"""Which project assets an online service already holds, so editing them needs no upload.

Kept per project in ``<project>/remote_songs.json`` as ``asset_id -> {provider, song_id}``.
The ids are the provider's own references to stored songs; they are not secrets, but they
only mean something to the account that made them.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from audioqi.editor import projects

_LOCK = threading.RLock()
MAX_SONG_ID_CHARS = 200


def _path(project_id: str) -> Path:
    return projects.require_project(project_id) / "remote_songs.json"


def get(project_id: str, asset_id: str | None, provider: str) -> str | None:
    if not asset_id:
        return None
    with _LOCK:
        stored = projects.read_json_safe(_path(project_id)) or {}
    entry = stored.get(asset_id)
    if isinstance(entry, dict) and entry.get("provider") == provider:
        song_id = entry.get("song_id")
        return song_id if isinstance(song_id, str) and song_id else None
    return None


def put(project_id: str, asset_id: str, provider: str, song_id: Any) -> None:
    if not isinstance(song_id, str) or not 0 < len(song_id) <= MAX_SONG_ID_CHARS:
        return
    if not song_id.replace("-", "").replace("_", "").isalnum():
        return
    with _LOCK:
        path = _path(project_id)
        stored = projects.read_json_safe(path) or {}
        stored[asset_id] = {"provider": provider, "song_id": song_id}
        projects.write_json_atomic(path, stored)
