from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    project_root: Path
    data_dir: Path
    uploads_dir: Path
    runs_dir: Path
    db_path: Path
    sample_rate: int
    chunk_seconds: float
    ffmpeg_timeout_seconds: int
    report_max_seconds: int
    analysis_stall_timeout_seconds: int
    max_workers: int
    api_host: str
    api_port: int
    max_upload_bytes: int
    max_audio_duration_seconds: float
    cors_origins: tuple[str, ...]


def get_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[1]
    data_dir = Path(os.getenv("AUDIOQI_DATA_DIR", project_root / "data")).resolve()
    uploads_dir = data_dir / "uploads"
    runs_dir = data_dir / "runs"
    db_path = data_dir / "audioqi.db"
    sample_rate = int(os.getenv("AUDIOQI_SAMPLE_RATE", "48000"))
    chunk_seconds = float(os.getenv("AUDIOQI_CHUNK_SECONDS", "10.0"))
    ffmpeg_timeout_seconds = int(os.getenv("AUDIOQI_FFMPEG_TIMEOUT_SECONDS", "900"))
    report_max_seconds = int(os.getenv("AUDIOQI_REPORT_MAX_SECONDS", "300"))
    analysis_stall_timeout_seconds = int(os.getenv("AUDIOQI_ANALYSIS_STALL_TIMEOUT_SECONDS", "600"))
    max_workers = int(os.getenv("AUDIOQI_JOB_WORKERS", "2"))
    api_host = os.getenv("AUDIOQI_API_HOST", "127.0.0.1")
    api_port = int(os.getenv("AUDIOQI_API_PORT", "8008"))
    max_upload_bytes = max(1, int(os.getenv("MUSIC_SUITE_MAX_UPLOAD_BYTES", str(500 * 1024**2))))
    max_audio_duration_seconds = max(
        1.0, float(os.getenv("MUSIC_SUITE_MAX_AUDIO_DURATION_SECONDS", "900"))
    )
    cors_origins = tuple(
        origin.strip()
        for origin in os.getenv(
            "MUSIC_SUITE_CORS_ORIGINS",
            "http://127.0.0.1:3000,http://localhost:3000",
        ).split(",")
        if origin.strip()
    )
    return Settings(
        project_root=project_root,
        data_dir=data_dir,
        uploads_dir=uploads_dir,
        runs_dir=runs_dir,
        db_path=db_path,
        sample_rate=sample_rate,
        chunk_seconds=chunk_seconds,
        ffmpeg_timeout_seconds=ffmpeg_timeout_seconds,
        report_max_seconds=report_max_seconds,
        analysis_stall_timeout_seconds=analysis_stall_timeout_seconds,
        max_workers=max_workers,
        api_host=api_host,
        api_port=api_port,
        max_upload_bytes=max_upload_bytes,
        max_audio_duration_seconds=max_audio_duration_seconds,
        cors_origins=cors_origins,
    )


def ensure_data_dirs(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    settings.runs_dir.mkdir(parents=True, exist_ok=True)
