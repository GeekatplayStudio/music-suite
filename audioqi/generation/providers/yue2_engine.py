"""YuE2 run locally in its own Python environment, in a separate process.

Ported from the ``feature/song-generation`` branch. YuE2 needs a CUDA GPU with about
24 GB of memory, and its weights are licensed CC BY-NC 4.0 (no commercial use). So it
is off by default, needs ``MUSIC_SUITE_YUE2_PYTHON`` pointing at a YuE2 install, and
every request must confirm the non-commercial licence.

This module is deliberately not named ``yue2.py``: the worker script lives in the same
folder, and that name would shadow the real ``yue2`` package when the worker runs.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from audioqi.editor import projects
from audioqi.editor.projects import EditorError
from audioqi.generation import settings
from audioqi.generation.providers.acestep import INSTRUMENTAL, KEYS, SECTIONS
from audioqi.generation.providers.base import Output, RunContext
from audioqi.generation.providers.cloud import describe as describe_style
from audioqi.generation.schema import field

PYTHON_ENV = "MUSIC_SUITE_YUE2_PYTHON"
DEVICE_ENV = "MUSIC_SUITE_YUE2_DEVICE"
DEFAULT_MODEL = "m-a-p/YuE2-3B"
WORKER = Path(__file__).with_name("yue2_worker.py")
LICENSE = "CC BY-NC 4.0: personal and research use only, not for releases that earn money"
AUDIO_SUFFIXES = {".flac", ".wav", ".mp3", ".ogg"}
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
        done = subprocess.run(  # noqa: S603 - fixed argv, interpreter chosen by the operator
            [str(python), "-I", "-c", "import yue2"], capture_output=True, timeout=60, check=False
        )
        ok = done.returncode == 0
    except (OSError, subprocess.SubprocessError):
        ok = False
    with _probe_lock:
        _probe.update(at=time.monotonic(), python=str(python), ok=ok)
    return ok


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


class YuE2Provider:
    id = "yue2"
    name = "YuE2 (on this computer, non-commercial)"
    kind = "local"

    def status(self) -> dict[str, Any]:
        if not settings.load()["providers"].get(self.id, False):
            return {
                "ready": False,
                "message": "Off. Needs an NVIDIA GPU with about 24 GB and a separate YuE2 install; "
                "its songs may not be used commercially.",
            }
        python = interpreter()
        if python is None:
            message = (
                f"Not set up. Install YuE2 (Python 3.12, NVIDIA GPU with 24 GB) and set {PYTHON_ENV} "
                "to that environment's python, then restart Music Suite."
            )
            return {"ready": False, "message": message}
        if not _importable(python):
            return {
                "ready": False,
                "message": f"The interpreter in {PYTHON_ENV} cannot import yue2.",
            }
        return {"ready": True, "message": f"Installed. Licence: {LICENSE}."}

    def describe(self) -> dict[str, Any]:
        return {
            "tasks": [{"id": "text2music", "label": "New song"}],
            "groups": ["Song", "Lyrics", "Music", "Variations"],
            "fields": [
                field(
                    "accept_noncommercial",
                    "bool",
                    "Song",
                    "I will not use this song commercially (YuE2 is licensed CC BY-NC 4.0)",
                    required=True,
                    default=False,
                ),
                field(
                    "caption",
                    "text",
                    "Song",
                    "Style description",
                    required=True,
                    min=3,
                    max=1000,
                    multiline=True,
                ),
                field("instrumental", "bool", "Song", "Instrumental (no vocals)", default=False),
                field(
                    "lyrics",
                    "lyrics",
                    "Lyrics",
                    "Lyrics",
                    max=3500,
                    sections=SECTIONS,
                    help="YuE2 chooses the length from the lyrics.",
                ),
                field(
                    "bpm", "int", "Music", "Tempo", min=30, max=300, step=1, unit="BPM", auto=True
                ),
                field("keyscale", "enum", "Music", "Key", auto=True, options=KEYS),
                field("seed", "seed", "Variations", "Seed", default=-1),
            ],
        }

    def worker_request(self, values: dict[str, Any]) -> dict[str, Any]:
        lyrics = str(values.get("lyrics", "")).strip()
        seed = values.get("seed", -1)
        return {
            "style": describe_style(values),
            "lyrics": lyrics if lyrics and not values.get("instrumental") else INSTRUMENTAL,
            "cot": "full",
            "seed": seed if isinstance(seed, int) and seed >= 0 else None,
            "device": os.getenv(DEVICE_ENV, "cuda"),
            "model": DEFAULT_MODEL,
        }

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        if values.get("accept_noncommercial") is not True:
            raise EditorError(
                "Confirm the non-commercial licence before generating with YuE2.", 422
            )
        python = interpreter()
        if python is None or not _importable(python):
            raise EditorError(self.status()["message"], 503)
        limit = float(projects.SETTINGS.ffmpeg_timeout_seconds or 900) * 2
        with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
            work = Path(tmp)
            request_file = work / "request.json"
            request_file.write_text(json.dumps(self.worker_request(values)), encoding="utf-8")
            out = work / "out"
            log = work / "worker.log"
            ctx.progress(12.0, "Starting YuE2 (the first run downloads the model).")
            with log.open("wb") as sink:
                child = subprocess.Popen(  # noqa: S603 - fixed argv
                    [str(python), "-I", str(WORKER), str(request_file), str(out)],
                    stdout=sink,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL,
                    cwd=str(work),
                )
                started = time.monotonic()
                while child.poll() is None:
                    elapsed = time.monotonic() - started
                    if elapsed > limit or ctx.cancelled():
                        child.kill()
                        child.wait(timeout=30)
                        if elapsed > limit:
                            raise EditorError("YuE2 took too long and was stopped.", 504)
                        raise EditorError("Generation was cancelled.", 409)
                    ctx.progress(
                        14.0 + 72.0 * (1.0 - 1.0 / (1.0 + elapsed / 90.0)),
                        "YuE2 is writing the song.",
                    )
                    time.sleep(2.0)
            if child.returncode != 0:
                tail = log.read_text(encoding="utf-8", errors="replace").strip().splitlines()[-1:]
                reason = tail[0][:200] if tail else f"exit code {child.returncode}"
                if "out of memory" in reason.lower():
                    reason = "the GPU ran out of memory"
                raise EditorError(f"YuE2 failed: {reason}", 502)
            audio = _find_audio(out) if out.is_dir() else None
            if audio is None:
                raise EditorError("YuE2 finished but wrote no audio file.", 502)
            if audio.stat().st_size > projects.SETTINGS.max_upload_bytes:
                raise EditorError("The generated song is larger than the upload limit.", 502)
            summary = projects.read_json_safe(out / "music_suite_summary.json") or {}
            return [
                Output(
                    data=audio.read_bytes(),
                    suffix=audio.suffix.lower(),
                    meta={
                        "caption": values.get("caption"),
                        "lyrics": values.get("lyrics", ""),
                        "model": DEFAULT_MODEL,
                        "license": LICENSE,
                        "truncated": bool(summary.get("truncated")),
                        "seed": values.get("seed") if values.get("seed", -1) >= 0 else None,
                    },
                )
            ]
