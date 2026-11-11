"""Read an existing song into a starting point for a new one.

Measures tempo, key, metre, length and a few timbre features, and turns them into
values for the generate form: ``bpm``, ``keyscale``, ``timesignature``, ``duration``
and a short ``caption`` of style tags. Every tag traces to a measured number; genre
and instruments are not guessed, so the caption is a draft for the user to finish.
"""

from __future__ import annotations

from itertools import pairwise
from typing import Any

import numpy as np

from audioqi.editor import analysis, assets

_SR = 22_050
# Timbre is read from a minute in the middle of the song, where it is usually fullest.
_EXCERPT_SECONDS = 60.0
_ENHARMONIC = {"D#": "Eb", "G#": "Ab", "A#": "Bb"}


def keyscale(key: str | None, scale: str | None) -> str | None:
    """The analysis key in the generate form's spelling ("A# minor" becomes "Bb minor")."""
    if not key or scale not in ("major", "minor"):
        return None
    return f"{_ENHARMONIC.get(key, key)} {scale}"


def beats_per_bar(beats: list[float], downbeats: list[float]) -> int | None:
    """3 or 4 from how many beats fall between downbeats; None when unclear."""
    if len(downbeats) < 3 or len(beats) < 8:
        return None
    marks = np.asarray(beats)
    counts = [
        int(np.sum((marks >= start - 1e-3) & (marks < end - 1e-3)))
        for start, end in pairwise(downbeats)
    ]
    typical = int(np.median(counts)) if counts else 0
    return typical if typical in (3, 4) else None


def timbre(mono: np.ndarray, sample_rate: int) -> dict[str, float]:
    """Mean spectral centroid, zero-crossing rate, RMS, flatness and low/mid/high energy split."""
    import librosa

    if sample_rate != _SR:
        mono = librosa.resample(mono, orig_sr=sample_rate, target_sr=_SR)
    excerpt = int(_EXCERPT_SECONDS * _SR)
    if mono.shape[0] > excerpt:
        start = (mono.shape[0] - excerpt) // 2
        mono = mono[start : start + excerpt]
    spectrum = np.abs(librosa.stft(mono, n_fft=2048, hop_length=512)) ** 2
    freqs = librosa.fft_frequencies(sr=_SR, n_fft=2048)
    total = float(spectrum.sum()) or 1.0
    return {
        "centroid_hz": float(
            np.mean(librosa.feature.spectral_centroid(S=np.sqrt(spectrum), sr=_SR))
        ),
        "zcr": float(np.mean(librosa.feature.zero_crossing_rate(mono))),
        "rms": float(np.mean(librosa.feature.rms(y=mono))),
        "flatness": float(np.mean(librosa.feature.spectral_flatness(S=np.sqrt(spectrum)))),
        "low": float(spectrum[freqs < 250].sum()) / total,
        "mid": float(spectrum[(freqs >= 250) & (freqs < 4000)].sum()) / total,
        "high": float(spectrum[freqs >= 4000].sum()) / total,
    }


def caption_tags(bpm: float | None, scale: str | None, features: dict[str, float]) -> list[str]:
    """Short style tags in the order the music engine reads captions: feel, mood, sound."""
    tags: list[str] = []
    if bpm:
        if bpm < 75:
            tags.append("slow, spacious")
        elif bpm < 100:
            tags.append("laid-back groove")
        elif bpm < 120:
            tags.append("steady mid-tempo")
        elif bpm < 140:
            tags.append("upbeat, driving")
        else:
            tags.append("fast, energetic")
    if scale == "minor":
        tags.append("moody minor key")
    elif scale == "major":
        tags.append("uplifting major key")
    centroid = features.get("centroid_hz", 0.0)
    if centroid and centroid < 1200:
        tags.append("dark, warm tone")
    elif centroid > 2400:
        tags.append("bright, crisp highs")
    zcr = features.get("zcr", 0.0)
    if zcr > 0.12:
        tags.append("punchy percussive rhythm")
    elif zcr and zcr < 0.04:
        tags.append("smooth sustained melodies")
    if features.get("low", 0.0) > 0.6:
        tags.append("heavy bass")
    rms = features.get("rms", 0.0)
    if rms > 0.08:
        tags.append("dense, loud mix")
    elif rms and rms < 0.015:
        tags.append("soft, intimate")
    if features.get("flatness", 0.0) > 0.2:
        tags.append("noisy, textured")
    return tags


def describe(project_id: str, asset_id: str) -> dict[str, Any]:
    """Form values and the measurements behind them, for one clip of a project."""
    record = assets.get_asset(project_id, asset_id)
    audio, sample_rate = assets.load_audio(project_id, asset_id)
    measured = analysis.analyze(audio, sample_rate)
    mono = audio.mean(axis=1).astype(np.float32)
    features = (
        timbre(mono, sample_rate)
        if mono.shape[0] >= 4096 and float(np.max(np.abs(mono))) >= 1e-5
        else {}
    )

    bpm = measured.get("bpm")
    key = keyscale(measured.get("key"), measured.get("scale"))
    metre = beats_per_bar(measured.get("beats") or [], measured.get("downbeats") or [])
    duration = float(measured.get("duration_seconds") or 0.0)
    tags = caption_tags(bpm, measured.get("scale"), features)

    fields: dict[str, Any] = {"duration": round(duration)}
    if bpm:
        fields["bpm"] = round(bpm)
    if key:
        fields["keyscale"] = key
    if metre:
        fields["timesignature"] = str(metre)
    if tags:
        fields["caption"] = ", ".join(tags)
    return {
        "name": record.get("name") or "song",
        "fields": fields,
        "measured": {
            "bpm": bpm,
            "bpm_confidence": measured.get("bpm_confidence"),
            "key": key,
            "key_confidence": measured.get("key_confidence"),
            "beats_per_bar": metre,
            "duration_seconds": duration,
            "lufs": measured.get("lufs"),
            **{k: round(v, 4) for k, v in features.items()},
        },
    }
