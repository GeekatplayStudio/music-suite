"""Ties providers, the memory guard, import and history together."""

from __future__ import annotations

import io
import tempfile
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from audioqi.editor import assets, processing, projects
from audioqi.editor.projects import EditorError, NotFoundError, ParamError
from audioqi.generation import records, resources, schema, settings
from audioqi.generation.providers.acestep import AceStepProvider
from audioqi.generation.providers.base import Output, Provider, RunContext
from audioqi.generation.providers.cloud import ElevenLabsProvider, FalProvider
from audioqi.generation.providers.comfyui import ComfyUiProvider

PROVIDERS: dict[str, Provider] = {
    provider.id: provider
    for provider in (AceStepProvider(), ComfyUiProvider(), ElevenLabsProvider(), FalProvider())
}
#: Shown in settings so the user can see what is coming and why it is not there yet.
PLANNED = [
    {
        "id": "suno",
        "name": "Suno",
        "kind": "external",
        "message": "Not available: Suno has no public API yet. Unofficial connectors break Suno's terms, so Music Suite does not use them.",
    },
]

_CANCELLED: set[str] = set()
_CANCEL_LOCK = threading.Lock()


def cancel(job_id: str) -> None:
    with _CANCEL_LOCK:
        _CANCELLED.add(job_id)


def _is_cancelled(job_id: str) -> bool:
    with _CANCEL_LOCK:
        return job_id in _CANCELLED


def provider(provider_id: Any) -> Provider:
    if not isinstance(provider_id, str) or provider_id not in PROVIDERS:
        raise NotFoundError("Unknown generation provider.")
    return PROVIDERS[provider_id]


def describe_all() -> list[dict[str, Any]]:
    enabled = settings.load()["providers"]
    listed = []
    for item in PROVIDERS.values():
        listed.append(
            {
                "id": item.id,
                "name": item.name,
                "kind": item.kind,
                "enabled": bool(enabled.get(item.id, item.kind == "local")),
                "status": item.status(),
                "schema": item.describe(),
            }
        )
    return listed


def validate_request(params: dict[str, Any]) -> dict[str, Any]:
    """Check a ``generate_song`` job's parameters against the provider's own schema."""
    unknown = set(params) - {"provider", "task", "fields", "title"}
    if unknown:
        raise ParamError("Unknown parameter(s) in the generation request.")
    chosen = provider(params.get("provider"))
    if not settings.load()["providers"].get(chosen.id, chosen.kind == "local"):
        raise EditorError("This provider is switched off in AI Song Studio > Settings.", 403)
    described = chosen.describe()
    task = params.get("task", described["tasks"][0]["id"])
    if task not in {item["id"] for item in described["tasks"]}:
        raise ParamError("This provider does not support that task.")
    title = projects.clean_name(params.get("title") or "Generated song", limit=80)
    return {
        "provider": chosen.id,
        "task": task,
        "title": title,
        "fields": schema.validate(described["fields"], task, params.get("fields") or {}),
    }


def _import(project_id: str, output: Output, name: str, parent_id: str | None) -> dict[str, Any]:
    if output.asset is not None:
        return output.asset
    config = settings.load()
    loudness: dict[str, float] = {}
    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        staged = Path(tmp) / f"generated{output.suffix}"
        staged.write_bytes(output.data)
        if config["normalize"]:
            try:
                audio, rate = sf.read(io.BytesIO(output.data), dtype="float32", always_2d=True)
                audio, loudness = processing.normalize(
                    np.ascontiguousarray(audio), int(rate), target_lufs=float(config["target_lufs"])
                )
                staged = Path(tmp) / "normalized.wav"
                sf.write(str(staged), audio, int(rate), subtype="FLOAT")
            except (EditorError, RuntimeError, ValueError, sf.LibsndfileError):
                loudness = {}  # Silent, or a format this build cannot read: import it as it came.
        record = assets.import_audio_file(project_id, staged, name=name, source="process")
    if parent_id:
        record["parent_id"] = parent_id
    output.meta.update(loudness)
    return assets.public(record)


def run(
    project_id: str,
    job_id: str,
    params: dict[str, Any],
    parent_id: str | None,
    progress: Callable[[float, str], None],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Run one validated generation and import what it made."""
    chosen = provider(params["provider"])
    started = time.monotonic()

    def cancelled() -> bool:
        return _is_cancelled(job_id)

    progress(2, "Waiting for the generator to be free.")
    while not resources.GENERATION_LOCK.acquire(timeout=1.0):
        if cancelled():
            raise EditorError("Generation was cancelled.", 409)
    try:
        if chosen.kind == "local":
            progress(5, "Checking memory.")
            resources.ensure_memory(lambda detail: progress(6, detail), cancelled=cancelled)
        progress(10, "Starting the generator.")
        ctx = RunContext(project_id, parent_id, progress, cancelled)
        outputs = chosen.generate(params["task"], params["fields"], ctx)
    finally:
        resources.GENERATION_LOCK.release()
        with _CANCEL_LOCK:
            _CANCELLED.discard(job_id)

    progress(90, "Importing the audio.")
    title = params["title"]
    created = []
    for index, output in enumerate(outputs):
        name = title if len(outputs) == 1 else f"{title} (version {index + 1})"
        created.append(_import(project_id, output, name, parent_id))
    taken = round(time.monotonic() - started, 1)
    record = records.add(
        {
            "provider": chosen.id,
            "task": params["task"],
            "title": title,
            "fields": params["fields"],
            "project_id": project_id,
            "asset_ids": [asset["id"] for asset in created],
            "seconds_taken": taken,
            "outputs": [output.meta for output in outputs],
        }
    )
    return created, {
        "provider": chosen.id,
        "title": title,
        "record_id": record["id"],
        "seconds_taken": taken,
        "outputs": [output.meta for output in outputs],
    }
