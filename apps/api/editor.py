"""HTTP routes for the multitrack editor (``/editor/...``).

Only GET, POST and DELETE are used, matching the suite's CORS and proxy policy.
Every identifier is checked to be a canonical UUID before any filesystem access.
"""

from __future__ import annotations

# ruff: noqa: B008
import contextlib
import json
import subprocess
from collections.abc import Callable, Generator
from pathlib import Path
from typing import Any, TypeVar

import soundfile as sf
from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from audioqi.db import SessionLocal
from audioqi.editor import assets, engines, generation, plugins, projects
from audioqi.editor import jobs as editor_jobs
from audioqi.editor.projects import EditorError
from audioqi.io.decode import ffmpeg_available
from audioqi.jobs import submit
from audioqi.models import AnalysisRun
from audioqi.storage import sanitize_filename

router = APIRouter(prefix="/editor", tags=["editor"])
UPLOAD_CHUNK_BYTES = 1024 * 1024
EXPORT_FORMATS: dict[str, tuple[list[str], str]] = {
    "mp3": (["-c:a", "libmp3lame", "-b:a", "320k"], "audio/mpeg"),
    "flac": (["-c:a", "flac", "-compression_level", "8"], "audio/flac"),
}
T = TypeVar("T")


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _guard(fn: Callable[[], T]) -> T:
    """Run editor logic, translating its user-safe errors into HTTP errors."""
    try:
        return fn()
    except EditorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


def _allowed_extensions() -> set[str]:
    from apps.api.main import ALLOWED_AUDIO_EXTENSIONS  # one source of truth; avoids a cycle

    return ALLOWED_AUDIO_EXTENSIONS


def _project_payload(project_id: str) -> dict[str, Any]:
    record = projects.get_project(project_id)
    return {**record, "assets": assets.list_assets(project_id)}


@router.get("/capabilities")
def capabilities() -> dict[str, Any]:
    return engines.capabilities()


@router.get("/plugins")
def list_plugins() -> dict[str, Any]:
    return plugins.list_plugins()


@router.get("/plugins/{plugin_id}")
def describe_plugin(plugin_id: str) -> dict[str, Any]:
    return _guard(lambda: plugins.describe_plugin(plugin_id))


@router.get("/generation")
def generation_status() -> dict[str, Any]:
    return generation.status()


@router.get("/projects")
def list_projects() -> list[dict[str, Any]]:
    return projects.list_projects()


@router.post("/projects")
def create_project(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    record = _guard(lambda: projects.create_project(payload.get("name")))
    return {**record, "assets": []}


@router.get("/projects/{project_id}")
def get_project(project_id: str) -> dict[str, Any]:
    return _guard(lambda: _project_payload(project_id))


@router.post("/projects/{project_id}/state")
async def save_state(project_id: str, request: Request) -> dict[str, Any]:
    _guard(lambda: projects.require_project(project_id))
    limit = projects.MAX_STATE_BYTES
    too_large = HTTPException(
        status_code=413, detail=f"Project state exceeds the {limit} byte limit."
    )
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise too_large
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise too_large
    try:
        state = json.loads(bytes(body))
    except (ValueError, RecursionError) as exc:
        raise HTTPException(status_code=422, detail="Project state must be valid JSON.") from exc
    updated_at = _guard(lambda: projects.save_state(project_id, state))
    return {"ok": True, "updated_at": updated_at}


@router.post("/projects/{project_id}/rename")
def rename_project(project_id: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return _guard(lambda: projects.rename_project(project_id, payload.get("name")))


@router.delete("/projects/{project_id}")
def delete_project(project_id: str) -> dict[str, Any]:
    _guard(lambda: projects.delete_project(project_id))
    return {"deleted": True}


@router.post("/projects/{project_id}/assets")
def upload_asset(project_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    project_path = _guard(lambda: projects.require_project(project_id))
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is missing.")
    safe_filename = sanitize_filename(file.filename)
    suffix = Path(safe_filename).suffix.lower()
    if suffix not in _allowed_extensions():
        raise HTTPException(status_code=415, detail="Unsupported audio file extension.")
    settings = projects.SETTINGS
    staged = project_path / "assets" / f"{projects.new_id()}.upload{suffix}"
    staged.parent.mkdir(parents=True, exist_ok=True)
    try:
        bytes_written = 0
        with staged.open("wb") as buffer:
            while chunk := file.file.read(UPLOAD_CHUNK_BYTES):
                bytes_written += len(chunk)
                if bytes_written > settings.max_upload_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Audio upload exceeds the {settings.max_upload_bytes} byte limit.",
                    )
                buffer.write(chunk)
        if bytes_written == 0:
            raise HTTPException(status_code=400, detail="Audio upload is empty.")

        _check_duration(_probe(staged).get("duration_seconds"))
        record = _guard(
            lambda: assets.import_audio_file(
                project_id, staged, name=Path(safe_filename).stem, source="upload"
            )
        )
    finally:
        with contextlib.suppress(OSError):
            staged.unlink(missing_ok=True)
    return assets.public(record)


def _probe(path: Path) -> dict[str, Any]:
    """Container metadata; anything unreadable is rejected as not being audio."""
    from audioqi.io import metadata as metadata_module

    try:
        metadata = metadata_module.extract_metadata(path)
    except Exception as exc:
        raise HTTPException(
            status_code=415, detail="No valid audio stream was detected."
        ) from exc
    if not metadata.get("codec") and not metadata.get("format"):
        raise HTTPException(status_code=415, detail="No valid audio stream was detected.")
    return metadata


def _check_duration(duration: Any) -> None:
    limit = projects.SETTINGS.max_audio_duration_seconds
    if isinstance(duration, (int, float)) and duration > limit:
        raise HTTPException(
            status_code=413, detail=f"Audio duration exceeds the {limit:g} second limit."
        )


@router.post("/projects/{project_id}/assets/from-run/{run_id}")
def asset_from_run(
    project_id: str, run_id: str, db: Session = Depends(get_db)
) -> dict[str, Any]:
    _guard(lambda: projects.require_project(project_id))
    if not projects.is_canonical_uuid(run_id):
        raise HTTPException(status_code=404, detail="Run not found.")
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    data_root = projects.SETTINGS.data_dir.resolve()
    source: Path | None = None
    for candidate in (run.input_path, run.canonical_wav_path):
        if not candidate:
            continue
        resolved = Path(candidate).resolve()
        if resolved.is_relative_to(data_root) and resolved.is_file():
            source = resolved
            break
    if source is None:
        raise HTTPException(status_code=404, detail="Audio file missing.")

    _check_duration(_probe(source).get("duration_seconds"))
    name = Path(sanitize_filename(run.filename or "run")).stem
    record = _guard(lambda: assets.import_audio_file(project_id, source, name=name, source="run"))
    return assets.public(record)


@router.get("/projects/{project_id}/assets/{asset_id}/audio")
def get_asset_audio(project_id: str, asset_id: str) -> FileResponse:
    _guard(lambda: assets.get_asset(project_id, asset_id))
    wav, _ = assets.asset_paths(project_id, asset_id)
    return FileResponse(wav, filename=f"{asset_id}.wav", media_type="audio/wav")


@router.get("/projects/{project_id}/assets/{asset_id}/peaks")
def get_asset_peaks(project_id: str, asset_id: str) -> FileResponse:
    path = _guard(lambda: assets.peaks_file(project_id, asset_id))
    return FileResponse(path, media_type="application/octet-stream")


@router.delete("/projects/{project_id}/assets/{asset_id}")
def delete_asset(project_id: str, asset_id: str) -> dict[str, Any]:
    _guard(lambda: assets.delete_asset(project_id, asset_id))
    return {"deleted": True}


@router.post("/projects/{project_id}/jobs")
def create_job(project_id: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    _guard(lambda: projects.require_project(project_id))
    unknown = sorted(set(payload) - {"op", "asset_id", "params"})
    if unknown:
        raise HTTPException(status_code=422, detail="Unknown field(s) in job request.")
    job = _guard(
        lambda: editor_jobs.create_job(
            project_id, payload.get("op"), payload.get("asset_id"), payload.get("params")
        )
    )
    submit(job["id"], lambda: editor_jobs.run_job(project_id, job["id"]))
    return job


@router.get("/projects/{project_id}/jobs/{job_id}")
def get_job(project_id: str, job_id: str) -> dict[str, Any]:
    return _guard(lambda: editor_jobs.get_job(project_id, job_id))


@router.post("/projects/{project_id}/jobs/{job_id}/cancel")
def cancel_job(project_id: str, job_id: str) -> dict[str, Any]:
    return _guard(lambda: editor_jobs.cancel_job(project_id, job_id))


def _discard(*paths: Path) -> None:
    for path in paths:
        with contextlib.suppress(OSError):
            path.unlink(missing_ok=True)


@router.post("/export/{fmt}")
def encode_export(fmt: str, file: UploadFile = File(...)) -> FileResponse:
    """Encode a WAV rendered by the editor to MP3 or FLAC. Nothing is kept afterwards."""
    if fmt not in EXPORT_FORMATS:
        raise HTTPException(status_code=404, detail="Unsupported export format.")
    if not ffmpeg_available():
        raise HTTPException(status_code=503, detail="FFmpeg is required to export this format.")
    codec_args, media_type = EXPORT_FORMATS[fmt]
    settings = projects.SETTINGS
    work_dir = projects.editor_root() / "_exports"
    work_dir.mkdir(parents=True, exist_ok=True)
    token = projects.new_id()
    source = work_dir / f"{token}.wav"
    target = work_dir / f"{token}.{fmt}"
    try:
        bytes_written = 0
        with source.open("wb") as buffer:
            while chunk := file.file.read(UPLOAD_CHUNK_BYTES):
                bytes_written += len(chunk)
                if bytes_written > settings.max_upload_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Audio upload exceeds the {settings.max_upload_bytes} byte limit.",
                    )
                buffer.write(chunk)
        try:
            info = sf.info(str(source))
        except Exception as exc:
            raise HTTPException(status_code=415, detail="The export must be a WAV file.") from exc
        if info.format != "WAV" or info.frames <= 0:
            raise HTTPException(status_code=415, detail="The export must be a WAV file.")
        _check_duration(info.frames / info.samplerate)

        command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source)]
        command += ["-vn", "-map_metadata", "-1", *codec_args, str(target)]
        try:
            subprocess.run(
                command,
                check=True,
                capture_output=True,
                timeout=settings.ffmpeg_timeout_seconds or None,
            )
        except (subprocess.SubprocessError, OSError) as exc:
            raise HTTPException(status_code=500, detail="Encoding failed.") from exc
        if not target.is_file() or target.stat().st_size == 0:
            raise HTTPException(status_code=500, detail="Encoding failed.")
    except Exception:
        _discard(source, target)
        raise
    _discard(source)
    return FileResponse(
        target,
        filename=f"mix.{fmt}",
        media_type=media_type,
        background=BackgroundTask(_discard, target),
    )
