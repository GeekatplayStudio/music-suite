from __future__ import annotations

from pathlib import Path

from apps.api.main import _infer_audio_media_type


def test_infer_audio_media_type_known_extensions() -> None:
    assert _infer_audio_media_type(Path("track.wav")) == "audio/wav"
    assert _infer_audio_media_type(Path("track.mp3")) == "audio/mpeg"
    assert _infer_audio_media_type(Path("track.flac")) == "audio/flac"
    assert _infer_audio_media_type(Path("track.ogg")) == "audio/ogg"
    assert _infer_audio_media_type(Path("track.m4a")) == "audio/mp4"
    assert _infer_audio_media_type(Path("track.aiff")) == "audio/aiff"


def test_infer_audio_media_type_unknown_extension() -> None:
    assert _infer_audio_media_type(Path("track.bin")) == "application/octet-stream"
