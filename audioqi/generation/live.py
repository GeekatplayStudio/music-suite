"""Bounded live sessions share the accelerator and terminate on stop, idle or API shutdown."""

from __future__ import annotations

import atexit
import json
import math
import os
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import soundfile as sf

from audioqi.editor import assets, projects
from audioqi.editor.projects import EditorError, ParamError
from audioqi.generation import local_runtimes, model_catalog, resources, settings
from audioqi.generation.worker_process import terminate

_LOCK = threading.RLock()
_SESSIONS: dict[str, Session] = {}


@dataclass
class Session:
    id: str
    project: str
    work: Path
    temporary: tempfile.TemporaryDirectory
    process: subprocess.Popen
    sink: object
    touched: float = field(default_factory=time.monotonic)
    index: int = 0
    seconds: float = 0
    lock: threading.Lock = field(default_factory=threading.Lock)


def status() -> dict:
    supported = model_catalog.support("magenta_rt2")
    installed = local_runtimes.manifest("magenta_rt2")
    return {
        **supported,
        "ready": bool(supported["supported"] and installed.get("installed_variants")),
        "models": installed.get("installed_variants", []),
        "note": (
            "Live speed depends on hardware. Apple Silicon is the "
            "upstream real-time target; Linux GPU streaming is experimental."
        ),
    }


def start(payload: dict) -> dict:
    if set(payload) - {"project_id", "asset_id", "model"}:
        raise ParamError("Unknown live session setting.")
    available = status()
    if not available["supported"]:
        raise EditorError(available["reason"], 409)
    model = payload.get("model", "mrt2_small")
    if model not in available["models"]:
        raise EditorError("Review and download the selected Magenta checkpoint first.", 409)
    project = str(payload.get("project_id", ""))
    projects.require_project(project)
    source = None
    if payload.get("asset_id"):
        source = assets.asset_paths(project, payload["asset_id"])[0]
        assets.get_asset(project, payload["asset_id"])
    if not resources.GENERATION_LOCK.acquire(blocking=False):
        raise EditorError(
            "Another model is using the accelerator. Stop it before starting live music.", 409
        )
    temporary, sink = None, None
    try:
        from audioqi.generation.engine import SUPERVISOR

        SUPERVISOR.stop()
        resources.ensure_memory()
        folder = local_runtimes.active("magenta_rt2")
        temporary = tempfile.TemporaryDirectory(prefix="live-", dir=projects.scratch_dir())
        work = Path(temporary.name).resolve()
        identifier = projects.new_id()
        setup = {
            "nonce": identifier,
            "pid_file": str(work / "worker.pid"),
            "model": model,
            "apple": local_runtimes.APPLE,
            "source": str(source) if source else None,
            "checkpoint_root": local_runtimes.manifest("magenta_rt2").get("checkpoint_root"),
            "cache": str(settings.root() / "checkpoints/hub"),
            "revisions": {
                item["repo"]: item["revision"]
                for item in local_runtimes.manifest("magenta_rt2").get("checkpoints", [])
            },
        }
        if (folder / "wsl.json").is_file():
            from audioqi.generation import wsl_runtime

            setup = wsl_runtime.paths(setup)
        (work / "setup.json").write_text(json.dumps(setup), encoding="utf-8")
        sink = (work / "worker.log").open("wb")
        command = [
            str(local_runtimes.executable(folder, "python")),
            "-I",
            "-X",
            "utf8",
            str(Path(__file__).with_name("providers") / "magenta_live_worker.py"),
            str(work),
        ]
        env = local_runtimes.environment("magenta_rt2", offline=True)
        if (folder / "wsl.json").is_file():
            command = wsl_runtime.command(folder, *command, offline=True)
            env = wsl_runtime.process_environment(env)
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=sink,
            stderr=subprocess.STDOUT,
            env=env,
            text=True,
            encoding="utf-8",
            start_new_session=os.name != "nt",
        )
        session = Session(identifier, project, work, temporary, process, sink)
        with _LOCK:
            _SESSIONS[session.id] = session
        threading.Thread(target=_expire, args=(session.id,), daemon=True).start()
        return {"id": session.id, "project_id": project, "model": model}
    except Exception:
        if sink:
            sink.close()
        if temporary:
            temporary.cleanup()
        resources.GENERATION_LOCK.release()
        raise


def _session(identifier: str) -> Session:
    if not projects.is_canonical_uuid(identifier):
        raise EditorError("Unknown live session.", 404)
    with _LOCK:
        session = _SESSIONS.get(identifier)
    if not session:
        raise EditorError("The live session has ended.", 404)
    return session


def _number(payload, key, default, low, high):
    value = payload.get(key, default)
    if (
        isinstance(value, bool)
        or not isinstance(value, (float, int))
        or not math.isfinite(value)
        or not low <= value <= high
    ):
        raise ParamError(f"{key} must be between {low} and {high}.")
    return value


def controls(payload: dict) -> dict:
    allowed = {
        "caption",
        "notes",
        "midi",
        "drums",
        "frames",
        "temperature",
        "top_k",
        "guidance",
        "note_guidance",
        "drum_guidance",
        "reference_weight",
    }
    if set(payload) - allowed:
        raise ParamError("Unknown live control.")
    caption = payload.get("caption", "")
    notes = payload.get("notes", [])
    if not isinstance(caption, str) or not 1 <= len(caption.strip()) <= 4000:
        raise ParamError("Enter a music description of up to 4000 characters.")
    if (
        not isinstance(notes, list)
        or len(notes) > 128
        or any(type(n) is not int or not 0 <= n <= 127 for n in notes)
    ):
        raise ParamError("MIDI notes must be pitches from 0 through 127.")
    if not isinstance(payload.get("midi", False), bool):
        raise ParamError("midi must be true or false.")
    cleaned = {
        "caption": caption.strip(),
        "notes": sorted(set(notes)),
        "midi": payload.get("midi", False),
    }
    for key, default, low, high in [
        ("drums", -1, -1, 1),
        ("frames", 10, 1, 50),
        ("temperature", 1.3, 0.01, 3),
        ("top_k", 40, 1, 1024),
        ("guidance", 3, -1, 7),
        ("note_guidance", 1, -1, 7),
        ("drum_guidance", 1, -1, 7),
        ("reference_weight", 0.5, 0, 1),
    ]:
        value = _number(payload, key, default, low, high)
        if key in ("frames", "top_k", "drums") and int(value) != value:
            raise ParamError(f"{key} must be a whole number.")
        cleaned[key] = int(value) if key in ("frames", "top_k", "drums") else value
    return cleaned


def chunk(identifier: str, payload: dict) -> bytes:
    values = controls(payload)
    session = _session(identifier)
    if not session.lock.acquire(blocking=False):
        raise EditorError("The previous live chunk is still rendering.", 409)
    try:
        if session.seconds + values["frames"] / 25 > 600:
            raise EditorError("Save this ten-minute take and start a new live session.", 409)
        session.touched = time.monotonic()
        index = session.index
        session.index += 1
        command = {**values, "index": index}
        try:
            session.process.stdin.write(json.dumps(command) + "\n")
            session.process.stdin.flush()
        except (OSError, ValueError) as exc:
            raise EditorError("The live engine stopped. Start a new session.", 502) from exc
        result_file = session.work / f"result-{index}.json"
        deadline = time.monotonic() + 240
        while not result_file.is_file():
            if session.process.poll() is not None or time.monotonic() > deadline:
                raise EditorError(
                    "The live model did not return audio. Check its runtime and checkpoint setup.",
                    502,
                )
            session.touched = time.monotonic()
            time.sleep(0.05)
        result = json.loads(result_file.read_text(encoding="utf-8"))
        if not result.get("ok"):
            raise EditorError(result.get("error", "Live generation failed."), 502)
        wave = session.work / f"chunk-{index}.wav"
        session.seconds += sf.info(wave).duration
        return wave.read_bytes()
    finally:
        session.touched = time.monotonic()
        session.lock.release()


def stop(identifier: str, *, save: bool = False) -> dict:
    with _LOCK:
        session = _SESSIONS.pop(identifier, None)
    if not session:
        return {"stopped": True}
    try:
        if session.process.poll() is None:
            terminate(
                session.process, runtime=local_runtimes.active("magenta_rt2"), work=session.work
            )
        # A chunk request notices process exit; wait for its file access before cleanup.
        with session.lock:
            result = {"stopped": True, "project_id": session.project}
            if save:
                files = sorted(
                    session.work.glob("chunk-*.wav"), key=lambda p: int(p.stem.split("-")[-1])
                )
                if not files:
                    raise EditorError("No live audio has been generated yet.", 409)
                target = session.work / "take.wav"
                with sf.SoundFile(
                    target, "w", samplerate=48000, channels=2, subtype="FLOAT"
                ) as output:
                    for path in files:
                        samples, rate = sf.read(path, dtype="float32", always_2d=True)
                        if rate != 48000 or samples.shape[1] != 2 or not np.isfinite(samples).all():
                            raise EditorError("The live model returned invalid audio.", 502)
                        output.write(samples)
                result["asset"] = assets.public(
                    assets.import_audio_file(
                        session.project, target, name="Magenta live take", source="process"
                    )
                )
            return result
    finally:
        session.sink.close()
        session.temporary.cleanup()
        resources.GENERATION_LOCK.release()


def _expire(identifier):
    while True:
        time.sleep(15)
        try:
            session = _session(identifier)
        except EditorError:
            return
        if time.monotonic() - session.touched > 90:
            stop(identifier)
            return


def shutdown():
    with _LOCK:
        identifiers = list(_SESSIONS)
    for identifier in identifiers:
        stop(identifier)


atexit.register(shutdown)
