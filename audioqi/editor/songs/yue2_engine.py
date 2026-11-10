"""YuE2 run locally in its own Python environment, in a separate process.

YuE2 needs Python 3.12, CUDA and about 24 GB of VRAM, and its weights are
licensed CC BY-NC 4.0 (no commercial use). It is therefore opt-in twice: the
operator points ``MUSIC_SUITE_YUE2_PYTHON`` at the interpreter of a YuE2 install,
and every request must acknowledge the non-commercial licence.

This module is deliberately not named ``yue2.py``: the worker script lives in
the same folder, and that name would shadow the real ``yue2`` package.

The worker runs as a child process so a GPU crash or out-of-memory error cannot
take the API down, and it is killed if it exceeds the job time limit.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from audioqi.editor import projects
from audioqi.editor.projects import EditorError
from audioqi.editor.songs.common import (
    AUDIO_SUFFIXES,
    INSTRUMENTAL_TAG,
    ProducedAudio,
    SongRequest,
    check_size,
    describe,
)

ENGINE = "yue2"
PYTHON_ENV = "MUSIC_SUITE_YUE2_PYTHON"
DEVICE_ENV = "MUSIC_SUITE_YUE2_DEVICE"
DEFAULT_MODEL = "m-a-p/YuE2-3B"
WORKER = Path(__file__).with_name("yue2_worker.py")
LICENSE = "CC BY-NC 4.0 — personal and research use only, not for monetised releases"
_PROBE_TTL_SECONDS = 60.0
_probe_lock = threading.Lock()
_probe: dict[str, Any] = {"at": 0.0, "python": None, "ok": False}


def interpreter() -> Path | None:
    raw = os.getenv(PYTHON_ENV, "").strip()
    if not raw:
        return None
    path = Path(raw).expanduser()
    return path if path.is_file() else None


def _importable(python: Path) -> bool:
    """Whether ``import yue2`` works in that interpreter; cached for a minute."""
    with _probe_lock:
        fresh = time.monotonic() - _probe["at"] < _PROBE_TTL_SECONDS
        if fresh and _probe["python"] == str(python):
            return bool(_probe["ok"])
    try:
        done = subprocess.run(
            [str(python), "-I", "-c", "import yue2"],
            capture_output=True,
            timeout=60,
            check=False,
        )
        ok = done.returncode == 0
    except (OSError, subprocess.SubprocessError):
        ok = False
    with _probe_lock:
        _probe.update(at=time.monotonic(), python=str(python), ok=ok)
    return ok


def status() -> dict[str, Any]:
    python = interpreter()
    available = bool(python and _importable(python))
    if available:
        hint = "Installed. Non-commercial licence: acknowledge it to generate."
    elif python:
        hint = f"The interpreter in {PYTHON_ENV} cannot import yue2. Install YuE2 into it."
    else:
        hint = (
            "Not set up. Install YuE2 (Python 3.12, NVIDIA GPU with 24 GB) and set "
            f"{PYTHON_ENV} to that environment's python."
        )
    return {
        "id": ENGINE,
        "label": "YuE2 (local, non-commercial)",
        "local": True,
        "available": available,
        "models": [DEFAULT_MODEL],
        "default_model": DEFAULT_MODEL,
        "license": LICENSE,
        "commercial": False,
        "supports": {"lyrics": True, "duration": False, "bpm": True, "key": True, "seed": True},
        "max_seconds": 360,
        "hint": hint,
    }


def worker_request(request: SongRequest) -> dict[str, Any]:
    return {
        "style": describe(request),
        "lyrics": request.lyrics.strip() if request.sings else INSTRUMENTAL_TAG,
        "cot": "full",
        "seed": request.seed,
        "device": os.getenv(DEVICE_ENV, "cuda"),
        "model": request.model or DEFAULT_MODEL,
    }


def _find_audio(folder: Path) -> Path | None:
    preferred = folder / "audio.flac"
    if preferred.is_file():
        return preferred
    found = sorted(
        (p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_SUFFIXES),
        key=lambda p: p.stat().st_size,
        reverse=True,
    )
    return found[0] if found else None


def generate(request: SongRequest, progress: Callable[[float, str], None]) -> ProducedAudio:
    python = interpreter()
    if python is None or not _importable(python):
        raise EditorError(status()["hint"])
    limit = float(projects.SETTINGS.ffmpeg_timeout_seconds or 900) * 2
    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        work = Path(tmp)
        request_file = work / "request.json"
        request_file.write_text(json.dumps(worker_request(request)), encoding="utf-8")
        out = work / "out"
        log = work / "worker.log"
        progress(5.0, "Starting YuE2 (first run downloads the model).")
        with log.open("wb") as sink:
            child = subprocess.Popen(
                [str(python), "-I", str(WORKER), str(request_file), str(out)],
                stdout=sink,
                stderr=subprocess.STDOUT,
                cwd=str(work),
            )
            started = time.monotonic()
            while child.poll() is None:
                elapsed = time.monotonic() - started
                if elapsed > limit:
                    child.kill()
                    child.wait(timeout=30)
                    raise EditorError("YuE2 took too long and was stopped.")
                progress(8.0 + 80.0 * (1.0 - 1.0 / (1.0 + elapsed / 90.0)), "Writing the song.")
                time.sleep(2.0)
        if child.returncode != 0:
            tail = log.read_text(encoding="utf-8", errors="replace").strip().splitlines()[-1:]
            reason = tail[0][:200] if tail else f"exit code {child.returncode}"
            if "out of memory" in reason.lower():
                reason = "the GPU ran out of memory"
            raise EditorError(f"YuE2 failed: {reason}")
        audio = _find_audio(out) if out.is_dir() else None
        if audio is None:
            raise EditorError("YuE2 finished but wrote no audio file.")
        summary_file = out / "music_suite_summary.json"
        summary = projects.read_json_safe(summary_file) if summary_file.is_file() else None
        content = check_size(audio.read_bytes())
        return ProducedAudio(
            content=content,
            suffix=audio.suffix.lower(),
            engine=ENGINE,
            model=request.model or DEFAULT_MODEL,
            info={
                "truncated": bool((summary or {}).get("truncated")),
                "license": LICENSE,
            },
        )
