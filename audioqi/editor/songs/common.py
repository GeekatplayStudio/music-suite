"""Shared request/result types and helpers for the song engines."""

from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from audioqi.editor import assets, projects
from audioqi.editor.projects import EditorError

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
AUDIO_SUFFIXES = {".flac", ".wav", ".mp3", ".ogg", ".opus", ".m4a", ".aac"}
MAX_STYLE_CHARS = 1000
MAX_LYRICS_CHARS = 3500
MIN_SECONDS = 10
MAX_SECONDS = 600
INSTRUMENTAL_TAG = "[Instrumental]"


@dataclass(frozen=True)
class SongRequest:
    engine: str
    style: str
    lyrics: str = ""
    seconds: int = 120
    instrumental: bool = False
    bpm: int | None = None
    key: str | None = None
    language: str = "en"
    seed: int | None = None
    model: str | None = None
    think: bool = True

    @property
    def sings(self) -> bool:
        return not self.instrumental and bool(self.lyrics.strip())


@dataclass
class ProducedAudio:
    """Encoded audio returned by an engine, plus what it reports about itself."""

    content: bytes
    suffix: str
    engine: str
    model: str
    info: dict[str, Any] = field(default_factory=dict)


def loopback_url(raw: str, what: str) -> str:
    """Validate a local engine address: plain http, loopback host, no credentials."""
    value = raw.strip().rstrip("/")
    parsed = urlparse(value)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in LOOPBACK_HOSTS
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise EditorError(f"{what} must be a plain http address on this machine (loopback).")
    return value


def suffix_for(name: str, content_type: str = "", default: str = ".mp3") -> str:
    suffix = Path(urlparse(name).path).suffix.lower()
    if suffix in AUDIO_SUFFIXES:
        return suffix
    kind = content_type.split(";")[0].strip().lower()
    by_type = {
        "audio/flac": ".flac",
        "audio/x-flac": ".flac",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/wave": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/ogg": ".ogg",
        "audio/opus": ".opus",
    }
    return by_type.get(kind, default)


def check_size(content: bytes) -> bytes:
    if not content:
        raise EditorError("The engine finished but returned no audio.")
    if len(content) > projects.SETTINGS.max_upload_bytes:
        raise EditorError("The generated song is larger than the upload limit.")
    return content


def describe(request: SongRequest) -> str:
    """One prompt line carrying style plus the musical constraints the user set."""
    parts = [request.style.strip()]
    if request.bpm:
        parts.append(f"{request.bpm} BPM")
    if request.key:
        parts.append(f"in {request.key}")
    if request.instrumental:
        parts.append("instrumental, no vocals")
    return ", ".join(part for part in parts if part)


def prompt_with_lyrics(request: SongRequest, limit: int) -> str:
    """For engines that take a single prompt: style first, then the lyrics to sing."""
    text = describe(request)
    if request.sings:
        text = f"{text}\n\nLyrics:\n{request.lyrics.strip()}"
    if len(text) > limit:
        raise EditorError(f"Style and lyrics together must stay under {limit} characters here.")
    return text


def song_title(request: SongRequest) -> str:
    first_line = next((ln.strip() for ln in request.lyrics.splitlines() if _sung(ln)), "")
    base = first_line or request.style.strip()
    return assets.display_name(base[:48], "Song")


def _sung(line: str) -> bool:
    stripped = line.strip()
    return bool(stripped) and not (stripped.startswith("[") and stripped.endswith("]"))


def import_song(project_id: str, request: SongRequest, produced: ProducedAudio) -> dict[str, Any]:
    check_size(produced.content)
    suffix = produced.suffix if produced.suffix in AUDIO_SUFFIXES else ".mp3"
    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        staged = Path(tmp) / f"song{suffix}"
        staged.write_bytes(produced.content)
        record = assets.import_audio_file(
            project_id,
            staged,
            name=f"{song_title(request)} ({produced.engine})",
            source="process",
        )
    return {
        "asset": assets.public(record),
        "engine": produced.engine,
        "model": produced.model,
        "info": produced.info,
    }
