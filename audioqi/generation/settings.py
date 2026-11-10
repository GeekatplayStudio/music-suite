"""Non-secret generation settings, kept in ``data/generation/settings.json``."""

from __future__ import annotations

import contextlib
import os
import threading
from pathlib import Path
from typing import Any

from audioqi.editor import projects
from audioqi.editor.projects import ParamError

_LOCK = threading.RLock()

DEFAULTS: dict[str, Any] = {
    # Empty means "the folder the installer builds into" (data/engines/acestep.cpp).
    "engine_dir": "",
    "idle_minutes": 10,
    "min_free_percent": 25,
    "writer_model": "gemma4:12b",
    "normalize": True,
    "target_lufs": -14.0,
    # Online services stay off until the user saves a key for them.
    "providers": {
        "acestep_local": True,
        "comfyui_musicgen": True,
        # Opt-in: these need software or hardware most machines do not have.
        "acestep_server": False,
        "yue2": False,
        "elevenlabs": False,
        "fal": False,
        "lyria": False,
    },
    "setup_declined": False,
    "editing_declined": False,
    # New songs use the XL model when it has been downloaded.
    "use_quality_model": True,
}
_RANGES: dict[str, tuple[float, float]] = {
    "idle_minutes": (1, 240),
    "min_free_percent": (5, 80),
    "target_lufs": (-30.0, -6.0),
}


def root() -> Path:
    path = projects.SETTINGS.data_dir / "generation"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _path() -> Path:
    return root() / "settings.json"


def load() -> dict[str, Any]:
    with _LOCK:
        stored = projects.read_json_safe(_path()) or {}
    merged = {**DEFAULTS, **{k: v for k, v in stored.items() if k in DEFAULTS}}
    merged["providers"] = {**DEFAULTS["providers"], **(stored.get("providers") or {})}
    return merged


def default_engine_dir() -> Path:
    return projects.SETTINGS.data_dir / "engines" / "acestep.cpp"


def engine_dir() -> Path:
    raw = os.getenv("MUSIC_SUITE_ACESTEP_DIR") or str(load().get("engine_dir") or "")
    return Path(raw).expanduser().resolve() if raw.strip() else default_engine_dir()


def _clean(key: str, value: Any) -> Any:
    if key in _RANGES:
        low, high = _RANGES[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ParamError(f"'{key}' must be a number.")
        if not low <= value <= high:
            raise ParamError(f"'{key}' must be between {low:g} and {high:g}.")
        return int(value) if key != "target_lufs" else float(value)
    if key in ("normalize", "setup_declined", "editing_declined", "use_quality_model"):
        if not isinstance(value, bool):
            raise ParamError(f"'{key}' must be true or false.")
        return value
    if key == "writer_model":
        ok = isinstance(value, str) and 0 < len(value) <= 80 and value.isprintable()
        if not ok or any(ch.isspace() for ch in value):
            raise ParamError("'writer_model' must be an Ollama model name.")
        return value
    if key == "engine_dir":
        if not isinstance(value, str) or len(value) > 1024 or not value.isprintable():
            raise ParamError("'engine_dir' must be a folder path.")
        value = value.strip()
        if value and not Path(value).expanduser().is_absolute():
            raise ParamError("'engine_dir' must be an absolute path.")
        return value
    if key == "providers":
        if not isinstance(value, dict) or any(
            not isinstance(k, str) or not isinstance(v, bool) for k, v in value.items()
        ):
            raise ParamError("'providers' must map provider ids to true or false.")
        unknown = set(value) - set(DEFAULTS["providers"])
        if unknown:
            raise ParamError("Unknown provider.")
        return value
    raise ParamError("Unknown setting.")


def update(patch: Any) -> dict[str, Any]:
    if not isinstance(patch, dict):
        raise ParamError("Settings must be an object.")
    cleaned = {key: _clean(key, value) for key, value in patch.items()}
    with _LOCK:
        current = load()
        if "providers" in cleaned:
            cleaned["providers"] = {**current["providers"], **cleaned["providers"]}
        current.update(cleaned)
        path = _path()
        projects.write_json_atomic(path, current)
        with contextlib.suppress(OSError):
            path.chmod(0o600)
    return current
