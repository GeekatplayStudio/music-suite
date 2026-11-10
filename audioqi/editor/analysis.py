"""Tempo, beat grid, key and loudness analysis for editor assets."""

from __future__ import annotations

import logging
import re
from typing import Any

import numpy as np

from audioqi.editor import engines
from audioqi.editor.processing import integrated_lufs

logger = logging.getLogger(__name__)

KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_FLATS = {"DB": 1, "EB": 3, "FB": 4, "GB": 6, "AB": 8, "BB": 10, "CB": 11, "E#": 5, "B#": 0}
# Krumhansl-Kessler key profiles.
_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_KEY_RE = re.compile(r"^\s*([A-Ga-g](?:#|b|♯|♭)?)\s*(major|minor|maj|min|m)?\s*$")
MAX_BEATS = 4000
_ANALYSIS_SR = 22_050


def parse_key(label: str) -> tuple[int, str] | None:
    """``"A minor"`` -> ``(9, "minor")``; None when the text is not a key."""
    match = _KEY_RE.match(label)
    if not match:
        return None
    note = match.group(1).replace("♯", "#").replace("♭", "b")
    note = note[0].upper() + note[1:]
    quality = match.group(2) or "major"
    scale = "minor" if quality == "m" or quality.lower().startswith("min") else "major"
    if note in KEY_NAMES:
        return KEY_NAMES.index(note), scale
    pitch = _FLATS.get(note.upper())
    return None if pitch is None else (pitch, scale)


def key_label(pitch_class: int, scale: str) -> str:
    return f"{KEY_NAMES[pitch_class % 12]} {scale}"


def _regularity(beats: np.ndarray) -> float:
    if beats.size < 4:
        return 0.0
    intervals = np.diff(beats)
    mean = float(intervals.mean())
    if mean <= 0:
        return 0.0
    return float(np.clip(1.0 - 4.0 * float(intervals.std()) / mean, 0.0, 1.0))


def _beats_librosa(y: np.ndarray) -> tuple[np.ndarray, np.ndarray, float | None, float]:
    import librosa

    onset = librosa.onset.onset_strength(y=y, sr=_ANALYSIS_SR)
    tempo, frames = librosa.beat.beat_track(onset_envelope=onset, sr=_ANALYSIS_SR)
    frames = np.asarray(frames, dtype=int)
    beats = librosa.frames_to_time(frames, sr=_ANALYSIS_SR)
    if beats.size == 0:
        return beats, np.array([]), None, 0.0
    fallback = float(np.atleast_1d(tempo)[0]) or None
    contrast = float(onset[frames].mean() / (onset.mean() + 1e-9))
    confidence = _regularity(beats) * float(np.clip(0.5 + (contrast - 1.0) / 4.0, 0.0, 1.0))
    downbeats = np.array([])
    if beats.size >= 8:
        # Assume 4/4 and pick the bar phase whose beats carry the strongest onsets.
        phase = int(np.argmax([onset[frames[p::4]].mean() for p in range(4)]))
        downbeats = beats[phase::4]
    return beats, downbeats, fallback, confidence


def _beats_beat_this(
    mono: np.ndarray, sample_rate: int
) -> tuple[np.ndarray, np.ndarray, float | None, float]:
    from beat_this.inference import Audio2Beats

    tracker = None
    devices = list(dict.fromkeys([engines.torch_device(), "cpu"]))
    for device in devices:
        try:
            tracker = Audio2Beats(checkpoint_path="final0", device=device, dbn=False)
            beats, downbeats = tracker(mono, sample_rate)
            break
        except Exception:
            if device == devices[-1]:
                raise
    beats = np.asarray(beats, dtype=float)
    return beats, np.asarray(downbeats, dtype=float), None, _regularity(beats)


def _estimate_key(y: np.ndarray) -> tuple[int | None, str | None, float]:
    import librosa

    chroma = librosa.feature.chroma_cqt(y=y, sr=_ANALYSIS_SR).mean(axis=1)
    if not np.all(np.isfinite(chroma)) or float(chroma.std()) < 1e-6:
        return None, None, 0.0
    scores: list[tuple[float, int, str]] = []
    for tonic in range(12):
        rotated = np.roll(chroma, -tonic)
        scores.append((float(np.corrcoef(rotated, _MAJOR)[0, 1]), tonic, "major"))
        scores.append((float(np.corrcoef(rotated, _MINOR)[0, 1]), tonic, "minor"))
    scores.sort(reverse=True)
    best, second = scores[0], scores[1]
    margin = min(1.0, (best[0] - second[0]) / 0.1)
    confidence = float(np.clip(0.5 * best[0] + 0.5 * margin, 0.0, 1.0))
    return best[1], best[2], confidence


def analyze(audio: np.ndarray, sample_rate: int) -> dict[str, Any]:
    """Analyse ``(frames, channels)`` audio into the editor ``Analysis`` shape."""
    import librosa

    duration = audio.shape[0] / float(sample_rate)
    result: dict[str, Any] = {
        "bpm": None,
        "bpm_confidence": 0.0,
        "beats": [],
        "downbeats": [],
        "first_downbeat": None,
        "key": None,
        "scale": None,
        "key_label": None,
        "key_confidence": 0.0,
        "lufs": integrated_lufs(audio, sample_rate),
        "duration_seconds": duration,
        "engine": {"beats": "librosa", "key": "krumhansl-schmuckler"},
    }
    mono = audio.mean(axis=1).astype(np.float32)
    if mono.shape[0] < 4096 or float(np.max(np.abs(mono))) < 1e-5:
        return result
    y = librosa.resample(mono, orig_sr=sample_rate, target_sr=_ANALYSIS_SR)

    tracked = None
    if engines.beat_engine() == "beat_this":
        try:
            tracked = _beats_beat_this(mono, sample_rate)
            result["engine"]["beats"] = "beat_this"
        except Exception:
            logger.warning("beat_this failed; falling back to librosa beat tracking.")
    if tracked is None:
        tracked = _beats_librosa(y)
    beats, downbeats, fallback_bpm, confidence = tracked
    if beats.size >= 4:
        result["bpm"] = round(60.0 / float(np.median(np.diff(beats))), 2)
    elif beats.size and fallback_bpm:
        result["bpm"] = round(fallback_bpm, 2)
    result["bpm_confidence"] = round(confidence if result["bpm"] else 0.0, 3)
    result["beats"] = [round(float(t), 4) for t in beats[:MAX_BEATS]]
    result["downbeats"] = [round(float(t), 4) for t in downbeats[:MAX_BEATS]]
    result["first_downbeat"] = result["downbeats"][0] if result["downbeats"] else None

    tonic, scale, key_confidence = _estimate_key(y)
    if tonic is not None and scale is not None:
        result["key"] = KEY_NAMES[tonic]
        result["scale"] = scale
        result["key_label"] = key_label(tonic, scale)
        result["key_confidence"] = round(key_confidence, 3)
    return result


def tempo_rate(source_bpm: float, target_bpm: float) -> float:
    """Playback rate matching tempos, allowing half/double time; closest to 1.0 wins."""
    base = target_bpm / source_bpm
    return min((base, base * 2.0, base / 2.0), key=lambda rate: abs(np.log(rate)))


def key_shift(source: tuple[int, str], target: tuple[int, str]) -> tuple[int, str]:
    """Smallest signed semitone shift (-6..+6) from source key to target key, with a note.

    Relative major/minor pairs share their notes, so modes that differ are compared
    through their relative majors.
    """
    (src_pc, src_scale), (dst_pc, dst_scale) = source, target
    src_label, dst_label = key_label(src_pc, src_scale), key_label(dst_pc, dst_scale)
    if src_scale == dst_scale:
        shift = (dst_pc - src_pc + 6) % 12 - 6
        note = f"{src_label} to {dst_label}: shift {shift:+d} semitones."
        return shift, note if shift else f"Already in {dst_label}; no shift needed."
    src_major = (src_pc + 3) % 12 if src_scale == "minor" else src_pc
    dst_major = (dst_pc + 3) % 12 if dst_scale == "minor" else dst_pc
    shift = (dst_major - src_major + 6) % 12 - 6
    if shift == 0:
        return 0, f"{src_label} and {dst_label} are relative keys (same notes); no shift needed."
    relative = (dst_pc - 3) % 12 if src_scale == "minor" else (dst_pc + 3) % 12
    return shift, (
        f"{src_label} shifted {shift:+d} semitones to {key_label(relative, src_scale)}, "
        f"the relative {src_scale} of {dst_label}."
    )
