from __future__ import annotations

import json
import subprocess
from pathlib import Path
from shutil import which
from typing import Any

from mutagen import File as MutagenFile

_DISPLAY_TAG_ALIASES: dict[str, str] = {
    "tit2": "title",
    "title": "title",
    "tpe1": "artist",
    "artist": "artist",
    "tpe2": "album artist",
    "album_artist": "album artist",
    "album artist": "album artist",
    "talb": "album",
    "album": "album",
    "trck": "track",
    "track": "track",
    "tpos": "disc",
    "disc": "disc",
    "tcon": "genre",
    "genre": "genre",
    "tdrc": "date",
    "date": "date",
    "year": "date",
    "tcom": "composer",
    "composer": "composer",
    "comm": "comment",
    "comment": "comment",
    "description": "description",
    "uslt": "lyrics",
    "lyrics": "lyrics",
    "tbpm": "bpm",
    "bpm": "bpm",
    "tkey": "key",
    "key": "key",
    "language": "language",
    "publisher": "publisher",
    "copyright": "copyright",
    "isrc": "isrc",
}

_DISPLAY_TAG_PRIORITY: dict[str, int] = {
    "title": 0,
    "artist": 1,
    "album artist": 2,
    "album": 3,
    "track": 4,
    "disc": 5,
    "genre": 6,
    "date": 7,
    "composer": 8,
    "comment": 9,
    "description": 10,
    "lyrics": 11,
    "bpm": 12,
    "key": 13,
    "language": 14,
    "publisher": 15,
    "copyright": 16,
    "isrc": 17,
}

_TECHNICAL_TAG_KEYS = {
    "tsse",
    "encoder",
    "encoded_by",
    "software",
    "writing_application",
    "writing library",
    "major_brand",
    "minor_version",
    "compatible_brands",
}


def _ffprobe_payload(path: Path) -> dict[str, Any] | None:
    if which("ffprobe") is None:
        return None
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0 or not proc.stdout:
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None


def _mutagen_payload(path: Path) -> dict[str, Any]:
    payload: dict[str, Any] = {"tags": {}, "info": {}}
    m = MutagenFile(path)
    if m is None:
        return payload
    if m.tags:
        payload["tags"] = {str(k): str(v) for k, v in m.tags.items()}
    info = getattr(m, "info", None)
    if info is not None:
        for attr in ("length", "sample_rate", "channels", "bitrate", "bits_per_sample"):
            if hasattr(info, attr):
                payload["info"][attr] = getattr(info, attr)
    return payload


def extract_metadata(path: Path) -> dict[str, Any]:
    ffprobe = _ffprobe_payload(path) or {}
    muta = _mutagen_payload(path)
    audio_stream = None
    for stream in ffprobe.get("streams", []):
        if stream.get("codec_type") == "audio":
            audio_stream = stream
            break

    format_block = ffprobe.get("format", {})
    ffprobe_format_tags = _coerce_tags(format_block.get("tags"))
    ffprobe_stream_tags = _coerce_tags((audio_stream or {}).get("tags"))
    # Keep stream-only tags visible without clobbering same-name format tags.
    stream_only_tags = {
        f"stream.{key}": value
        for key, value in ffprobe_stream_tags.items()
        if key not in ffprobe_format_tags
    }
    merged_tags = {**ffprobe_format_tags, **stream_only_tags, **_coerce_tags(muta.get("tags", {}))}
    metadata: dict[str, Any] = {
        "path": str(path),
        "filename": path.name,
        "format": format_block.get("format_name"),
        "codec": (audio_stream or {}).get("codec_name"),
        "duration_seconds": _coerce_float(format_block.get("duration"))
        or muta["info"].get("length"),
        "sample_rate": _coerce_int((audio_stream or {}).get("sample_rate"))
        or muta["info"].get("sample_rate"),
        "channels": (audio_stream or {}).get("channels") or muta["info"].get("channels"),
        "bitrate": _coerce_int(format_block.get("bit_rate")) or muta["info"].get("bitrate"),
        "bit_depth": (audio_stream or {}).get("bits_per_sample")
        or muta["info"].get("bits_per_sample"),
        "tags": merged_tags,
        "ffprobe": ffprobe if ffprobe else None,
    }
    return normalize_metadata_payload(metadata)


def normalize_metadata_payload(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    normalized = dict(metadata)
    tags = _coerce_tags(normalized.get("tags"))
    display_tags, suppressed_tag_keys = _build_display_tags(tags)
    normalized["tags"] = tags
    normalized["display_tags"] = display_tags
    normalized["suppressed_tag_keys"] = suppressed_tag_keys
    normalized["suppressed_tag_count"] = len(suppressed_tag_keys)
    return normalized


def _build_display_tags(tags: dict[str, str]) -> tuple[dict[str, str], list[str]]:
    selected: dict[str, tuple[str, int]] = {}
    suppressed: list[str] = []

    for raw_key, raw_value in tags.items():
        raw_text = str(raw_value)
        if not raw_text.strip():
            continue
        if _should_suppress_tag(raw_key, raw_text):
            suppressed.append(raw_key)
            continue
        value = _clean_tag_value(raw_text)

        label = _display_tag_label(raw_key)
        preference = _display_tag_preference(raw_key, label)
        current = selected.get(label)
        if current is None or preference < current[1]:
            selected[label] = (value, preference)

    ordered = sorted(
        selected.items(),
        key=lambda item: (_DISPLAY_TAG_PRIORITY.get(item[0], 100), item[0]),
    )
    return ({key: value for key, (value, _) in ordered}, sorted(suppressed))


def _clean_tag_value(value: str) -> str:
    compact = " ".join(str(value).split())
    if len(compact) <= 220:
        return compact
    return f"{compact[:217]}..."


def _should_suppress_tag(key: str, value: str) -> bool:
    normalized_key = _normalize_raw_tag_key(key)
    if normalized_key in _TECHNICAL_TAG_KEYS:
        return True
    if any(token in normalized_key for token in ("prompt", "workflow", "comfy")):
        return True
    if _looks_like_structured_blob(value):
        return True
    return len(value) > 220


def _looks_like_structured_blob(value: str) -> bool:
    compact = value.strip()
    if len(compact) < 64:
        return False
    if not (
        (compact.startswith("{") and compact.endswith("}"))
        or (compact.startswith("[") and compact.endswith("]"))
    ):
        return False
    try:
        parsed = json.loads(compact)
    except json.JSONDecodeError:
        return False
    return isinstance(parsed, (dict, list))


def _display_tag_label(key: str) -> str:
    normalized_key = _normalize_raw_tag_key(key)
    label = _DISPLAY_TAG_ALIASES.get(normalized_key, normalized_key.replace("_", " "))
    return label.strip() or key


def _display_tag_preference(raw_key: str, label: str) -> int:
    normalized_key = _normalize_raw_tag_key(raw_key)
    if normalized_key == label:
        return 0
    if normalized_key in _DISPLAY_TAG_ALIASES:
        return 1
    return 2


def _normalize_raw_tag_key(key: str) -> str:
    normalized = str(key).strip().lower()
    if normalized.startswith("stream."):
        normalized = normalized.removeprefix("stream.")
    if normalized.startswith("txxx:"):
        normalized = normalized.split(":", 1)[1].strip()
    if normalized.startswith("comm:"):
        normalized = "comment"
    return normalized


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_tags(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {str(k): str(v) for k, v in value.items() if v is not None}
