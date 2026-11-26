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
import uuid
from pathlib import Path
from typing import Any

from audioqi.editor import projects
from audioqi.editor.projects import EditorError
from audioqi.generation import local_runtimes, settings
from audioqi.generation.providers.acestep import INSTRUMENTAL, KEYS, SECTIONS
from audioqi.generation.providers.base import Output, RunContext
from audioqi.generation.providers.cloud import describe as describe_style
from audioqi.generation.schema import field
from audioqi.generation.worker_process import terminate

PYTHON_ENV = "MUSIC_SUITE_YUE2_PYTHON"
DEVICE_ENV = "MUSIC_SUITE_YUE2_DEVICE"
DEFAULT_MODEL = "m-a-p/YuE2-3B"
WORKER = Path(__file__).with_name("yue2_worker.py")
LICENSE = (
    "CC BY-NC 4.0 with creator permissions. Individuals may monetize "
    "outputs; companies need separate commercial permission."
)
AUDIO_SUFFIXES = {".flac", ".wav", ".mp3", ".ogg"}
_PROBE_TTL_SECONDS = 60.0
_probe_lock = threading.Lock()
_probe: dict[str, Any] = {"at": 0.0, "python": None, "ok": False}


def interpreter() -> Path | None:
    raw = os.getenv(PYTHON_ENV, "").strip()
    if not raw:
        managed = local_runtimes.active("yue2")
        return local_runtimes.executable(managed, "python") if managed else None
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
    name = "YuE2 (on this computer)"
    kind = "local"

    def status(self) -> dict[str, Any]:
        if not settings.load()["providers"].get(self.id, False):
            return {
                "ready": False,
                "message": "Off. Needs an NVIDIA GPU with about 24 GB and a YuE2 installation.",
            }
        python = interpreter()
        if python is None:
            message = (
                f"Not set up. Install YuE2 (Python 3.12, NVIDIA GPU with 24 GB) and "
                f"set {PYTHON_ENV} "
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
            "tasks": [
                {"id": "text2music", "label": "New song"},
                {"id": "plan", "label": "Draft editable ABC score"},
                {"id": "cover", "label": "Cover from reviewed ABC score", "source": True},
            ],
            "groups": ["Song", "Lyrics", "Music", "Variations", "Hardware", "Advanced sampling"],
            "fields": [
                field(
                    "accept_noncommercial",
                    "bool",
                    "Song",
                    "My use complies with the YuE2 model terms and creator permissions",
                    required=True,
                    default=False,
                ),
                field(
                    "cot",
                    "enum",
                    "Song",
                    "Composition plan",
                    default="full",
                    options=["full", "melody", "off"],
                ),
                field(
                    "abc",
                    "lyrics",
                    "Music",
                    "Editable ABC score",
                    max=20000,
                    help="Optional melody or chord score for full or melody planning.",
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
                field(
                    "device",
                    "enum",
                    "Hardware",
                    "Device",
                    options=["auto", "cuda", "cpu", "xpu"],
                    default="auto",
                ),
                field(
                    "memory_budget_gib",
                    "float",
                    "Hardware",
                    "Memory budget",
                    min=4,
                    max=128,
                    step=1,
                    default=24,
                    unit="GiB",
                ),
                field(
                    "backend",
                    "enum",
                    "Hardware",
                    "Backend",
                    options=["torch", "torch-eager"],
                    default="torch",
                ),
                field(
                    "quantization",
                    "enum",
                    "Hardware",
                    "Quantization",
                    options=["none", "fp8"],
                    default="none",
                ),
                field(
                    "offload_ar",
                    "bool",
                    "Hardware",
                    "Offload language model between stages",
                    default=False,
                ),
                field(
                    "low_vram", "bool", "Hardware", "Load only the active model stage", default=True
                ),
                field(
                    "cfg_scale",
                    "float",
                    "Advanced sampling",
                    "Guidance",
                    min=0,
                    max=20,
                    step=0.01,
                    auto=True,
                    advanced=True,
                ),
                field(
                    "sampling_config",
                    "text",
                    "Advanced sampling",
                    "Sampling configuration (JSON)",
                    multiline=True,
                    max=6000,
                    advanced=True,
                    help=(
                        "Optional "
                        '{"abc":{"temperature":0.7,"top_p":0.9,"top_k":30,'
                        '"repetition_penalty":1.005,"penalty_window":100,'
                        '"min_tokens":32,"max_tokens":4096},"semantic":{...},'
                        '"ode_steps":32}. Unspecified values keep upstream defaults.'
                    ),
                ),
            ],
        }

    def worker_request(self, values: dict[str, Any]) -> dict[str, Any]:
        lyrics = str(values.get("lyrics", "")).strip()
        seed = values.get("seed", -1)
        managed = local_runtimes.manifest(self.id)
        revisions = {c["repo"]: c["revision"] for c in managed.get("checkpoints", [])}
        return {
            "style": describe_style(values),
            "lyrics": lyrics if lyrics and not values.get("instrumental") else INSTRUMENTAL,
            "cot": values.get("cot", "full"),
            "abc": values.get("abc", ""),
            "seed": seed if isinstance(seed, int) and seed >= 0 else None,
            "device": os.getenv(DEVICE_ENV, "cuda"),
            "model": DEFAULT_MODEL,
            "cache": str(settings.root() / "checkpoints/hub"),
            "revisions": revisions,
            "pipeline_options": {
                key: values[key]
                for key in (
                    "device",
                    "memory_budget_gib",
                    "backend",
                    "quantization",
                    "offload_ar",
                    "low_vram",
                )
                if key in values
            },
            "cfg_scale": values.get("cfg_scale"),
            "sampling_config": values.get("sampling_config", ""),
            "load_options": {
                "cache_dir": str(settings.root() / "checkpoints/hub"),
                "local_files_only": True,
                "revision": revisions.get(DEFAULT_MODEL),
                "vae_revision": revisions.get("m-a-p/YuE2-Vae"),
            }
            if managed
            else {},
        }

    def validate_params(self, task, values):
        if task == "plan" and values.get("cot", "full") == "off":
            raise projects.ParamError(
                "Choose melody or full composition planning to draft a score."
            )
        if values.get("abc") and values.get("cot", "full") == "off":
            raise projects.ParamError("Enable a composition plan to use an ABC score.")
        if task == "cover" and not str(values.get("abc", "")).strip():
            raise projects.ParamError(
                "Review and supply the source melody's ABC score before generating a cover."
            )
        if values.get("sampling_config"):
            try:
                config = json.loads(values["sampling_config"])
                if not isinstance(config, dict) or set(config) - {"abc", "semantic", "ode_steps"}:
                    raise ValueError()
                for stage in ("abc", "semantic"):
                    sampling = config.get(stage, {})
                    if not isinstance(sampling, dict) or set(sampling) - {
                        "temperature",
                        "top_p",
                        "top_k",
                        "repetition_penalty",
                        "penalty_window",
                        "min_tokens",
                        "max_tokens",
                    }:
                        raise ValueError()
            except (ValueError, TypeError):
                raise projects.ParamError(
                    "Enter a valid YuE2 sampling configuration with abc, semantic and/or ode_steps."
                ) from None

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        if values.get("accept_noncommercial") is not True:
            raise EditorError("Confirm the YuE2 model terms before generating with YuE2.", 422)
        self.validate_params(task, values)
        python = interpreter()
        if python is None or not _importable(python):
            raise EditorError(self.status()["message"], 503)
        limit = float(projects.SETTINGS.ffmpeg_timeout_seconds or 900) * 2
        with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
            work = Path(tmp)
            request_file = work / "request.json"
            request_file.write_text(
                json.dumps(
                    {
                        **self.worker_request(values),
                        "task": task,
                        "nonce": uuid.uuid4().hex,
                        "pid_file": str(work / "worker.pid"),
                    }
                ),
                encoding="utf-8",
            )
            out = work / "out"
            log = work / "worker.log"
            ctx.progress(12.0, "Starting YuE2 with the installed checkpoints.")
            with log.open("wb") as sink:
                child = subprocess.Popen(
                    [str(python), "-I", "-X", "utf8", str(WORKER), str(request_file), str(out)],
                    stdout=sink,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL,
                    cwd=str(work),
                    env=local_runtimes.environment(
                        self.id, offline=bool(local_runtimes.active(self.id))
                    ),
                    start_new_session=os.name != "nt",
                )
                started = time.monotonic()
                while child.poll() is None:
                    elapsed = time.monotonic() - started
                    if elapsed > limit or ctx.cancelled():
                        terminate(child)
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
            summary = projects.read_json_safe(out / "music_suite_summary.json") or {}
            if task == "plan":
                if not summary.get("abc"):
                    raise EditorError("YuE2 did not return an editable score.", 502)
                return [
                    Output(
                        tracks=[],
                        meta={
                            "task": task,
                            "abc": summary["abc"],
                            "model": DEFAULT_MODEL,
                            "license": LICENSE,
                        },
                    )
                ]
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
                        "task": task,
                        "caption": values.get("caption"),
                        "lyrics": values.get("lyrics", ""),
                        "model": DEFAULT_MODEL,
                        "license": LICENSE,
                        "truncated": bool(summary.get("truncated")),
                        "seed": values.get("seed") if values.get("seed", -1) >= 0 else None,
                    },
                    normalize=task == "text2music",
                )
            ]
