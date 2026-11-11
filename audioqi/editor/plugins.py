"""VST3 / Audio Unit hosting through Pedalboard.

Plugins are discovered by filename only, in the standard system folders, and are
never loaded while listing: some plugins take the host process down when loaded.
A plugin is loaded only when a job uses it, and then in a separate worker process
so a crash cannot reach the API. Clients refer to plugins by an opaque id; no
filesystem path is ever accepted from, or returned to, the client.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from audioqi.editor import engines, projects
from audioqi.editor.projects import EditorError

PLUGIN_ID_RE = re.compile(r"^[0-9a-f]{20}$")
UNAVAILABLE_MESSAGE = (
    "Plugin hosting unavailable: install the optional 'editor' extra (Pedalboard) to host "
    "VST3 / Audio Unit plugins."
)
_CACHE_SECONDS = 300.0
_MAX_PLUGINS = 2000
_LOCK = threading.Lock()
_cache: dict[str, dict[str, Any]] | None = None
_cache_time = 0.0
_parameters: dict[str, list[dict[str, Any]]] = {}
#: Whether each plugin used so far turned out to be an instrument.
_instruments: dict[str, bool] = {}
#: Open plugin windows: key -> the folder where the app leaves commands for the worker.
_windows: dict[str, Path] = {}
WINDOW_COMMANDS = ("close", "play", "stop")
#: How long a plugin's own window may stay open before the worker gives up.
EDITOR_TIMEOUT_SECONDS = 3600
MAX_STATE_BYTES = 16 * 1024 * 1024
MAX_STATE_TEXT = MAX_STATE_BYTES * 4 // 3 + 4


def plugin_dirs() -> list[tuple[Path, str, str]]:
    """Standard plugin folders as ``(directory, glob, format)``."""
    if sys.platform == "darwin":
        home = Path.home() / "Library" / "Audio" / "Plug-Ins"
        system = Path("/Library/Audio/Plug-Ins")
        return [
            (system / "VST3", "*.vst3", "vst3"),
            (home / "VST3", "*.vst3", "vst3"),
            (system / "Components", "*.component", "au"),
            (home / "Components", "*.component", "au"),
        ]
    if sys.platform == "win32":
        dirs = []
        common = os.environ.get("COMMONPROGRAMFILES")
        if common:
            dirs.append((Path(common) / "VST3", "*.vst3", "vst3"))
        local = os.environ.get("LOCALAPPDATA")
        if local:
            # Per-user VST3 folder, where the instrument installer puts plugins.
            dirs.append((Path(local) / "Programs" / "Common" / "VST3", "*.vst3", "vst3"))
        return dirs
    return []


def _scan() -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for directory, pattern, fmt in plugin_dirs():
        try:
            entries = sorted(directory.glob(pattern)) if directory.is_dir() else []
        except OSError:
            continue
        for entry in entries:
            if len(found) >= _MAX_PLUGINS:
                break
            try:
                resolved = entry.resolve()
            except OSError:
                continue
            plugin_id = hashlib.sha256(f"{fmt}:{resolved}".encode()).hexdigest()[:20]
            found[plugin_id] = {
                "id": plugin_id,
                "name": entry.stem,
                "format": fmt,
                "path": resolved,
            }
    return found


def _plugins(refresh: bool = False) -> dict[str, dict[str, Any]]:
    global _cache, _cache_time
    with _LOCK:
        if refresh or _cache is None or time.monotonic() - _cache_time > _CACHE_SECONDS:
            _cache = _scan()
            _cache_time = time.monotonic()
        return _cache


def reset_cache() -> None:
    global _cache
    with _LOCK:
        _cache = None
        _parameters.clear()
        _instruments.clear()


def list_plugins() -> dict[str, Any]:
    """Listing for the API. ``parameters`` is filled in once a plugin has been used."""
    if not engines.plugin_hosting_available():
        return {"available": False, "plugins": []}
    items = [
        {
            "id": item["id"],
            "name": item["name"],
            "format": item["format"],
            "parameters": _parameters.get(item["id"], []),
            "is_instrument": _instruments.get(item["id"]),
        }
        for item in _plugins().values()
    ]
    items.sort(key=lambda item: (item["name"].lower(), item["format"]))
    return {"available": True, "plugins": items}


def plugin_name(plugin_id: str) -> str | None:
    item = _plugins().get(plugin_id)
    return None if item is None else str(item["name"])


def _require(plugin_id: str) -> dict[str, Any]:
    if not engines.plugin_hosting_available():
        raise EditorError(UNAVAILABLE_MESSAGE)
    if not isinstance(plugin_id, str) or not PLUGIN_ID_RE.match(plugin_id):
        raise projects.NotFoundError("Plugin not found.")
    item = _plugins().get(plugin_id) or _plugins(refresh=True).get(plugin_id)
    if item is None:
        raise EditorError("Unknown plugin. Refresh the plugin list and try again.")
    return item


def describe_plugin(plugin_id: str, *, instrument: bool = False) -> dict[str, Any]:
    """Parameter list of one plugin, read by loading it in the isolated worker.

    By default the plugin must be an audio effect; with ``instrument`` it must be
    an instrument.
    """
    try:
        item = _require(plugin_id)
    except EditorError as exc:
        if isinstance(exc, projects.NotFoundError) or "Unknown plugin" not in str(exc):
            raise
        raise projects.NotFoundError("Plugin not found.") from exc
    summary = {"id": item["id"], "name": item["name"], "format": item["format"]}
    if plugin_id not in _parameters:
        with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
            request, report = Path(tmp) / "request.json", Path(tmp) / "report.json"
            request.write_text(json.dumps({"plugin": str(item["path"])}), encoding="utf-8")
            cmd = [sys.executable, "-m", "audioqi.editor.plugin_worker", str(request), str(report)]
            try:
                subprocess.run(
                    cmd,
                    capture_output=True,
                    check=False,
                    timeout=60,
                    cwd=str(projects.SETTINGS.project_root),
                )
            except subprocess.TimeoutExpired as exc:
                raise EditorError(f"Plugin '{item['name']}' took too long to load.") from exc
            outcome = projects.read_json_safe(report) or {}
        if not outcome.get("ok") or not isinstance(outcome.get("parameters"), list):
            raise EditorError(f"Plugin '{item['name']}' could not be loaded.")
        _parameters[plugin_id] = outcome["parameters"]
        _instruments[plugin_id] = bool(outcome.get("is_instrument"))
    is_instrument = _instruments.get(plugin_id, False)
    if is_instrument and not instrument:
        raise EditorError(f"'{item['name']}' is an instrument, not an audio effect.")
    if instrument and not is_instrument:
        raise EditorError(f"'{item['name']}' is an audio effect, not an instrument.")
    return {**summary, "parameters": _parameters[plugin_id], "is_instrument": is_instrument}


def _run_worker(
    item: dict[str, Any],
    request: dict[str, Any],
    timeout: float | None,
    *,
    audio_out: bool,
    audio_in: tuple[np.ndarray, int] | None = None,
    window_key: str | None = None,
) -> tuple[dict[str, Any], np.ndarray | None]:
    """Run one worker request; returns its report and, if asked, the audio it wrote."""
    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        src, dst = Path(tmp) / "in.wav", Path(tmp) / "out.wav"
        if audio_in is not None:
            sf.write(str(src), audio_in[0], audio_in[1], subtype="FLOAT")
        if window_key:
            control = Path(tmp) / "control"
            control.mkdir()
            request = {**request, "control_dir": str(control)}
            _windows[window_key] = control
        request_path, report = Path(tmp) / "request.json", Path(tmp) / "report.json"
        request_path.write_text(
            json.dumps({**request, "plugin": str(item["path"])}), encoding="utf-8"
        )
        cmd = [sys.executable, "-m", "audioqi.editor.plugin_worker"]
        cmd += [str(request_path), str(src), str(dst), str(report)]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                check=False,
                timeout=timeout,
                cwd=str(projects.SETTINGS.project_root),
            )
        except subprocess.TimeoutExpired as exc:
            raise EditorError(f"Plugin '{item['name']}' timed out.") from exc
        finally:
            if window_key:
                _windows.pop(window_key, None)
        outcome = projects.read_json_safe(report) or {}
        if proc.returncode != 0 or not outcome.get("ok") or (audio_out and not dst.is_file()):
            reason = outcome.get("error")
            if not isinstance(reason, str) or not reason:
                reason = "it crashed or could not be loaded"
            raise EditorError(f"Plugin '{item['name']}' failed: {reason}.")
        audio = sf.read(str(dst), dtype="float32", always_2d=True)[0] if audio_out else None
    return outcome, audio


def render_instrument(
    plugin_id: str,
    notes: list[dict[str, float]],
    seconds: float,
    sample_rate: int,
    state: str | None,
) -> tuple[np.ndarray, str]:
    """Play ``notes`` (``t``/``d`` seconds, ``p`` MIDI pitch, ``v`` 0..1) through an instrument."""
    item = _require(plugin_id)
    timeout = projects.SETTINGS.ffmpeg_timeout_seconds
    request = {
        "mode": "instrument",
        "notes": notes,
        "seconds": seconds,
        "sample_rate": sample_rate,
        "state": state,
    }
    _, audio = _run_worker(
        item, request, timeout if timeout and timeout > 0 else None, audio_out=True
    )
    _instruments[plugin_id] = True
    assert audio is not None
    return audio, str(item["name"])


def open_plugin_window(
    plugin_id: str,
    state: str | None,
    key: str | None = None,
    notes: list[dict[str, float]] | None = None,
    seconds: float | None = None,
    *,
    window: bool = True,
    play: bool = False,
) -> dict[str, Any]:
    """Show the plugin's own window; returns its sound once it is closed.

    With ``key``, :func:`window_command` can close the window from the app, or play
    and stop ``notes`` (a loop of ``seconds``) through the speakers while it is open.
    """
    item = _require(plugin_id)
    outcome, _ = _run_worker(
        item,
        {
            "mode": "editor",
            "state": state,
            "notes": notes or [],
            "seconds": seconds,
            "window": window,
            "play": play,
        },
        EDITOR_TIMEOUT_SECONDS,
        audio_out=False,
        window_key=key,
    )
    saved = outcome.get("state")
    if not isinstance(saved, str) or len(saved) > MAX_STATE_BYTES * 4 // 3 + 4:
        raise EditorError(f"Plugin '{item['name']}' returned no usable sound.")
    _instruments[plugin_id] = bool(outcome.get("is_instrument"))
    result = {"plugin": str(item["name"]), "state": saved, "is_instrument": _instruments[plugin_id]}
    if isinstance(outcome.get("preview"), str):
        result["preview"] = outcome["preview"][:80]
    return result


def apply_plugin(
    audio: np.ndarray, sample_rate: int, plugin_id: str, parameters: dict[str, float]
) -> tuple[np.ndarray, str]:
    """Run audio through one plugin in an isolated worker process."""
    item = _require(plugin_id)
    timeout = projects.SETTINGS.ffmpeg_timeout_seconds
    outcome, out = _run_worker(
        item,
        {"parameters": parameters},
        timeout if timeout and timeout > 0 else None,
        audio_out=True,
        audio_in=(audio, sample_rate),
    )
    assert out is not None
    described = outcome.get("parameters")
    if isinstance(described, list):
        _parameters[plugin_id] = described
    return out, str(item["name"])


def window_command(key: str, command: str) -> bool:
    """Pass ``close``, ``play`` or ``stop`` to an open plugin window. False if none is open."""
    control = _windows.get(key)
    if control is None or command not in WINDOW_COMMANDS:
        return False
    try:
        (control / command).touch()
    except OSError:
        return False
    return True


def load_sound_in_window(key: str, state: str) -> bool:
    """Switch an open plugin session to a saved sound (base64). False if none is open."""
    control = _windows.get(key)
    if control is None or len(state) > MAX_STATE_TEXT:
        return False
    try:
        staged = control / "load.part"
        staged.write_text(state, encoding="ascii")
        staged.replace(control / "load")  # Appears whole, never half written.
    except OSError:
        return False
    return True


def close_plugin_window(key: str) -> bool:
    """Ask an open plugin window to close and hand back its sound. False if none is open."""
    return window_command(key, "close")


# --------------------------------------------------------------------------- auditions
# Hearing an instrument outside any project (Synth Studio): one at a time, no window.

_audition: dict[str, Any] = {"key": None, "error": None}


def start_audition(
    plugin_id: str, state: str | None, notes: list[dict[str, float]], seconds: float
) -> str:
    """Loop ``notes`` through an instrument on the speakers; returns the audition's key."""
    _require(plugin_id)
    stop_audition()
    key = projects.new_id()
    _audition.update(key=key, error=None)

    def work() -> None:
        try:
            open_plugin_window(plugin_id, state, key, notes, seconds, window=False, play=True)
        except EditorError as exc:
            if _audition["key"] == key:
                _audition["error"] = str(exc)
        except Exception as exc:
            if _audition["key"] == key:
                _audition["error"] = f"Playing failed ({type(exc).__name__})."
        finally:
            if _audition["key"] == key:
                _audition["key"] = None

    threading.Thread(target=work, name="plugin-audition", daemon=True).start()
    return key


def audition_status(key: str) -> dict[str, Any]:
    running = _audition["key"] == key
    return {"id": key, "running": running, "error": None if running else _audition["error"]}


def stop_audition(key: str | None = None) -> None:
    """Stop the running audition (only if it is ``key``, when one is given)."""
    current = _audition["key"]
    if current is None or (key is not None and key != current):
        return
    # The worker may still be starting: keep asking until its control folder exists.
    for _ in range(50):
        if window_command(current, "close") or _audition["key"] != current:
            return
        time.sleep(0.1)
