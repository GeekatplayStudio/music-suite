"""Runtime detection of optional processing engines.

Only the base dependencies are required. Each capability picks the best engine
that is importable right now and reports honestly which one it used.
Set ``MUSIC_SUITE_EDITOR_FORCE_FALLBACK=1`` to ignore every optional engine.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import sys
from typing import Any

FORCE_FALLBACK_ENV = "MUSIC_SUITE_EDITOR_FORCE_FALLBACK"


def force_fallback() -> bool:
    return os.getenv(FORCE_FALLBACK_ENV, "") == "1"


def has_module(name: str) -> bool:
    if force_fallback():
        return False
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def has_rubberband_cli() -> bool:
    return not force_fallback() and shutil.which("rubberband") is not None


def stretch_engines() -> list[str]:
    """Time-stretch / pitch-shift engines, best first. ``librosa`` is always present."""
    found: list[str] = []
    if has_module("pedalboard"):
        found.append("pedalboard-rubberband")
    if has_rubberband_cli():
        found.append("rubberband-cli")
    found.append("librosa")
    return found


def separation_engines() -> list[str]:
    found: list[str] = []
    if has_module("torch"):
        if has_module("audio_separator"):
            found.append("audio-separator")
        if has_module("demucs"):
            found.append("demucs")
    found.append("basic-hpss")
    return found


def stem_options() -> list[int]:
    return [2, 4, 6] if len(separation_engines()) > 1 else [2, 4]


def denoise_engines() -> list[str]:
    found: list[str] = []
    if has_module("noisereduce"):
        found.append("noisereduce")
    found.append("spectral-gate")
    if has_ffmpeg():
        found.append("ffmpeg-afftdn")
    return found


def beat_engine() -> str:
    if has_module("torch") and has_module("beat_this"):
        return "beat_this"
    return "librosa"


def plugin_hosting_available() -> bool:
    return has_module("pedalboard") and sys.platform in ("darwin", "win32")


def plugin_formats() -> list[str]:
    if not plugin_hosting_available():
        return []
    return ["vst3", "au"] if sys.platform == "darwin" else ["vst3"]


def torch_device() -> str:
    """Best torch device, checked defensively. Falls back to CPU on any doubt."""
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        mps = getattr(torch.backends, "mps", None)
        if mps is not None and mps.is_available():
            return "mps"
    except Exception:
        return "cpu"
    return "cpu"


def accelerator() -> str:
    """What PyTorch would run on, read from its build tag so PyTorch is not imported here."""
    if force_fallback() or not has_module("torch"):
        return "none"
    import importlib.metadata

    try:
        version = importlib.metadata.version("torch")
    except importlib.metadata.PackageNotFoundError:
        return "none"
    if "+cu" in version:
        return "cuda"
    if sys.platform == "darwin":
        return "mps"
    if sys.platform.startswith("linux") and "+cpu" not in version:
        return "cuda-if-present"
    return "cpu"


def _transcription_engine() -> str:
    from audioqi.editor import composition

    return composition.transcription_engine()


def capabilities() -> dict[str, Any]:
    separation = separation_engines()
    stretch = stretch_engines()[0]
    return {
        "separation": {
            "available": True,
            "engine": separation[0],
            "engines": separation,
            "stem_options": stem_options(),
            # Drum kit pieces and lead/backing vocals (audio-separator's finer models).
            "detail": "audio-separator" in separation,
            "accelerator": accelerator(),
        },
        "stretch": {"engine": stretch},
        "pitch": {"engine": stretch},
        "denoise": {"engines": denoise_engines()},
        "beats": {"engine": beat_engine()},
        "plugins": {"available": plugin_hosting_available(), "formats": plugin_formats()},
        "restoration": ["declick", "dehum", "declip", "dereverb", "spectral_repair"],
        "warp": True,
        "transcription": {"engine": _transcription_engine()},
    }
