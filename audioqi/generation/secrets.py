"""API keys for online generation services. Write-only from the browser.

A key is looked up in this order: an environment variable, the operating system's
keychain (macOS Keychain, Windows Credential Manager, Secret Service), then an
owner-only file under ``<data>/secrets/`` for systems with no keychain. The API only
ever reports whether a key exists and where it came from, never the key.
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

SERVICE = "Music Suite"
PROVIDERS: dict[str, str] = {
    "elevenlabs": "MUSIC_SUITE_ELEVENLABS_API_KEY",
    "fal": "MUSIC_SUITE_FAL_KEY",
    "lyria": "MUSIC_SUITE_GEMINI_API_KEY",
}
MIN_KEY_CHARS = 16
MAX_KEY_CHARS = 256
_LOCK = threading.RLock()
# provider -> (key or None, source). Avoids asking the keychain on every status poll.
_CACHE: dict[str, tuple[str | None, str | None]] = {}


def _require(provider: str) -> str:
    if provider not in PROVIDERS:
        raise ParamError("This provider does not use an API key.")
    return provider


def _account(provider: str) -> str:
    return f"generation:{provider}"


def _keyring() -> Any | None:
    """The OS keychain, or None when this system has no usable one."""
    try:
        import keyring
        from keyring.backends import fail

        if isinstance(keyring.get_keyring(), fail.Keyring):
            return None
        return keyring
    except Exception:
        return None


def _file() -> Path:
    return projects.SETTINGS.data_dir.resolve() / "secrets" / "generation_keys.json"


def _file_keys() -> dict[str, str]:
    payload = projects.read_json_safe(_file()) or {}
    return {k: v for k, v in payload.items() if k in PROVIDERS and isinstance(v, str) and v}


def _write_file(payload: dict[str, str]) -> None:
    path = _file()
    if not payload:
        with contextlib.suppress(OSError):
            path.unlink(missing_ok=True)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.suppress(OSError):
        os.chmod(path.parent, 0o700)
    tmp = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    os.replace(tmp, path)


def _lookup(provider: str) -> tuple[str | None, str | None]:
    from_env = os.getenv(PROVIDERS[provider], "").strip()
    if from_env:
        return from_env, "environment"
    with _LOCK:
        if provider in _CACHE:
            return _CACHE[provider]
        found: tuple[str | None, str | None] = (None, None)
        keychain = _keyring()
        if keychain is not None:
            try:
                value = keychain.get_password(SERVICE, _account(provider))
            except Exception:
                value = None
            if value:
                found = (value, "keychain")
        if found[0] is None:
            stored = _file_keys().get(provider)
            if stored:
                found = (stored, "file")
        _CACHE[provider] = found
        return found


def get(provider: str) -> str | None:
    return _lookup(_require(provider))[0]


def summary(provider: str) -> dict[str, Any]:
    _, source = _lookup(_require(provider))
    return {"configured": source is not None, "source": source, "env": PROVIDERS[provider]}


def clean_key(value: Any) -> str:
    if not isinstance(value, str):
        raise ParamError("'key' must be text.")
    key = value.strip()
    if key.lower().startswith(("bearer ", "key ")):
        key = key.split(" ", 1)[1].strip()
    key = key.strip("'\"")
    if not MIN_KEY_CHARS <= len(key) <= MAX_KEY_CHARS:
        raise ParamError(f"An API key is {MIN_KEY_CHARS}-{MAX_KEY_CHARS} characters long.")
    if any(ch.isspace() or not ch.isprintable() for ch in key):
        raise ParamError("An API key cannot contain spaces or control characters.")
    return key


def save(provider: str, value: Any) -> dict[str, Any]:
    _require(provider)
    key = clean_key(value)
    with _LOCK:
        stored_in_keychain = False
        keychain = _keyring()
        if keychain is not None:
            try:
                keychain.set_password(SERVICE, _account(provider), key)
                stored_in_keychain = True
            except Exception:
                stored_in_keychain = False
        files = _file_keys()
        if stored_in_keychain:
            files.pop(provider, None)  # Never keep a second copy on disk.
        else:
            files[provider] = key
        _write_file(files)
        _CACHE.pop(provider, None)
    return summary(provider)


def remove(provider: str) -> dict[str, Any]:
    _require(provider)
    with _LOCK:
        keychain = _keyring()
        if keychain is not None:
            with contextlib.suppress(Exception):
                keychain.delete_password(SERVICE, _account(provider))
        files = _file_keys()
        if files.pop(provider, None) is not None:
            _write_file(files)
        _CACHE.pop(provider, None)
    return summary(provider)


def reset_cache() -> None:
    with _LOCK:
        _CACHE.clear()
