from __future__ import annotations

# ruff: noqa: B008
import json
import re
import shutil
import threading
import time
import traceback
from collections.abc import AsyncGenerator, Generator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import Body, Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from audioqi.config import ensure_data_dirs, get_settings
from audioqi.conversion import (
    convert_audio_formats,
    parse_requested_formats,
    read_conversion_manifest,
    read_conversion_state,
    reset_conversion_outputs,
    write_conversion_state,
)
from audioqi.core.analyzer import analyze_audio_file
from audioqi.core.music_style import StyleAnalysisError, analyze_music_style, ollama_status
from audioqi.db import SessionLocal, init_db
from audioqi.geometry_mapper.service import analyze_mapper_upload, clear_mapper_cache
from audioqi.io.metadata import normalize_metadata_payload
from audioqi.jobs import reset_executor, submit
from audioqi.mastering import (
    parse_mastering_backend,
    parse_mastering_mode,
    parse_mastering_normalization_profile,
    parse_mastering_preset,
    read_mastering_manifest,
    read_mastering_state,
    reset_mastering_outputs,
    run_mastering,
    write_mastering_state,
)
from audioqi.models import AnalysisRun
from audioqi.report.generator import generate_report_artifacts
from audioqi.schemas import RunDetail, RunSummary, UploadResponse
from audioqi.storage import (
    new_run_id,
    read_json,
    run_dir_for,
    sanitize_filename,
    upload_path_for,
    write_json,
)
from audioqi.updater import UpdateError, apply_update, get_update_status

SETTINGS = get_settings()
ALLOWED_AUDIO_EXTENSIONS = {".aac", ".aif", ".aiff", ".flac", ".m4a", ".mp3", ".ogg", ".wav"}
UPLOAD_CHUNK_BYTES = 1024 * 1024
ANALYSIS_STATUS_FILENAME = "analysis_status.json"
HIDDEN_FROM_HISTORY_FILENAME = ".hidden_from_history"
ANALYSIS_STAGE_DETAILS: dict[str, str] = {
    "uploaded": "File uploaded. Ready for analysis.",
    "queued": "Queued for analysis worker.",
    "initialize": "Initializing analysis pipeline.",
    "metadata": "Reading file metadata (ffprobe/mutagen).",
    "decode": "Decoding source into canonical float32 WAV.",
    "scan": "Scanning audio in chunks and building analysis cache.",
    "dynamics": "Computing loudness, true peak, dynamics, and stereo metrics.",
    "markers": "Detecting clipping, phase, sibilance, and warning markers.",
    "spectrograms": "Generating STFT, mel, and CQT spectrogram data.",
    "charts": "Building interactive chart payloads.",
    "report_prepare": "Preparing report artifact generation.",
    "report_images": "Rendering static chart images for report export.",
    "report_images_timeout": "Image export reached time guard; continuing with partial assets.",
    "report_html": "Rendering HTML report.",
    "report_pdf": "Rendering PDF report.",
    "report_pdf_skipped": "PDF export skipped by timeout/optional export policy.",
    "report_finalize": "Finalizing report artifacts.",
    "finalize": "Finalizing analysis outputs.",
    "completed": "Analysis complete. Metrics, charts, and reports are ready.",
    "stalled": "Loop guard detected a stalled job.",
    "failed": "Analysis failed.",
}
MASTERING_STAGE_DETAILS: dict[str, str] = {
    "idle": "Idle.",
    "queued": "Queued for mastering.",
    "prepare": "Preparing mastering pipeline.",
    "load_source": "Decoding source audio.",
    "profile_source": "Measuring source loudness, dynamics, and spectral balance.",
    "adapt_settings": "Adapting the chain to this source material.",
    "backend_internal": "Applying internal mastering backend pass.",
    # Chain sub-stages. Every pass through the mastering chain reports these,
    # prefixed by which pass it is (chain / variantN / stem_bass / ...), so a
    # long run names the filter that is actually running.
    "chain_highpass": "Filtering sub-sonic rumble below 24 Hz.",
    "chain_tilt": "Applying spectral tilt and tonal balance.",
    "chain_deess": "De-essing sibilance.",
    "chain_compress": "Applying broadband compression.",
    "chain_limit": "Normalising to loudness and true-peak targets.",
    "process": "Applying mastering chain.",
    "backend_ffmpeg": "Applying ffmpeg mastering backend pass.",
    "backend_pedalboard": "Applying pedalboard mastering backend pass.",
    "backend_matchering": "Applying matchering reference pass.",
    "marker_refine": "Applying marker-aware local corrective mastering.",
    "variant_1": "Evaluating optimizer variant 1.",
    "variant_2": "Evaluating optimizer variant 2.",
    "variant_3": "Evaluating optimizer variant 3.",
    "variant_4": "Evaluating optimizer variant 4.",
    "variant_5": "Evaluating optimizer variant 5.",
    "variant_6": "Evaluating optimizer variant 6.",
    "variant_7": "Evaluating optimizer variant 7.",
    "variant_8": "Evaluating optimizer variant 8.",
    "stems": "Building spectral stems.",
    "process_bass": "Processing bass stem.",
    "process_vocals": "Processing vocal stem.",
    "process_drums": "Processing drum stem.",
    "process_other": "Processing other stem.",
    "refine_pass_1": "Marker-aware refinement pass 1.",
    "refine_pass_2": "Marker-aware refinement pass 2.",
    "refine_pass_3": "Marker-aware refinement pass 3.",
    "refine_pass_4": "Marker-aware refinement pass 4.",
    "refine_pass_5": "Marker-aware refinement pass 5.",
    "stem_fallback": "Running stem-rescue fallback pass.",
    "rollback": "No improvement detected; rolling back latest pass.",
    "finalize": "Finalizing mastered output.",
    "self_check": "Running post-master quality self-check.",
    "done": "Mastering completed.",
}

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    ensure_data_dirs(SETTINGS)
    init_db()
    yield


app = FastAPI(title="Music Suite API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(SETTINGS.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-Music-Suite-Action"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True}


@app.get("/system/update")
def system_update_status() -> dict[str, Any]:
    try:
        return get_update_status(SETTINGS.project_root)
    except UpdateError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/system/update")
def system_apply_update(
    action: str | None = Header(default=None, alias="X-Music-Suite-Action"),
) -> dict[str, Any]:
    if action != "update":
        raise HTTPException(status_code=400, detail="Explicit update confirmation header is required.")
    try:
        return apply_update(SETTINGS.project_root)
    except UpdateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def _analysis_status_path(run_dir: Path) -> Path:
    return run_dir / ANALYSIS_STATUS_FILENAME


def _hidden_from_history_path(run_dir: Path) -> Path:
    return run_dir / HIDDEN_FROM_HISTORY_FILENAME


def _is_hidden_from_history(run_dir: Path) -> bool:
    return _hidden_from_history_path(run_dir).exists()


def _mark_hidden_from_history(run_dir: Path, reason: str) -> None:
    marker = _hidden_from_history_path(run_dir)
    marker.write_text(reason, encoding="utf-8")


def _analysis_stage_detail(stage: str | None) -> str:
    if not stage:
        return "Idle."
    if stage in ANALYSIS_STAGE_DETAILS:
        return ANALYSIS_STAGE_DETAILS[stage]
    cleaned = stage.replace("_", " ").strip()
    if not cleaned:
        return "Working..."
    return f"{cleaned[:1].upper()}{cleaned[1:]}."


# Chain sub-stages are emitted with a prefix naming which pass they belong to:
# "chain_deess" for a single-pass master, "variant3_deess" while evaluating
# optimizer variant 3, "stem_bass_deess" while processing the bass stem.
CHAIN_STEP_LABELS: dict[str, str] = {
    "highpass": "filtering sub-sonic rumble",
    "tilt": "applying spectral tilt",
    "deess": "de-essing sibilance",
    "compress": "applying broadband compression",
    "limit": "normalising to loudness and true-peak targets",
}


def _mastering_stage_detail(stage: str | None) -> str:
    if not stage:
        return "Mastering in progress."
    if stage in MASTERING_STAGE_DETAILS:
        return MASTERING_STAGE_DETAILS[stage]

    # Resolve a prefixed chain step into a sentence that names both the pass
    # and the filter, rather than falling through to "Variant3 deess."
    step = stage.rsplit("_", 1)[-1]
    if step in CHAIN_STEP_LABELS and "_" in stage:
        prefix = stage[: -(len(step) + 1)]
        action = CHAIN_STEP_LABELS[step]
        if prefix == "chain":
            return f"Mastering chain: {action}."
        if prefix.startswith("variant"):
            return f"Variant {prefix.removeprefix('variant')}: {action}."
        if prefix.startswith("stem_"):
            return f"{prefix.removeprefix('stem_').capitalize()} stem: {action}."
        return f"{prefix.replace('_', ' ')}: {action}."

    cleaned = stage.replace("_", " ").strip()
    if not cleaned:
        return "Mastering in progress."
    return f"{cleaned[:1].upper()}{cleaned[1:]}."


def _write_analysis_status(
    run_dir: Path,
    *,
    status: str,
    progress: float,
    stage: str | None,
    detail: str | None,
) -> None:
    payload = {
        "status": status,
        "progress": float(max(0.0, min(progress, 100.0))),
        "stage": stage,
        "detail": detail if detail else _analysis_stage_detail(stage),
        "updated_at": datetime.now(UTC).isoformat(),
    }
    write_json(_analysis_status_path(run_dir), payload)


def _read_analysis_status(run_dir: Path) -> dict[str, Any]:
    path = _analysis_status_path(run_dir)
    if not path.exists():
        return {}
    try:
        payload = read_json(path)
    except (OSError, ValueError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


@app.post("/runs/upload", response_model=UploadResponse)
def upload_audio(
    file: UploadFile = File(...),
    hide_from_history: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> UploadResponse:
    run_id = new_run_id()
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is missing.")
    safe_filename = sanitize_filename(file.filename)
    if Path(safe_filename).suffix.lower() not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported audio file extension.")
    input_path = upload_path_for(run_id, safe_filename)
    run_dir = run_dir_for(run_id)

    try:
        bytes_written = 0
        with input_path.open("wb") as buffer:
            while chunk := file.file.read(UPLOAD_CHUNK_BYTES):
                bytes_written += len(chunk)
                if bytes_written > SETTINGS.max_upload_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Audio upload exceeds the {SETTINGS.max_upload_bytes} byte limit.",
                    )
                buffer.write(chunk)
        if bytes_written == 0:
            raise HTTPException(status_code=400, detail="Audio upload is empty.")

        from audioqi.io.metadata import extract_metadata

        metadata = extract_metadata(input_path)
        if not metadata.get("codec") and not metadata.get("format"):
            raise HTTPException(status_code=415, detail="No valid audio stream was detected.")
        duration = metadata.get("duration_seconds")
        if isinstance(duration, (int, float)) and duration > SETTINGS.max_audio_duration_seconds:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Audio duration exceeds the {SETTINGS.max_audio_duration_seconds:g} second limit."
                ),
            )
    except Exception:
        _safe_delete_path(input_path.parent)
        _safe_delete_path(run_dir)
        raise

    metadata_path = run_dir / "metadata.json"
    write_json(metadata_path, metadata)

    run = AnalysisRun(
        id=run_id,
        filename=safe_filename,
        status="uploaded",
        progress=0.0,
        input_path=str(input_path),
        run_dir=str(run_dir),
        metadata_path=str(metadata_path),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    if hide_from_history:
        _mark_hidden_from_history(run_dir, "hidden upload (tests/internal)")
    _write_analysis_status(
        run_dir,
        status="uploaded",
        progress=0.0,
        stage="uploaded",
        detail=_analysis_stage_detail("uploaded"),
    )
    return UploadResponse(run=_to_summary(run), metadata=metadata)


@app.post("/song-mapper/api/voice/analyze")
def analyze_song_geometry(
    audio: UploadFile = File(...),
    sr: int = Form(default=48_000),
    n_fft: int = Form(default=2_048),
    hop: int = Form(default=512),
    smooth: int = Form(default=1),
    norm: str = Form(default="none"),
    edge_mode: str = Form(default="none"),
    knn_n: int = Form(default=4),
    separate: str | None = Form(default=None),
    cache_dir: str | None = Form(default=None),
) -> dict[str, Any]:
    del cache_dir  # Music Suite always keeps mapper cache inside its managed data directory.
    if not audio.filename:
        raise HTTPException(status_code=400, detail="File name is missing.")
    try:
        return analyze_mapper_upload(
            audio.file,
            audio.filename,
            sr=sr,
            n_fft=n_fft,
            hop=hop,
            smooth=smooth,
            norm=norm,
            edge_mode=edge_mode,
            knn_n=knn_n,
            separate=separate,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Song mapper analysis failed: {exc}") from exc


@app.get("/song-mapper/api/style/status")
def song_style_status(model: str = Query(default="")) -> dict[str, Any]:
    """Whether a local Ollama model is reachable, and which one would be used."""
    try:
        return ollama_status(requested_model=model)
    except StyleAnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/song-mapper/api/style/analyze")
def song_style_analyze(payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
    """
    Describes a track's musical style from the mapper's own measurements.

    The rule-based description is always returned; an Ollama description is
    added when a local model answers. A missing model is a normal state, so it
    is reported in the body rather than raised as an error.
    """
    features = payload.get("features")
    if not isinstance(features, dict):
        raise HTTPException(status_code=400, detail="A 'features' object is required.")

    try:
        return analyze_music_style(
            features,
            model=str(payload.get("model") or ""),
            style=str(payload.get("style") or "prose"),
            extra_context=str(payload.get("context") or ""),
        )
    except StyleAnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/song-mapper/api/voice/cache/clear")
def clear_song_geometry_cache(payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
    del payload  # Client paths are intentionally ignored; only the managed mapper cache is cleared.
    return clear_mapper_cache()


@app.post("/runs/{run_id}/analyze", response_model=RunSummary)
def analyze_run(
    run_id: str,
    use_gpu: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> RunSummary:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    if run.status in {"running", "queued"}:
        return _to_summary(run)

    run.status = "queued"
    run.progress = 0.0
    run.error_message = None
    db.commit()
    _write_analysis_status(
        Path(run.run_dir),
        status="queued",
        progress=0.0,
        stage="queued",
        detail=_analysis_stage_detail("queued"),
    )

    submit(run_id, lambda: _run_analysis_job(run_id, use_gpu=use_gpu))
    db.refresh(run)
    return _to_summary(run)


@app.post("/runs/{run_id}/convert")
def convert_run(
    run_id: str,
    formats: str = Query(default="mp3,wav,flac"),
    mp3_bitrate_kbps: int = Query(default=320, ge=96, le=320),
    aac_bitrate_kbps: int = Query(default=256, ge=96, le=320),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    requested_formats = parse_requested_formats(formats)
    if not requested_formats:
        raise HTTPException(status_code=400, detail="No supported conversion formats requested.")

    run_dir = Path(run.run_dir)
    existing = read_conversion_state(run_dir)
    if existing.get("status") in {"queued", "running"}:
        return _conversion_payload(run_dir)

    reset_conversion_outputs(run_dir)
    write_conversion_state(
        run_dir,
        {
            "status": "queued",
            "progress": 0.0,
            "error_message": None,
            "requested_formats": requested_formats,
            "completed_formats": [],
        },
    )

    submit(
        f"{run_id}:convert",
        lambda: _run_conversion_job(
            run_id=run_id,
            formats=requested_formats,
            mp3_bitrate_kbps=mp3_bitrate_kbps,
            aac_bitrate_kbps=aac_bitrate_kbps,
        ),
    )
    return _conversion_payload(run_dir)


@app.get("/runs/{run_id}/conversions")
def get_conversions(run_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    return _conversion_payload(Path(run.run_dir))


@app.get("/runs/{run_id}/conversions/{fmt}/download")
def download_converted_file(run_id: str, fmt: str, db: Session = Depends(get_db)) -> FileResponse:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    payload = _conversion_payload(Path(run.run_dir))
    manifest = payload.get("manifest") if isinstance(payload, dict) else None
    files = manifest.get("files") if isinstance(manifest, dict) else None
    if not isinstance(files, list):
        raise HTTPException(status_code=404, detail="No converted files available.")

    fmt_norm = fmt.lower().lstrip(".")
    matched: dict[str, Any] | None = None
    for item in files:
        if not isinstance(item, dict):
            continue
        if str(item.get("format", "")).lower() == fmt_norm:
            matched = item
            break
    if not matched:
        raise HTTPException(
            status_code=404, detail=f"No converted file found for format '{fmt_norm}'."
        )

    path = Path(str(matched.get("path", "")))
    if not path.exists():
        raise HTTPException(status_code=404, detail="Converted file missing on disk.")
    media_type = _infer_audio_media_type(path)
    return FileResponse(path, filename=path.name, media_type=media_type)


@app.post("/runs/{run_id}/master")
def master_run(
    run_id: str,
    mode: str = Query(default="v1"),
    preset: str = Query(default="streaming"),
    normalization_profile: str | None = Query(default=None),
    backend: str = Query(default="internal"),
    reference_run_id: str | None = Query(default=None),
    target_lufs: float | None = Query(default=None, ge=-30.0, le=-6.0),
    true_peak_dbfs: float | None = Query(default=None, ge=-6.0, le=0.0),
    optimizer_variants: int = Query(default=4, ge=2, le=8),
    max_refine_passes: int = Query(default=3, ge=1, le=5),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    normalized_mode = parse_mastering_mode(mode)
    if not normalized_mode:
        raise HTTPException(
            status_code=400, detail="Unsupported mastering mode. Use v1, v2, or v3."
        )
    normalized_preset = parse_mastering_preset(preset)
    if not normalized_preset:
        raise HTTPException(
            status_code=400,
            detail="Unsupported mastering preset. Use streaming, club, film, or voice.",
        )
    normalized_normalization_profile = parse_mastering_normalization_profile(
        normalization_profile
    )
    if normalization_profile and not normalized_normalization_profile:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported normalization profile. "
                "Use youtube, spotify, apple_music, instagram, tiktok, "
                "broadcast_ebu, podcast_voice, or off."
            ),
        )
    normalized_backend = parse_mastering_backend(backend)
    if not normalized_backend:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported mastering backend. "
                "Use auto, internal, ffmpeg, pedalboard, or matchering."
            ),
        )

    reference_path: Path | None = None
    if reference_run_id:
        reference_run = db.get(AnalysisRun, reference_run_id)
        if not reference_run:
            raise HTTPException(status_code=404, detail="Reference run not found.")
        candidate = (
            Path(reference_run.canonical_wav_path)
            if reference_run.canonical_wav_path
            else Path(reference_run.input_path)
        )
        if not candidate.exists():
            raise HTTPException(status_code=404, detail="Reference audio file missing.")
        reference_path = candidate

    run_dir = Path(run.run_dir)
    existing = read_mastering_state(run_dir)
    if existing.get("status") in {"queued", "running"}:
        return _mastering_payload(run_dir)

    reset_mastering_outputs(run_dir)
    write_mastering_state(
        run_dir,
        {
            "status": "queued",
            "progress": 0.0,
            "error_message": None,
            "mode": normalized_mode,
            "preset": normalized_preset,
            "backend": normalized_backend,
            "stage": "queued",
            "detail": _mastering_stage_detail("queued"),
        },
    )
    submit(
        f"{run_id}:master",
        lambda: _run_mastering_job(
            run_id=run_id,
            mode=normalized_mode,
            preset=normalized_preset,
            normalization_profile=normalized_normalization_profile,
            backend=normalized_backend,
            reference_path=str(reference_path) if reference_path else None,
            target_lufs=target_lufs,
            true_peak_dbfs=true_peak_dbfs,
            optimizer_variants=optimizer_variants,
            max_refine_passes=max_refine_passes,
        ),
    )
    return _mastering_payload(run_dir)


@app.get("/runs/{run_id}/mastering")
def get_mastering(run_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    return _mastering_payload(Path(run.run_dir))


@app.get("/runs/{run_id}/mastering/{output_id}/download")
def download_mastered_file(
    run_id: str, output_id: str, db: Session = Depends(get_db)
) -> FileResponse:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    payload = _mastering_payload(Path(run.run_dir))
    manifest = payload.get("manifest") if isinstance(payload, dict) else None
    outputs = manifest.get("outputs") if isinstance(manifest, dict) else None
    if not isinstance(outputs, list):
        raise HTTPException(status_code=404, detail="No mastering outputs available.")

    output_id_norm = output_id.strip().lower()
    matched: dict[str, Any] | None = None
    for entry in outputs:
        if not isinstance(entry, dict):
            continue
        candidate_id = str(entry.get("id", "")).lower()
        candidate_filename = str(entry.get("filename", "")).lower()
        if candidate_id == output_id_norm or candidate_filename == output_id_norm:
            matched = entry
            break
    if not matched:
        raise HTTPException(status_code=404, detail=f"No mastered output found for '{output_id}'.")

    path = Path(str(matched.get("path", "")))
    if not path.exists():
        raise HTTPException(status_code=404, detail="Mastered file missing on disk.")
    media_type = _infer_audio_media_type(path)
    return FileResponse(path, filename=path.name, media_type=media_type)


@app.get("/runs", response_model=list[RunSummary])
def list_runs(
    limit: int = Query(default=50, le=200),
    include_hidden: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[RunSummary]:
    rows = db.scalars(select(AnalysisRun).order_by(AnalysisRun.created_at.desc())).all()
    results: list[RunSummary] = []
    for row in rows:
        if not include_hidden and _is_hidden_from_history(Path(row.run_dir)):
            continue
        results.append(_to_summary(row))
        if len(results) >= limit:
            break
    return results


@app.delete("/runs")
def clear_runs(
    hard_reset: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    rows = db.scalars(select(AnalysisRun)).all()
    deleted = 0
    skipped_active = 0
    jobs_reset: dict[str, int] | None = None

    if hard_reset:
        jobs_reset = reset_executor()

    for run in rows:
        run_dir = Path(run.run_dir)
        conversion_state = read_conversion_state(run_dir)
        mastering_state = read_mastering_state(run_dir)
        active_aux = conversion_state.get("status") in {"queued", "running"} or mastering_state.get(
            "status"
        ) in {"queued", "running"}
        if not hard_reset and (run.status in {"queued", "running"} or active_aux):
            skipped_active += 1
            continue
        _delete_run_artifacts(run)
        db.delete(run)
        deleted += 1
    db.commit()
    response: dict[str, Any] = {
        "deleted": deleted,
        "skipped_active": skipped_active,
        "hard_reset": hard_reset,
    }
    if jobs_reset is not None:
        response["jobs_reset"] = jobs_reset
    return response


@app.get("/runs/{run_id}", response_model=RunDetail)
def get_run(run_id: str, db: Session = Depends(get_db)) -> RunDetail:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    metadata = normalize_metadata_payload(_safe_load_json(run.metadata_path))
    metrics = _safe_load_json(run.metrics_path)
    chart_names = _chart_names_for_run(Path(run.run_dir), run.charts_path)
    markers = metrics.get("markers", []) if metrics else []
    summary = _to_summary(run)
    return RunDetail(
        **summary.model_dump(),
        metadata=metadata,
        metrics=metrics,
        chart_names=chart_names,
        markers=markers,
        conversions=_conversion_payload(Path(run.run_dir)),
        mastering=_mastering_payload(Path(run.run_dir)),
    )


@app.get("/runs/{run_id}/charts")
def get_charts(run_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    payload = _load_chart_bundle(Path(run.run_dir), run.charts_path)
    if not payload:
        raise HTTPException(status_code=404, detail="Chart payload unavailable.")
    compacted: dict[str, Any] = {}
    for key, value in payload.items():
        compacted[key] = _compact_chart_payload(value) if isinstance(value, dict) else value
    return compacted


@app.get("/runs/{run_id}/charts/{chart_key}")
def get_chart(
    run_id: str,
    chart_key: str,
    tiny_test: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    normalized_key = _normalize_chart_key(chart_key)
    if not normalized_key:
        raise HTTPException(status_code=400, detail="Invalid chart key.")
    chart = _load_single_chart(Path(run.run_dir), run.charts_path, normalized_key)
    if not isinstance(chart, dict):
        raise HTTPException(status_code=404, detail=f"Chart '{normalized_key}' not found.")
    compacted = _compact_chart_payload(chart)
    if tiny_test and normalized_key == "loudness":
        compacted = _tiny_loudness_chart(compacted)
    return compacted
@app.get("/runs/{run_id}/ai_advice")
def get_ai_advice(run_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    metrics = _safe_load_json(run.metrics_path)
    if not metrics:
        raise HTTPException(status_code=404, detail="Metrics not found.")

    from audioqi.core.agents import build_mastering_agent_graph
    from audioqi.core.ollama import get_ai_mastering_advice

    advice = get_ai_mastering_advice(metrics)
    source = "ollama"

    if not advice:
        source = "deterministic_agent"
        graph = build_mastering_agent_graph()
        graph_state = graph.invoke({"metrics": metrics})

        summary = "Deterministic fallback advice generated by core rules engine."
        eq_advice = " | ".join(graph_state.get("eq_suggestions", ["Spectrum is balanced."]))
        dynamics_advice = " | ".join(graph_state.get("dynamics_suggestions", ["Dynamics are stable."]))

        limiter_settings = graph_state.get("final_settings", {})
        if limiter_settings:
            dynamics_advice += f" Safety brickwall limiter threshold recommended at {limiter_settings.get('limiter_threshold_dbfs')} dBFS."

        advice = {
            "summary": summary,
            "eq_advice": eq_advice,
            "dynamics_advice": dynamics_advice
        }

    return {"source": source, "advice": advice}



@app.get("/runs/{run_id}/audio")
def get_audio_file(run_id: str, db: Session = Depends(get_db)) -> FileResponse:
    run = db.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    # Prefer original source for playback to avoid browser artifacts from analysis transcodes.
    path = Path(run.input_path)
    if not path.exists() and run.canonical_wav_path:
        path = Path(run.canonical_wav_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file missing.")
    media_type = _infer_audio_media_type(path)
    return FileResponse(path, filename=path.name, media_type=media_type)


@app.get("/runs/{run_id}/export/json")
def export_json(run_id: str, db: Session = Depends(get_db)) -> FileResponse:
    run = db.get(AnalysisRun, run_id)
    if not run or not run.metrics_path:
        raise HTTPException(status_code=404, detail="Metrics not found.")
    path = Path(run.metrics_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Metrics file missing.")
    return FileResponse(path, filename=f"{run.id}-metrics.json", media_type="application/json")


@app.get("/runs/{run_id}/export/html")
def export_html(run_id: str, db: Session = Depends(get_db)) -> FileResponse:
    run = db.get(AnalysisRun, run_id)
    if not run or not run.report_html_path:
        raise HTTPException(status_code=404, detail="HTML report not found.")
    path = Path(run.report_html_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="HTML report missing.")
    return FileResponse(path, filename=f"{run.id}-report.html", media_type="text/html")


@app.get("/runs/{run_id}/export/pdf")
def export_pdf(run_id: str, db: Session = Depends(get_db)) -> FileResponse:
    run = db.get(AnalysisRun, run_id)
    if not run or not run.report_pdf_path:
        raise HTTPException(status_code=404, detail="PDF report not found.")
    path = Path(run.report_pdf_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF report missing.")
    return FileResponse(path, filename=f"{run.id}-report.pdf", media_type="application/pdf")


def _run_analysis_job(run_id: str, use_gpu: bool) -> None:
    db = SessionLocal()
    stop_watchdog = threading.Event()
    stalled = threading.Event()
    state_lock = threading.Lock()
    last_touch = time.monotonic()
    last_progress = 0.0
    last_stage = "queued"
    last_emitted_progress = -1.0
    last_emitted_stage = ""
    last_emitted_at = 0.0

    def touch(progress: float | None = None, stage: str | None = None) -> None:
        nonlocal last_touch, last_progress, last_stage
        with state_lock:
            last_touch = time.monotonic()
            if progress is not None:
                last_progress = progress
            if stage:
                last_stage = stage

    def snapshot() -> tuple[float, float, str]:
        with state_lock:
            return last_touch, last_progress, last_stage

    def mark_failed_from_watchdog(message: str, stage: str) -> None:
        watchdog_db = SessionLocal()
        try:
            failed = watchdog_db.get(AnalysisRun, run_id)
            if not failed:
                return
            if failed.status == "completed":
                return
            failed.status = "failed"
            failed.progress = 100.0
            failed.error_message = message
            watchdog_db.commit()
            _write_analysis_status(
                Path(failed.run_dir),
                status="failed",
                progress=100.0,
                stage=stage,
                detail=message,
            )
        finally:
            watchdog_db.close()

    stall_timeout = float(max(30, SETTINGS.analysis_stall_timeout_seconds))

    def watchdog_loop() -> None:
        while not stop_watchdog.wait(2.0):
            touched_at, progress_snapshot, stage_snapshot = snapshot()
            idle_seconds = time.monotonic() - touched_at
            if idle_seconds < stall_timeout:
                continue
            stalled.set()
            message = (
                f"Loop guard triggered at stage '{stage_snapshot}': "
                f"no progress update for {int(idle_seconds)}s (timeout {int(stall_timeout)}s)."
            )
            mark_failed_from_watchdog(message, "stalled")
            touch(progress=progress_snapshot, stage="stalled")
            break

    watchdog_thread = threading.Thread(
        target=watchdog_loop,
        name=f"audioqi-analysis-watchdog-{run_id[:8]}",
        daemon=True,
    )

    db_lock = threading.Lock()

    def update_status(
        *,
        progress: float,
        stage: str,
        detail: str | None = None,
        status: str = "running",
    ) -> None:
        with db_lock:
            nonlocal last_emitted_progress, last_emitted_stage, last_emitted_at
            if stalled.is_set() and status not in {"failed", "completed"}:
                raise RuntimeError("Analysis aborted by loop guard.")

            now = time.monotonic()
            progress_clamped = float(max(0.0, min(progress, 100.0)))
            if status == "running":
                progress_clamped = float(min(progress_clamped, 99.9))
                stage_changed = stage != last_emitted_stage
                progress_advanced = progress_clamped > last_emitted_progress + 0.15
                heartbeat_due = last_emitted_at <= 0.0 or (now - last_emitted_at) >= 10.0
                if not stage_changed and not progress_advanced and not heartbeat_due:
                    touch(progress=last_emitted_progress, stage=stage)
                    return
            local = db.get(AnalysisRun, run_id)
            if not local:
                raise RuntimeError("Analysis run was removed during processing.")
            if local.status == "failed" and status not in {"failed"}:
                return
            local.status = status
            if status in {"completed", "failed"}:
                local.progress = 100.0
            else:
                local.progress = max(float(local.progress), progress_clamped)
                progress_clamped = float(local.progress)
            if status != "failed":
                local.error_message = None
            db.commit()

            _write_analysis_status(
                Path(local.run_dir),
                status=status,
                progress=100.0 if status in {"completed", "failed"} else progress_clamped,
                stage=stage,
                detail=detail if detail else _analysis_stage_detail(stage),
            )
            last_emitted_progress = progress_clamped
            last_emitted_stage = stage
            last_emitted_at = now
            touch(progress=progress_clamped, stage=stage)

    try:
        run = db.get(AnalysisRun, run_id)
        if not run:
            return
        update_status(progress=1.0, stage="initialize", detail=_analysis_stage_detail("initialize"))
        watchdog_thread.start()

        def progress_callback(value: float, stage: str, detail: str | None = None) -> None:
            update_status(
                progress=float(max(1.0, min(value, 99.2))),
                stage=stage,
                detail=detail if detail else _analysis_stage_detail(stage),
            )

        output = analyze_audio_file(
            input_path=Path(run.input_path),
            run_dir=Path(run.run_dir),
            target_sr=SETTINGS.sample_rate,
            chunk_seconds=SETTINGS.chunk_seconds,
            progress=progress_callback,
            use_gpu=use_gpu,
            ffmpeg_timeout_seconds=SETTINGS.ffmpeg_timeout_seconds,
        )
        update_status(
            progress=95.0, stage="report_prepare", detail=_analysis_stage_detail("report_prepare")
        )

        report_max_seconds = (
            float(SETTINGS.report_max_seconds) if SETTINGS.report_max_seconds > 0 else None
        )

        def report_progress_callback(value: float, stage: str, detail: str) -> None:
            update_status(
                progress=float(max(95.0, min(value, 99.8))),
                stage=stage,
                detail=detail,
            )

        report_paths = generate_report_artifacts(
            run_dir=Path(run.run_dir),
            metadata=output.metadata,
            metrics=output.metrics,
            charts=output.charts,
            progress=report_progress_callback,
            max_seconds=report_max_seconds,
        )
        update_status(progress=99.9, stage="finalize", detail=_analysis_stage_detail("finalize"))

        done = db.get(AnalysisRun, run_id)
        if done and done.status != "failed":
            done.status = "completed"
            done.progress = 100.0
            done.canonical_wav_path = str(output.canonical_wav_path)
            done.metadata_path = str(output.metadata_path)
            done.metrics_path = str(output.metrics_path)
            done.charts_path = str(output.charts_path)
            done.report_html_path = report_paths.get("html")
            done.report_pdf_path = report_paths.get("pdf")
            db.commit()
            _write_analysis_status(
                Path(done.run_dir),
                status="completed",
                progress=100.0,
                stage="completed",
                detail=_analysis_stage_detail("completed"),
            )
    except Exception as exc:
        failed = db.get(AnalysisRun, run_id)
        status_detail = f"{exc}"
        if failed and failed.status == "failed" and failed.error_message:
            status_detail = failed.error_message
        if failed and failed.status != "failed":
            failed.status = "failed"
            failed.progress = 100.0
            failed.error_message = f"{exc}\n{traceback.format_exc()}"
            status_detail = failed.error_message
            db.commit()
        if failed:
            _write_analysis_status(
                Path(failed.run_dir),
                status="failed",
                progress=100.0,
                stage="failed",
                detail=status_detail,
            )
    finally:
        stop_watchdog.set()
        if watchdog_thread.is_alive():
            watchdog_thread.join(timeout=1.0)
        db.close()


def _run_conversion_job(
    run_id: str,
    formats: list[str],
    mp3_bitrate_kbps: int,
    aac_bitrate_kbps: int,
) -> None:
    db = SessionLocal()
    try:
        run = db.get(AnalysisRun, run_id)
        if not run:
            return
        run_dir = Path(run.run_dir)
        source_path = (
            Path(run.canonical_wav_path) if run.canonical_wav_path else Path(run.input_path)
        )
        if not source_path.exists():
            raise RuntimeError(f"Source audio not found for conversion: {source_path}")

        completed_formats: list[str] = []
        write_conversion_state(
            run_dir,
            {
                "status": "running",
                "progress": 1.0,
                "error_message": None,
                "requested_formats": formats,
                "completed_formats": completed_formats,
            },
        )

        def progress_callback(value: float, completed_format: str) -> None:
            completed_formats.append(completed_format)
            write_conversion_state(
                run_dir,
                {
                    "status": "running",
                    "progress": float(max(0.0, min(value, 99.9))),
                    "error_message": None,
                    "requested_formats": formats,
                    "completed_formats": completed_formats,
                },
            )

        manifest = convert_audio_formats(
            input_path=source_path,
            run_dir=run_dir,
            formats=formats,
            mp3_bitrate_kbps=mp3_bitrate_kbps,
            aac_bitrate_kbps=aac_bitrate_kbps,
            progress=progress_callback,
        )
        completed = [
            str(item.get("format"))
            for item in manifest.get("files", [])
            if isinstance(item, dict) and item.get("format")
        ]
        failed = [
            str(item.get("format"))
            for item in manifest.get("failed", [])
            if isinstance(item, dict) and item.get("format")
        ]
        partial_error = (
            f"Some formats failed: {', '.join(failed)}" if failed and completed else None
        )
        write_conversion_state(
            run_dir,
            {
                "status": "completed",
                "progress": 100.0,
                "error_message": partial_error,
                "requested_formats": formats,
                "completed_formats": completed,
            },
        )
    except Exception as exc:
        run = db.get(AnalysisRun, run_id)
        failure_run_dir = Path(run.run_dir) if run else None
        if failure_run_dir is not None:
            write_conversion_state(
                failure_run_dir,
                {
                    "status": "failed",
                    "progress": 100.0,
                    "error_message": f"{exc}",
                    "requested_formats": formats,
                    "completed_formats": [],
                },
            )
    finally:
        db.close()


def _run_mastering_job(
    run_id: str,
    mode: str,
    preset: str,
    normalization_profile: str | None,
    backend: str,
    reference_path: str | None,
    target_lufs: float | None,
    true_peak_dbfs: float | None,
    optimizer_variants: int,
    max_refine_passes: int,
) -> None:
    db = SessionLocal()
    try:
        run = db.get(AnalysisRun, run_id)
        if not run:
            return
        run_dir = Path(run.run_dir)
        source_path = (
            Path(run.canonical_wav_path) if run.canonical_wav_path else Path(run.input_path)
        )
        if not source_path.exists():
            raise RuntimeError(f"Source audio not found for mastering: {source_path}")

        job_started_at = datetime.now(UTC).isoformat()
        write_mastering_state(
            run_dir,
            {
                "status": "running",
                "progress": 1.0,
                "error_message": None,
                "mode": mode,
                "preset": preset,
                "backend": backend,
                "stage": "prepare",
                "detail": _mastering_stage_detail("prepare"),
                "started_at": job_started_at,
                "stage_started_at": job_started_at,
            },
        )

        # Only reset the stage clock when the stage actually changes, so the
        # UI can tell how long the *current* step has been running rather than
        # how long since the last write.
        current_stage = {"name": "prepare", "since": job_started_at}

        def progress_callback(value: float, stage: str) -> None:
            if stage != current_stage["name"]:
                current_stage["name"] = stage
                current_stage["since"] = datetime.now(UTC).isoformat()
            write_mastering_state(
                run_dir,
                {
                    "status": "running",
                    "progress": float(max(0.0, min(value, 99.9))),
                    "error_message": None,
                    "mode": mode,
                    "preset": preset,
                    "backend": backend,
                    "stage": stage,
                    "detail": _mastering_stage_detail(stage),
                    "started_at": job_started_at,
                    "stage_started_at": current_stage["since"],
                },
            )

        run_mastering(
            source_path=source_path,
            run_dir=run_dir,
            mode=mode,
            preset=preset,
            normalization_profile=normalization_profile,
            backend=backend,
            reference_path=Path(reference_path) if reference_path else None,
            target_lufs=target_lufs,
            true_peak_dbfs=true_peak_dbfs,
            optimizer_variants=optimizer_variants,
            max_refine_passes=max_refine_passes,
            progress=progress_callback,
        )
        write_mastering_state(
            run_dir,
            {
                "status": "completed",
                "progress": 100.0,
                "error_message": None,
                "mode": mode,
                "preset": preset,
                "backend": backend,
                "stage": "done",
                "detail": _mastering_stage_detail("done"),
            },
        )
    except Exception as exc:
        run = db.get(AnalysisRun, run_id)
        failure_run_dir = Path(run.run_dir) if run else None
        if failure_run_dir is not None:
            write_mastering_state(
                failure_run_dir,
                {
                    "status": "failed",
                    "progress": 100.0,
                    "error_message": f"{exc}",
                    "mode": mode,
                    "preset": preset,
                    "backend": backend,
                    "stage": "failed",
                    "detail": f"{exc}",
                },
            )
    finally:
        db.close()


def _safe_load_json(path: str | None) -> dict[str, Any] | None:
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        return None
    try:
        return read_json(p)
    except (OSError, json.JSONDecodeError):
        return None


def _normalize_chart_key(chart_key: str) -> str | None:
    candidate = chart_key.strip()
    if not candidate or not re.fullmatch(r"[A-Za-z0-9_-]+", candidate):
        return None
    return candidate


def _chart_file_path(run_dir: Path, chart_key: str) -> Path:
    return run_dir / "charts" / f"{chart_key}.json"


def _chart_names_for_run(run_dir: Path, aggregate_charts_path: str | None) -> list[str]:
    charts_dir = run_dir / "charts"
    names = sorted(
        p.stem
        for p in charts_dir.glob("*.json")
        if p.is_file() and _normalize_chart_key(p.stem)
    )
    if names:
        return names
    aggregate = _safe_load_json(aggregate_charts_path)
    if isinstance(aggregate, dict):
        return sorted(
            key
            for key, value in aggregate.items()
            if isinstance(value, dict) and _normalize_chart_key(str(key))
        )
    return []


def _load_single_chart(
    run_dir: Path,
    aggregate_charts_path: str | None,
    chart_key: str,
) -> dict[str, Any] | None:
    chart_path = _chart_file_path(run_dir, chart_key)
    if chart_path.exists():
        payload = _safe_load_json(str(chart_path))
        if isinstance(payload, dict):
            return payload
    aggregate = _safe_load_json(aggregate_charts_path)
    if isinstance(aggregate, dict):
        candidate = aggregate.get(chart_key)
        if isinstance(candidate, dict):
            return candidate
    return None


def _load_chart_bundle(
    run_dir: Path,
    aggregate_charts_path: str | None,
) -> dict[str, Any] | None:
    charts_dir = run_dir / "charts"
    bundle: dict[str, Any] = {}
    if charts_dir.exists():
        for chart_file in sorted(charts_dir.glob("*.json")):
            key = _normalize_chart_key(chart_file.stem)
            if not key:
                continue
            payload = _safe_load_json(str(chart_file))
            if isinstance(payload, dict):
                bundle[key] = payload
    if bundle:
        return bundle
    aggregate = _safe_load_json(aggregate_charts_path)
    if isinstance(aggregate, dict):
        return aggregate
    return None


def _compact_chart_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Trim heavy Plotly payload fields so chart delivery remains reliable."""
    result = dict(payload)
    layout = result.get("layout")
    if isinstance(layout, dict):
        slim_layout = dict(layout)
        # Plotly template blobs are large and unnecessary for browser rendering.
        slim_layout.pop("template", None)
        result["layout"] = slim_layout

    traces = result.get("data")
    if not isinstance(traces, list):
        return result

    compacted_traces: list[Any] = []
    for raw_trace in traces:
        if not isinstance(raw_trace, dict):
            compacted_traces.append(raw_trace)
            continue
        trace = dict(raw_trace)
        if str(trace.get("type", "")).lower() == "heatmap":
            z = trace.get("z")
            if (
                isinstance(z, list)
                and z
                and isinstance(z[0], list)
                and len(z) > 1
                and len(z[0]) > 1
            ):
                rows = len(z)
                cols = len(z[0])
                max_rows = 512
                max_cols = 1400
                row_step = max(1, rows // max_rows)
                col_step = max(1, cols // max_cols)
                if row_step > 1 or col_step > 1:
                    z_comp = [row[::col_step] for row in z[::row_step]]
                    trace["z"] = z_comp
                    x = trace.get("x")
                    y = trace.get("y")
                    if isinstance(x, list) and len(x) >= cols:
                        trace["x"] = x[::col_step][: len(z_comp[0])]
                    if isinstance(y, list) and len(y) >= rows:
                        trace["y"] = y[::row_step][: len(z_comp)]
        compacted_traces.append(trace)

    result["data"] = compacted_traces
    return result


def _tiny_loudness_chart(payload: dict[str, Any]) -> dict[str, Any]:
    """Diagnostic mode: return a very small loudness payload to isolate render vs payload-size issues."""
    result = dict(payload)
    traces = result.get("data")
    if not isinstance(traces, list):
        return result

    compacted: list[Any] = []
    for raw_trace in traces:
        if not isinstance(raw_trace, dict):
            compacted.append(raw_trace)
            continue
        trace = dict(raw_trace)
        x = trace.get("x")
        y = trace.get("y")
        if isinstance(x, list) and isinstance(y, list) and len(x) == len(y) and len(x) > 24:
            step = max(1, len(x) // 24)
            trace["x"] = x[::step][:24]
            trace["y"] = y[::step][:24]
        compacted.append(trace)

    layout = result.get("layout")
    if isinstance(layout, dict):
        slim_layout = dict(layout)
        slim_layout.pop("annotations", None)
        slim_layout.pop("shapes", None)
        result["layout"] = slim_layout

    result["data"] = compacted
    return result


def _to_summary(run: AnalysisRun) -> RunSummary:
    runtime_state = _read_analysis_status(Path(run.run_dir))
    stage = runtime_state.get("stage")
    if not isinstance(stage, str) or not stage.strip():
        stage = run.status
    stage_detail = runtime_state.get("detail")
    if not isinstance(stage_detail, str) or not stage_detail.strip():
        stage_detail = _analysis_stage_detail(stage)
    stage_updated_at = _parse_datetime(runtime_state.get("updated_at"))
    return RunSummary(
        id=run.id,
        filename=run.filename,
        status=run.status,
        progress=float(run.progress),
        stage=stage,
        stage_detail=stage_detail,
        stage_updated_at=stage_updated_at,
        error_message=run.error_message,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def _infer_audio_media_type(path: Path) -> str:
    media_type_map = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
        ".aac": "audio/aac",
        ".m4a": "audio/mp4",
        ".aif": "audio/aiff",
        ".aiff": "audio/aiff",
    }
    return media_type_map.get(path.suffix.lower(), "application/octet-stream")


def _delete_run_artifacts(run: AnalysisRun) -> None:
    candidates = {
        Path(run.input_path).parent,
        Path(run.run_dir),
    }
    optional_paths = [
        run.input_path,
        run.canonical_wav_path,
        run.metadata_path,
        run.metrics_path,
        run.charts_path,
        run.report_html_path,
        run.report_pdf_path,
    ]
    for raw in optional_paths:
        if raw:
            candidates.add(Path(raw))
    candidates.add(Path(run.run_dir) / "conversions")
    candidates.add(Path(run.run_dir) / "conversion_status.json")
    candidates.add(Path(run.run_dir) / "conversion_manifest.json")
    candidates.add(Path(run.run_dir) / "mastering")
    candidates.add(Path(run.run_dir) / "mastering_source.wav")
    candidates.add(Path(run.run_dir) / "mastering_status.json")
    candidates.add(Path(run.run_dir) / "mastering_manifest.json")
    candidates.add(Path(run.run_dir) / ANALYSIS_STATUS_FILENAME)
    candidates.add(Path(run.run_dir) / HIDDEN_FROM_HISTORY_FILENAME)
    for path in candidates:
        _safe_delete_path(path)


def _safe_delete_path(path: Path) -> None:
    try:
        resolved = path.resolve()
        data_root = SETTINGS.data_dir.resolve()
        resolved.relative_to(data_root)
    except (OSError, ValueError):
        return
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        return


def _conversion_payload(run_dir: Path) -> dict[str, Any]:
    state = read_conversion_state(run_dir)
    state["manifest"] = read_conversion_manifest(run_dir)
    return state


def _mastering_payload(run_dir: Path) -> dict[str, Any]:
    state = read_mastering_state(run_dir)
    state["manifest"] = read_mastering_manifest(run_dir)
    return state
