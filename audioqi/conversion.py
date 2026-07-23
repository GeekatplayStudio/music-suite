from __future__ import annotations

import shutil
import subprocess
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from audioqi.io.decode import ffmpeg_available
from audioqi.io.metadata import extract_metadata
from audioqi.storage import read_json, write_json

SUPPORTED_CONVERSION_FORMATS = ("mp3", "wav", "flac", "aac", "ogg", "m4a")

ConversionProgressCallback = Callable[[float, str], None]


def conversion_status_path(run_dir: Path) -> Path:
    return run_dir / "conversion_status.json"


def conversion_manifest_path(run_dir: Path) -> Path:
    return run_dir / "conversion_manifest.json"


def conversion_output_dir(run_dir: Path) -> Path:
    return run_dir / "conversions"


def default_conversion_state() -> dict[str, Any]:
    return {
        "status": "idle",
        "progress": 0.0,
        "error_message": None,
        "requested_formats": [],
        "completed_formats": [],
        "updated_at": _utc_now_iso(),
    }


def read_conversion_state(run_dir: Path) -> dict[str, Any]:
    path = conversion_status_path(run_dir)
    if not path.exists():
        return default_conversion_state()
    try:
        payload = read_json(path)
    except (OSError, ValueError):
        return default_conversion_state()
    state = default_conversion_state()
    state.update({k: v for k, v in payload.items() if k in state})
    return state


def write_conversion_state(run_dir: Path, state: dict[str, Any]) -> None:
    payload = default_conversion_state()
    payload.update(state)
    payload["updated_at"] = _utc_now_iso()
    write_json(conversion_status_path(run_dir), payload)


def read_conversion_manifest(run_dir: Path) -> dict[str, Any] | None:
    path = conversion_manifest_path(run_dir)
    if not path.exists():
        return None
    try:
        return read_json(path)
    except (OSError, ValueError):
        return None


def reset_conversion_outputs(run_dir: Path) -> None:
    out_dir = conversion_output_dir(run_dir)
    if out_dir.exists():
        shutil.rmtree(out_dir, ignore_errors=True)
    for p in (conversion_status_path(run_dir), conversion_manifest_path(run_dir)):
        try:
            p.unlink(missing_ok=True)
        except OSError:
            continue


def parse_requested_formats(formats: str) -> list[str]:
    seen: set[str] = set()
    parsed: list[str] = []
    for raw in formats.split(","):
        fmt = raw.strip().lower()
        if not fmt or fmt in seen:
            continue
        if fmt in SUPPORTED_CONVERSION_FORMATS:
            parsed.append(fmt)
            seen.add(fmt)
    return parsed


def convert_audio_formats(
    input_path: Path,
    run_dir: Path,
    formats: list[str],
    mp3_bitrate_kbps: int = 320,
    aac_bitrate_kbps: int = 256,
    progress: ConversionProgressCallback | None = None,
) -> dict[str, Any]:
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg not found on PATH. Conversion requires ffmpeg.")
    if not formats:
        raise RuntimeError("No conversion formats selected.")

    out_dir = conversion_output_dir(run_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    files: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    total = max(1, len(formats))
    for idx, fmt in enumerate(formats):
        output_path = out_dir / f"{input_path.stem}.{fmt}"
        try:
            _run_ffmpeg_conversion(
                input_path=input_path,
                output_path=output_path,
                fmt=fmt,
                mp3_bitrate_kbps=mp3_bitrate_kbps,
                aac_bitrate_kbps=aac_bitrate_kbps,
            )
            meta = extract_metadata(output_path)
            size_bytes = output_path.stat().st_size if output_path.exists() else 0
            files.append(
                {
                    "format": fmt,
                    "filename": output_path.name,
                    "path": str(output_path),
                    "size_bytes": size_bytes,
                    "size_megabytes": round(size_bytes / (1024 * 1024), 3),
                    "codec": meta.get("codec"),
                    "container": meta.get("format"),
                    "duration_seconds": meta.get("duration_seconds"),
                    "sample_rate": meta.get("sample_rate"),
                    "channels": meta.get("channels"),
                    "bitrate": meta.get("bitrate"),
                }
            )
        except Exception as exc:
            failed.append({"format": fmt, "error": str(exc)})
        if progress:
            progress(100.0 * (idx + 1) / total, fmt)

    manifest = {
        "created_at": _utc_now_iso(),
        "source_file": str(input_path),
        "source_filename": input_path.name,
        "requested_formats": formats,
        "files": files,
        "failed": failed,
    }
    write_json(conversion_manifest_path(run_dir), manifest)
    if not files:
        failure_desc = ", ".join(f"{item['format']}: {item['error']}" for item in failed[:3])
        raise RuntimeError(f"All requested conversions failed. {failure_desc}".strip())
    return manifest


def _run_ffmpeg_conversion(
    input_path: Path,
    output_path: Path,
    fmt: str,
    mp3_bitrate_kbps: int,
    aac_bitrate_kbps: int,
) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(input_path),
        "-vn",
    ]
    if fmt == "mp3":
        cmd.extend(["-c:a", "libmp3lame", "-b:a", f"{mp3_bitrate_kbps}k"])
    elif fmt == "wav":
        cmd.extend(["-c:a", "pcm_s16le"])
    elif fmt == "flac":
        cmd.extend(["-c:a", "flac", "-compression_level", "8"])
    elif fmt == "aac":
        cmd.extend(["-c:a", "aac", "-b:a", f"{aac_bitrate_kbps}k"])
    elif fmt == "ogg":
        cmd.extend(["-c:a", "libvorbis", "-q:a", "5"])
    elif fmt == "m4a":
        cmd.extend(["-c:a", "aac", "-b:a", f"{aac_bitrate_kbps}k"])
    else:
        raise RuntimeError(f"Unsupported conversion format: {fmt}")
    cmd.append(str(output_path))

    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or "unknown ffmpeg error"
        raise RuntimeError(f"ffmpeg conversion failed for {fmt}: {stderr}")


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()
