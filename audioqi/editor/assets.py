"""Audio assets of an editor project: canonical float32 WAV plus a JSON record."""

from __future__ import annotations

import contextlib
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from audioqi.editor import projects
from audioqi.editor.projects import EditorError, NotFoundError
from audioqi.io.decode import decode_to_canonical

ASSET_FIELDS = (
    "id",
    "name",
    "duration_seconds",
    "sample_rate",
    "channels",
    "source",
    "parent_id",
    "label",
    "created_at",
)
SOURCES = {"upload", "run", "stem", "process"}
MAX_ASSET_NAME_CHARS = 200


def _assets_dir(project_id: str) -> Path:
    return projects.require_project(project_id) / "assets"


def asset_paths(project_id: str, asset_id: str) -> tuple[Path, Path]:
    """(wav, json) paths. Rejects non-canonical IDs before touching the filesystem."""
    if not projects.is_canonical_uuid(asset_id):
        raise NotFoundError("Asset not found.")
    base = _assets_dir(project_id)
    return base / f"{asset_id}.wav", base / f"{asset_id}.json"


def analysis_path(project_id: str, asset_id: str) -> Path:
    if not projects.is_canonical_uuid(asset_id):
        raise NotFoundError("Asset not found.")
    return projects.require_project(project_id) / "analysis" / f"{asset_id}.json"


def public(record: dict[str, Any]) -> dict[str, Any]:
    return {key: record.get(key) for key in ASSET_FIELDS}


def display_name(value: str, fallback: str = "audio") -> str:
    cleaned = "".join(ch for ch in value if ch.isprintable()).strip()
    return cleaned[:MAX_ASSET_NAME_CHARS] or fallback


def get_asset(project_id: str, asset_id: str) -> dict[str, Any]:
    wav, meta = asset_paths(project_id, asset_id)
    record = projects.read_json_safe(meta)
    if record is None or not wav.is_file():
        raise NotFoundError("Asset not found.")
    return public(record)


def list_assets(project_id: str) -> list[dict[str, Any]]:
    base = _assets_dir(project_id)
    found: list[dict[str, Any]] = []
    if base.is_dir():
        for meta in base.glob("*.json"):
            if not projects.is_canonical_uuid(meta.stem):
                continue
            record = projects.read_json_safe(meta)
            if record is not None and meta.with_suffix(".wav").is_file():
                found.append(public(record))
    found.sort(key=lambda item: str(item.get("created_at") or ""))
    return found


def _register(
    project_id: str,
    asset_id: str,
    *,
    name: str,
    source: str,
    parent_id: str | None,
    label: str | None,
) -> dict[str, Any]:
    wav, meta = asset_paths(project_id, asset_id)
    try:
        info = sf.info(str(wav))
    except Exception as exc:
        with contextlib.suppress(OSError):
            wav.unlink(missing_ok=True)
        raise EditorError("No valid audio stream was detected.", 415) from exc
    if info.frames <= 0 or info.samplerate <= 0:
        wav.unlink(missing_ok=True)
        raise EditorError("No valid audio stream was detected.", 415)
    record = {
        "id": asset_id,
        "name": display_name(name),
        "duration_seconds": float(info.frames) / float(info.samplerate),
        "sample_rate": int(info.samplerate),
        "channels": int(info.channels),
        "source": source if source in SOURCES else "process",
        "parent_id": parent_id,
        "label": label,
        "created_at": projects.now_iso(),
    }
    projects.write_json_atomic(meta, record)
    projects.touch_project(project_id)
    return record


def save_audio_asset(
    project_id: str,
    audio: np.ndarray,
    sample_rate: int,
    *,
    name: str,
    source: str,
    parent_id: str | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Store an ``(frames, channels)`` float array as a new asset."""
    data = np.asarray(audio, dtype=np.float32)
    if data.ndim == 1:
        data = data[:, None]
    if data.shape[0] == 0:
        raise EditorError("Processing produced no audio.")
    data = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)
    asset_id = projects.new_id()
    wav, _ = asset_paths(project_id, asset_id)
    wav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(wav), data, int(sample_rate), subtype="FLOAT", format="WAV")
    return _register(
        project_id, asset_id, name=name, source=source, parent_id=parent_id, label=label
    )


def import_audio_file(project_id: str, src: Path, *, name: str, source: str) -> dict[str, Any]:
    """Decode any supported audio file into a canonical WAV asset (channel count kept)."""
    settings = projects.SETTINGS
    asset_id = projects.new_id()
    wav, _ = asset_paths(project_id, asset_id)
    try:
        decode_to_canonical(
            src,
            wav,
            target_sr=settings.sample_rate,
            ffmpeg_timeout_seconds=settings.ffmpeg_timeout_seconds,
        )
    except Exception as exc:
        with contextlib.suppress(OSError):
            wav.unlink(missing_ok=True)
        raise EditorError("Could not decode the audio file.", 415) from exc
    record = _register(project_id, asset_id, name=name, source=source, parent_id=None, label=None)
    if record["duration_seconds"] > settings.max_audio_duration_seconds:
        delete_asset(project_id, asset_id)
        raise EditorError(
            f"Audio duration exceeds the {settings.max_audio_duration_seconds:g} second limit.",
            413,
        )
    return record


def load_audio(project_id: str, asset_id: str) -> tuple[np.ndarray, int]:
    """Return ``(frames, channels)`` float32 audio and its sample rate."""
    wav, _ = asset_paths(project_id, asset_id)
    if not wav.is_file():
        raise NotFoundError("Asset not found.")
    data, sample_rate = sf.read(str(wav), dtype="float32", always_2d=True)
    return data, int(sample_rate)


PEAK_BUCKET_FRAMES = 128
_PEAK_MAGIC = 0x4B50534D  # "MSPK", little-endian


def peaks_file(project_id: str, asset_id: str) -> Path:
    """Waveform overview of an asset, computed once and cached beside it.

    Layout: four little-endian uint32 (magic, sample rate, frames, buckets), then one
    int8 minimum per bucket of 128 frames, then one int8 maximum per bucket.
    """
    wav, _ = asset_paths(project_id, asset_id)
    if not wav.is_file():
        raise NotFoundError("Asset not found.")
    path = wav.with_suffix(".peaks")
    if path.is_file() and path.stat().st_mtime >= wav.stat().st_mtime:
        return path
    lows: list[np.ndarray] = []
    highs: list[np.ndarray] = []
    with sf.SoundFile(str(wav)) as handle:
        sample_rate, frames = int(handle.samplerate), int(handle.frames)
        # Reading in blocks keeps memory flat however long the file is.
        for block in handle.blocks(
            blocksize=PEAK_BUCKET_FRAMES * 4096, dtype="float32", always_2d=True
        ):
            pad = (-block.shape[0]) % PEAK_BUCKET_FRAMES
            if pad:
                block = np.pad(block, ((0, pad), (0, 0)), mode="edge")
            grouped = block.reshape(-1, PEAK_BUCKET_FRAMES * block.shape[1])
            lows.append(grouped.min(axis=1))
            highs.append(grouped.max(axis=1))
    low = np.concatenate(lows) if lows else np.zeros(0, dtype=np.float32)
    high = np.concatenate(highs) if highs else np.zeros(0, dtype=np.float32)

    def pack(values: np.ndarray, rounder: Any) -> bytes:
        return np.clip(rounder(values * 127.0), -127, 127).astype(np.int8).tobytes()

    header = np.array([_PEAK_MAGIC, sample_rate, frames, low.shape[0]], dtype="<u4").tobytes()
    # Rounding outwards means a peak is never drawn smaller than it is.
    projects.write_bytes_atomic(path, header + pack(low, np.floor) + pack(high, np.ceil))
    return path


def delete_asset(project_id: str, asset_id: str) -> None:
    wav, meta = asset_paths(project_id, asset_id)
    if not wav.is_file() and not meta.is_file():
        raise NotFoundError("Asset not found.")
    for path in (wav, meta, wav.with_suffix(".peaks"), analysis_path(project_id, asset_id)):
        with contextlib.suppress(OSError):
            path.unlink(missing_ok=True)
    projects.touch_project(project_id)
