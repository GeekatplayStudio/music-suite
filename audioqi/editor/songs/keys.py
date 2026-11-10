"""API keys for the cloud song engines. Write-only from the browser.

A key comes from an environment variable or from ``<data>/secrets/song_keys.json``
(owner-only permissions where the OS supports them). The API reports only whether
a key is configured and where it came from; the key itself is never returned.
"""

from __future__ import annotations

import contextlib
import json
import os
import threading
from pathlib import Path
from typing import Any
from uuid import uuid4

from audioqi.editor import projects
from audioqi.editor.projects import ParamError

PROVIDERS: dict[str, str] = {
    "elevenlabs": "MUSIC_SUITE_ELEVENLABS_API_KEY",
    "fal": "MUSIC_SUITE_FAL_KEY",
}
MIN_KEY_CHARS = 16
MAX_KEY_CHARS = 256
_LOCK = threading.Lock()


def _file() -> Path:
    return projects.SETTINGS.data_dir.resolve() / "secrets" / "song_keys.json"


def _stored() -> dict[str, str]:
    payload = projects.read_json_safe(_file()) or {}
    return {k: v for k, v in payload.items() if k in PROVIDERS and isinstance(v, str)}


def _require_provider(provider: str) -> str:
    if provider not in PROVIDERS:
        raise ParamError(f"Unknown provider. Supported: {', '.join(PROVIDERS)}.")
    return provider


def get(provider: str) -> str | None:
    _require_provider(provider)
    from_env = os.getenv(PROVIDERS[provider], "").strip()
    if from_env:
        return from_env
    return _stored().get(provider) or None


def summary() -> dict[str, Any]:
    stored = _stored()
    out: dict[str, Any] = {}
    for provider, env in PROVIDERS.items():
        if os.getenv(env, "").strip():
            out[provider] = {"configured": True, "source": "environment", "env": env}
        elif stored.get(provider):
            out[provider] = {"configured": True, "source": "saved", "env": env}
        else:
            out[provider] = {"configured": False, "source": None, "env": env}
    return out


def clean_key(value: Any) -> str:
    if not isinstance(value, str):
        raise ParamError("'key' must be a string.")
    key = value.strip()
    if key.lower().startswith(("bearer ", "key ")):
        key = key.split(" ", 1)[1].strip()
    key = key.strip("'\"")
    if not MIN_KEY_CHARS <= len(key) <= MAX_KEY_CHARS:
        raise ParamError(f"An API key is {MIN_KEY_CHARS}-{MAX_KEY_CHARS} characters long.")
    if any(ch.isspace() or not ch.isprintable() for ch in key):
        raise ParamError("An API key cannot contain spaces or control characters.")
    return key


def _write(payload: dict[str, str]) -> None:
    path = _file()
    path.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.suppress(OSError):
        os.chmod(path.parent, 0o700)
    tmp = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    os.replace(tmp, path)


def save(provider: str, value: Any) -> dict[str, Any]:
    _require_provider(provider)
    key = clean_key(value)
    with _LOCK:
        stored = _stored()
        stored[provider] = key
        _write(stored)
    return summary()


def remove(provider: str) -> dict[str, Any]:
    _require_provider(provider)
    with _LOCK:
        stored = _stored()
        if stored.pop(provider, None) is not None:
            _write(stored)
    return summary()
