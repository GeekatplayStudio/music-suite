from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any, BinaryIO

from audioqi.config import get_settings
from audioqi.io.metadata import extract_metadata
from audioqi.storage import sanitize_filename

from .analyze import analyze_to_outputs

SETTINGS = get_settings()
ALLOWED_AUDIO_EXTENSIONS = {".aac", ".aif", ".aiff", ".flac", ".m4a", ".mp3", ".ogg", ".wav"}
UPLOAD_CHUNK_BYTES = 1024 * 1024
SEPARATION_NONE_VALUES = {"", "none", "off", "false", "0", "no", "full", "full-mix", "mix"}


def normalize_separate_target(value: str | None) -> str | None:
    text = (value or "").strip().lower()
    return None if text in SEPARATION_NONE_VALUES else text


def sanitize_song_basename(filename: str) -> str:
    stem = Path(filename or "uploaded-audio").stem
    normalized = re.sub(r"[^a-zA-Z0-9._-]+", "-", stem).strip("-._")
    return normalized or "uploaded-audio"


def analysis_signature(
    *,
    sr: int,
    n_fft: int,
    hop: int,
    smooth: int,
    norm: str,
    edge_mode: str,
    knn_n: int,
    separate: str | None,
) -> dict[str, Any]:
    return {
        "sr": int(sr),
        "n_fft": int(n_fft),
        "hop": int(hop),
        "smooth": int(smooth),
        "norm": norm,
        "edge_mode": edge_mode,
        "knn_n": int(knn_n),
        "separate": separate,
    }


def load_cached_payload(
    path: Path, *, audio_hash: str, signature: dict[str, Any]
) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    cache = document.get("_cache") if isinstance(document, dict) else None
    payload = document.get("payload") if isinstance(document, dict) else None
    if not isinstance(cache, dict) or not isinstance(payload, dict):
        return None
    if cache.get("audio_sha256") != audio_hash or cache.get("analysis") != signature:
        return None
    return payload


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temporary.replace(path)


def _parse_boolish(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in {0, 1}:
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"1", "true", "yes", "on"}:
            return True
        if text in {"0", "false", "no", "off"}:
            return False
    return None


def build_payload_from_outputs(
    *,
    features: list[dict[str, Any]],
    metadata: dict[str, Any],
    edges_path: Path | None,
    source_name: str,
    separated_stem: str | None,
) -> dict[str, Any]:
    columns = metadata.get("columns", {})
    spread_range = columns.get("spectral_spread_khz", {"min": 0, "max": 2.5})
    peak_range_hz = columns.get("peak_hz", {"min": 0, "max": 8_000})
    candidates = [
        metadata.get("ai_generated"),
        (metadata.get("source") or {}).get("ai_generated"),
        (metadata.get("provenance") or {}).get("ai_generated"),
        (metadata.get("settings") or {}).get("ai_generated"),
    ]
    ai_generated = next(
        (result for value in candidates if (result := _parse_boolish(value)) is not None), None
    )
    payload: dict[str, Any] = {
        "frames": features,
        "track": {
            "name": source_name,
            "durationSec": float(metadata.get("audio", {}).get("duration_seconds", 0)),
        },
        "analysis": {
            "sampleRateHz": metadata.get("audio", {}).get("sample_rate"),
            "fftSize": metadata.get("audio", {}).get("n_fft"),
            "hopSize": metadata.get("audio", {}).get("hop_length"),
            "aiGenerated": ai_generated,
            "aiDetectionSource": "metadata" if ai_generated is not None else "not-provided",
        },
        "ranges": {
            "spreadRangeKhz": {
                "min": float(spread_range.get("min", 0)),
                "max": float(spread_range.get("max", 2.5)),
            },
            "peakRangeKhz": {
                "min": float(peak_range_hz.get("min", 0)) / 1000,
                "max": float(peak_range_hz.get("max", 8_000)) / 1000,
            },
        },
        "source": {
            "engine": "python-bgm",
            "mode": "music-suite",
            "separated_stem": separated_stem,
            "ai_generated": ai_generated,
        },
    }
    if edges_path and edges_path.exists():
        edges: dict[str, list[dict[str, Any]]] = {"temporal": [], "knn": []}
        with edges_path.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                mode = (row.get("mode") or "").strip().lower()
                if mode not in edges:
                    continue
                try:
                    edges[mode].append(
                        {
                            "a": int(row.get("i", "-1")),
                            "b": int(row.get("j", "-1")),
                            "weight": float(row.get("weight", "0")),
                        }
                    )
                except ValueError:
                    continue
        if edges["temporal"] or edges["knn"]:
            payload["edges"] = edges
    return payload


def analyze_mapper_upload(
    stream: BinaryIO,
    filename: str,
    *,
    sr: int = 48_000,
    n_fft: int = 2_048,
    hop: int = 512,
    smooth: int = 1,
    norm: str = "none",
    edge_mode: str = "none",
    knn_n: int = 4,
    separate: str | None = None,
) -> dict[str, Any]:
    safe_filename = sanitize_filename(filename)
    if Path(safe_filename).suffix.lower() not in ALLOWED_AUDIO_EXTENSIONS:
        raise ValueError("Unsupported audio file extension.")

    sr = max(8_000, min(96_000, int(sr)))
    n_fft = max(256, min(8_192, int(n_fft)))
    hop = max(64, min(n_fft, int(hop)))
    smooth = max(1, min(31, int(smooth)))
    knn_n = max(1, min(16, int(knn_n)))
    if norm not in {"none", "zscore", "minmax", "robust"}:
        norm = "none"
    if edge_mode not in {"none", "temporal", "knn"}:
        edge_mode = "none"
    separate_target = normalize_separate_target(separate)

    mapper_root = SETTINGS.data_dir / "song-mapper"
    cache_root = mapper_root / "cache"
    temp_root = mapper_root / "tmp"
    cache_root.mkdir(parents=True, exist_ok=True)
    temp_root.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="analysis-", dir=temp_root))
    input_path = temp_dir / safe_filename

    try:
        digest = hashlib.sha256()
        bytes_written = 0
        with input_path.open("wb") as output:
            while chunk := stream.read(UPLOAD_CHUNK_BYTES):
                bytes_written += len(chunk)
                if bytes_written > SETTINGS.max_upload_bytes:
                    raise ValueError(
                        f"Audio upload exceeds the {SETTINGS.max_upload_bytes} byte limit."
                    )
                digest.update(chunk)
                output.write(chunk)
        if bytes_written == 0:
            raise ValueError("Audio upload is empty.")

        metadata = extract_metadata(input_path)
        if not metadata.get("codec") and not metadata.get("format"):
            raise ValueError("No valid audio stream was detected.")
        duration = metadata.get("duration_seconds")
        if isinstance(duration, (int, float)) and duration > SETTINGS.max_audio_duration_seconds:
            raise ValueError(
                f"Audio duration exceeds the {SETTINGS.max_audio_duration_seconds:g} second limit."
            )

        audio_hash = digest.hexdigest()
        signature = analysis_signature(
            sr=sr,
            n_fft=n_fft,
            hop=hop,
            smooth=smooth,
            norm=norm,
            edge_mode=edge_mode,
            knn_n=knn_n,
            separate=separate_target,
        )
        song_key = f"{sanitize_song_basename(safe_filename)}-{audio_hash[:12]}"
        analysis_json_path = cache_root / f"{song_key}.analysis.json"
        cached_payload = load_cached_payload(
            analysis_json_path,
            audio_hash=audio_hash,
            signature=signature,
        )
        if cached_payload is not None:
            return {"ok": True, "cached": True, "payload": cached_payload}

        output_dir = cache_root / song_key
        outputs = analyze_to_outputs(
            input_path=input_path,
            outdir=output_dir,
            sr=sr,
            n_fft=n_fft,
            hop=hop,
            smooth=smooth,
            norm=norm,
            edge_mode=edge_mode,
            knn_n=knn_n,
            separate=separate_target,
        )
        features = json.loads(Path(outputs["features_json"]).read_text(encoding="utf-8"))
        analysis_metadata = json.loads(Path(outputs["metadata_json"]).read_text(encoding="utf-8"))
        payload = build_payload_from_outputs(
            features=features,
            metadata=analysis_metadata,
            edges_path=Path(outputs["edges_csv"]) if outputs["edges_csv"] else None,
            source_name=safe_filename,
            separated_stem=separate_target,
        )
        write_json_atomic(
            analysis_json_path,
            {
                "ok": True,
                "payload": payload,
                "_cache": {"audio_sha256": audio_hash, "analysis": signature},
            },
        )
        return {"ok": True, "cached": False, "payload": payload}
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def clear_mapper_cache() -> dict[str, int | bool]:
    cache_root = SETTINGS.data_dir / "song-mapper" / "cache"
    removed_files = 0
    removed_dirs = 0
    if cache_root.exists():
        for child in cache_root.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
                removed_dirs += 1
            elif child.is_file():
                child.unlink(missing_ok=True)
                removed_files += 1
    return {"ok": True, "removed_files": removed_files, "removed_dirs": removed_dirs}
