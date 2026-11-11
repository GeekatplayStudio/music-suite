"""HTTP routes for optional engines and models (``/addons/...``).

Installing runs pip in Music Suite's environment, so every change needs the explicit
``X-Music-Suite-Action: addons`` header (a plain form post from another page cannot
send it).
"""

from __future__ import annotations

# ruff: noqa: B008
from typing import Any

from fastapi import APIRouter, Body, Header, HTTPException

from audioqi import addons
from audioqi.editor.projects import EditorError

router = APIRouter(prefix="/addons", tags=["addons"])
ACTION = "addons"


def _require_action(action: str | None) -> None:
    if action != ACTION:
        raise HTTPException(
            status_code=400, detail="Explicit add-on confirmation header is required."
        )


def _guard(fn: Any) -> Any:
    try:
        return fn()
    except EditorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("")
def overview() -> dict[str, Any]:
    """Packs, models, GPU, PyTorch and any install in progress."""
    return addons.overview()


@router.get("/install")
def install_state() -> dict[str, Any]:
    return addons.state()


@router.post("/packs/{pack_id}/install")
def install_pack(
    pack_id: str,
    payload: dict[str, Any] = Body(default={}),
    action: str | None = Header(default=None, alias="X-Music-Suite-Action"),
) -> dict[str, Any]:
    """Install a pack in the background; ``models`` lists the models to fetch with it."""
    _require_action(action)
    if set(payload) - {"models"}:
        raise HTTPException(status_code=422, detail="Only 'models' may be sent.")
    models = payload.get("models")
    if models is not None and (
        not isinstance(models, list) or not all(isinstance(m, str) for m in models)
    ):
        raise HTTPException(status_code=422, detail="'models' must be a list of model files.")
    return _guard(lambda: addons.start_install(pack_id, models))


@router.post("/models/{model_file}/download")
def download_model(
    model_file: str, action: str | None = Header(default=None, alias="X-Music-Suite-Action")
) -> dict[str, Any]:
    _require_action(action)
    return _guard(lambda: addons.start_model_download(model_file))


@router.delete("/models")
def delete_models(
    action: str | None = Header(default=None, alias="X-Music-Suite-Action"),
) -> dict[str, Any]:
    """Delete every downloaded separation model (they download again when needed)."""
    _require_action(action)
    return {"freed_bytes": _guard(addons.delete_models)}
