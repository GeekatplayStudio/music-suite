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
from audioqi.generation import records, remote_songs, resources, schema, settings
from audioqi.generation.providers.acestep import AceStepProvider
from audioqi.generation.providers.acestep_server import AceStepServerProvider
from audioqi.generation.providers.base import Output, Provider, RunContext
from audioqi.generation.providers.cloud import ElevenLabsProvider, FalProvider
from audioqi.generation.providers.comfyui import ComfyUiProvider
from audioqi.generation.providers.yue2_engine import YuE2Provider

PROVIDERS: dict[str, Provider] = {
    provider.id: provider
    for provider in (
        AceStepProvider(),
        AceStepServerProvider(),
        YuE2Provider(),
        ComfyUiProvider(),
        ElevenLabsProvider(),
        FalProvider(),
    )
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
                "enabled": bool(enabled.get(item.id, False)),
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
    if not settings.load()["providers"].get(chosen.id, False):
        raise EditorError("This provider is switched off in AI Song Studio > Settings.", 403)
    described = chosen.describe()
    task = params.get("task", described["tasks"][0]["id"])
    entry = next((item for item in described["tasks"] if item["id"] == task), None)
    if entry is None:
        raise ParamError("This provider does not support that task.")
    if entry.get("available") is False:
        raise EditorError(str(entry.get("reason") or "That task is not available yet."), 409)
    title = projects.clean_name(params.get("title") or "Generated song", limit=80)
    return {
        "provider": chosen.id,
        "task": task,
        "title": title,
        "fields": schema.validate(described["fields"], task, params.get("fields") or {}),
        "source": bool(entry.get("source")),
    }


def needs_source(cleaned: dict[str, Any]) -> bool:
    """Whether a validated request edits existing audio (and so needs a clip)."""
    return bool(cleaned.get("source"))


def _import(project_id: str, output: Output, name: str, parent_id: str | None) -> dict[str, Any]:
    if output.asset is not None:
        return output.asset
    config = settings.load()
    loudness: dict[str, float] = {}
    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        staged = Path(tmp) / f"generated{output.suffix}"
        staged.write_bytes(output.data)
        if config["normalize"] and output.normalize:
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
        source = assets.asset_paths(project_id, parent_id)[0] if parent_id else None
        ctx = RunContext(project_id, parent_id, progress, cancelled, source=source)
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
        asset = _import(project_id, output, name, parent_id)
        created.append(asset)
        if chosen.kind == "external" and output.meta.get("song_id"):
            # The service keeps this song, so editing it later needs no upload.
            remote_songs.put(project_id, asset["id"], chosen.id, output.meta["song_id"])
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


def estimate(params: Any, project_id: str | None, asset_id: str | None) -> dict[str, Any] | None:
    """What a request would cost on an online service, or None for local providers."""
    if not isinstance(params, dict):
        raise ParamError("The request must be an object.")
    cleaned = validate_request(
        {k: v for k, v in params.items() if k in ("provider", "task", "fields", "title")}
    )
    chosen = provider(cleaned["provider"])
    estimator = getattr(chosen, "estimate", None)
    if chosen.kind != "external" or estimator is None:
        return None
    source_seconds: float | None = None
    stored = False
    if cleaned["source"]:
        if not project_id or not asset_id:
            raise ParamError("Select a clip first: this edits existing audio.")
        asset = assets.get_asset(project_id, asset_id)
        source_seconds = float(asset["duration_seconds"])
        stored = remote_songs.get(project_id, asset_id, chosen.id) is not None
    if cleaned["task"] == "text2music" and hasattr(chosen, "payload"):
        chosen.payload(cleaned["fields"])  # The same checks as sending it, without sending it.
    result: dict[str, Any] = estimator(cleaned["task"], cleaned["fields"], source_seconds, stored)
    return result


def draft_plan(provider_id: Any, fields: Any) -> list[dict[str, Any]]:
    """Ask a provider that supports song plans to draft one from the description."""
    chosen = provider(provider_id)
    drafter = getattr(chosen, "draft_plan", None)
    if drafter is None:
        raise ParamError("This provider does not draft song plans.")
    if not settings.load()["providers"].get(chosen.id, False):
        raise EditorError("This provider is switched off in AI Song Studio > Settings.", 403)
    described = chosen.describe()
    values = schema.validate(
        described["fields"],
        "text2music",
        {
            k: v
            for k, v in (fields or {}).items()
            if k in ("caption", "lyrics", "bpm", "keyscale", "duration", "model_id", "instrumental")
        }
        if isinstance(fields, dict)
        else {},
    )
    sections: list[dict[str, Any]] = drafter(values)
    return sections
