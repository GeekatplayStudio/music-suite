"""HTTP routes for AI music generation (``/generation/...``).

Generation itself runs as an editor job (``generate_song``); these routes cover
providers, settings, the one-step engine install, the lyrics writer and history.
"""

from __future__ import annotations

# ruff: noqa: B008
from collections.abc import Callable
from typing import Any, TypeVar

from fastapi import APIRouter, Body, Header, HTTPException

from audioqi.editor import projects
from audioqi.editor.projects import EditorError
from audioqi.generation import (
    engine,
    records,
    resources,
    secrets,
    service,
    settings,
    setup,
    writer,
)

router = APIRouter(prefix="/generation", tags=["generation"])
T = TypeVar("T")


def _guard(fn: Callable[[], T]) -> T:
    try:
        return fn()
    except EditorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


def _public_settings() -> dict[str, Any]:
    current = settings.load()
    return {**current, "engine_dir_default": not str(current["engine_dir"]).strip()}


@router.get("/providers")
def providers() -> dict[str, Any]:
    """Everything the generate form and the settings screen need, in one call."""
    return {
        "providers": service.describe_all(),
        "planned": service.PLANNED,
        "writer": writer.status(),
        "engine": {**engine.install_status(), "running": engine.SUPERVISOR.running()},
        "setup": {**setup.state(), "download_gb": round(setup.DOWNLOAD_BYTES / 1024**3, 1)},
        "memory_free_percent": resources.free_memory_percent(),
        "settings": _public_settings(),
    }


@router.get("/settings")
def get_settings() -> dict[str, Any]:
    return _public_settings()


@router.post("/settings")
def update_settings(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    _guard(lambda: settings.update(payload))
    return _public_settings()


@router.get("/setup")
def setup_state() -> dict[str, Any]:
    return {**setup.state(), "installed": engine.install_status()["installed"]}


@router.post("/setup")
def start_setup(payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
    """Build the local engine and fetch its models in the background."""
    if set(payload) - {"writer"} or not isinstance(payload.get("writer", False), bool):
        raise HTTPException(status_code=422, detail="Unknown field(s) in the setup request.")
    return setup.start_background(writer=bool(payload.get("writer", False)))


@router.post("/engine/stop")
def stop_engine() -> dict[str, Any]:
    """Unload the local engine now instead of waiting for the idle timeout."""
    if resources.GENERATION_LOCK.locked():
        raise HTTPException(status_code=409, detail="A song is being generated. Cancel it first.")
    engine.SUPERVISOR.stop()
    return {"running": engine.SUPERVISOR.running()}


@router.post("/lyrics")
def write_lyrics(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return _guard(lambda: writer.write(payload))


KEY_ACTION = "generation-key"


def _require_key_action(action: str | None) -> None:
    if action != KEY_ACTION:
        raise HTTPException(status_code=400, detail="Explicit key confirmation header is required.")


@router.post("/providers/{provider_id}/key")
def save_key(
    provider_id: str,
    payload: dict[str, Any] = Body(...),
    action: str | None = Header(default=None, alias="X-Music-Suite-Action"),
) -> dict[str, Any]:
    """Store an API key and switch that online service on. The key is never sent back."""
    _require_key_action(action)
    if set(payload) - {"key"}:
        raise HTTPException(status_code=422, detail="Only 'key' may be sent.")
    summary = _guard(lambda: secrets.save(provider_id, payload.get("key")))
    settings.update({"providers": {provider_id: True}})
    return summary


@router.delete("/providers/{provider_id}/key")
def delete_key(
    provider_id: str,
    action: str | None = Header(default=None, alias="X-Music-Suite-Action"),
) -> dict[str, Any]:
    """Forget an API key and switch that online service off."""
    _require_key_action(action)
    summary = _guard(lambda: secrets.remove(provider_id))
    settings.update({"providers": {provider_id: False}})
    return summary


@router.get("/history")
def history() -> list[dict[str, Any]]:
    return records.list_records()


@router.delete("/history/{record_id}")
def delete_history(record_id: str) -> dict[str, Any]:
    if not projects.is_canonical_uuid(record_id) or not records.remove(record_id):
        raise HTTPException(status_code=404, detail="History entry not found.")
    return {"deleted": True}
