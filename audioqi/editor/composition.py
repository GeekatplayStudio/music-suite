"""Composition helpers: audio-to-MIDI transcription and song-structure detection."""

from __future__ import annotations

import itertools
import logging
from pathlib import Path
from typing import Any

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.ndimage import median_filter

from audioqi.editor import engines
from audioqi.editor.projects import EditorError

logger = logging.getLogger(__name__)

_SR = 22_050
_HOP = 256
MAX_NOTES = 20_000


def transcription_engine() -> str:
    if not engines.force_fallback() and engines.has_module("basic_pitch"):
        return "basic-pitch"
    return "pyin"


def _mono(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    import librosa

    mixed = audio.mean(axis=1).astype(np.float32)
    return librosa.resample(mixed, orig_sr=sample_rate, target_sr=_SR)


# --------------------------------------------------------------------------- audio to MIDI


def _notes_basic_pitch(wav_path: Path) -> list[dict[str, float]]:
    from basic_pitch.inference import predict

    _, _, events = predict(str(wav_path))
    notes = [
        {
            "t": float(start),
            "d": float(end - start),
            "p": int(pitch),
            "v": float(min(1.0, max(0.05, amplitude))),
        }
        for start, end, pitch, amplitude, *_ in events
        if end > start
    ]
    return sorted(notes, key=lambda note: (note["t"], note["p"]))


def _notes_pyin(audio: np.ndarray, sample_rate: int) -> list[dict[str, float]]:
    """Single-line transcription: one note at a time, which suits vocals, bass and leads."""
    import librosa

    mono = _mono(audio, sample_rate)
    f0, voiced, _ = librosa.pyin(
        mono,
        fmin=float(librosa.note_to_hz("C1")),
        fmax=float(librosa.note_to_hz("C7")),
        sr=_SR,
        frame_length=2048,
        hop_length=_HOP,
    )
    level = librosa.feature.rms(y=mono, frame_length=2048, hop_length=_HOP)[0]
    frames = min(f0.shape[0], level.shape[0])
    pitch = np.full(frames, -1.0)
    ok = voiced[:frames] & np.isfinite(f0[:frames])
    pitch[ok] = np.round(librosa.hz_to_midi(f0[:frames][ok]))
    # A five-frame median removes single-frame octave slips without blurring note starts much.
    pitch = median_filter(pitch, size=5, mode="nearest")
    peak = float(level.max()) or 1.0
    seconds = _HOP / _SR
    notes: list[dict[str, float]] = []
    start = 0
    for index in range(1, frames + 1):
        if index < frames and pitch[index] == pitch[start]:
            continue
        if pitch[start] >= 0 and (index - start) * seconds >= 0.06:
            loudness = float(level[start:index].max()) / peak
            notes.append(
                {
                    "t": start * seconds,
                    "d": (index - start) * seconds,
                    "p": int(pitch[start]),
                    "v": float(min(1.0, max(0.1, loudness**0.5))),
                }
            )
        start = index
    # Rejoin a held note that a brief dropout split in two.
    merged: list[dict[str, float]] = []
    for note in notes:
        last = merged[-1] if merged else None
        if last and last["p"] == note["p"] and note["t"] - (last["t"] + last["d"]) <= 0.04:
            last["d"] = note["t"] + note["d"] - last["t"]
        else:
            merged.append(note)
    # A voiced frame is detected about half an analysis window before and after the note itself.
    edge = 0.035
    for note in merged:
        shift = edge if note["t"] >= edge else 0.0
        note["t"] += shift
        note["d"] = max(0.04, note["d"] - shift - edge)
    return merged


def to_midi(
    audio: np.ndarray, sample_rate: int, wav_path: Path
) -> tuple[list[dict[str, float]], str]:
    """Transcribe audio to notes ``{t, d, p, v}``: seconds, seconds, MIDI pitch, velocity 0-1."""
    if float(np.max(np.abs(audio))) < 1e-4:
        return [], transcription_engine()
    engine = transcription_engine()
    notes: list[dict[str, float]] | None = None
    if engine == "basic-pitch":
        try:
            notes = _notes_basic_pitch(wav_path)
        except Exception:
            logger.warning("basic-pitch failed; falling back to pYIN transcription.")
            engine = "pyin"
    if notes is None:
        notes = _notes_pyin(audio, sample_rate)
    return notes[:MAX_NOTES], engine


# --------------------------------------------------------------------------- structure


def structure(audio: np.ndarray, sample_rate: int) -> list[dict[str, Any]]:
    """Split a song into sections and label repeats alike (A, B, A, ...).

    Harmony (chroma) and timbre (MFCC) are averaged per beat, cut where they change
    most, and sections whose averages are close share a letter.
    """
    import librosa

    duration = audio.shape[0] / float(sample_rate)
    if duration < 8.0:
        raise EditorError("Audio is too short to find sections in (8 seconds minimum).")
    mono = _mono(audio, sample_rate)
    if float(np.max(np.abs(mono))) < 1e-4:
        raise EditorError("The audio is silent, so there are no sections to find.")
    hop = 512
    chroma = librosa.feature.chroma_cqt(y=mono, sr=_SR, hop_length=hop)
    mfcc = librosa.feature.mfcc(y=mono, sr=_SR, hop_length=hop, n_mfcc=13)[1:]
    _, beats = librosa.beat.beat_track(y=mono, sr=_SR, hop_length=hop)
    if len(beats) < 8:
        # No usable pulse: fall back to half-second steps.
        beats = np.arange(0, chroma.shape[1], max(1, round(0.5 * _SR / hop)))
    beats = np.unique(np.concatenate(([0], beats)))

    def per_beat(feature: np.ndarray) -> np.ndarray:
        synced = librosa.util.sync(feature, beats, aggregate=np.median)
        spread = synced.std(axis=1, keepdims=True)
        return (synced - synced.mean(axis=1, keepdims=True)) / np.where(spread > 1e-9, spread, 1.0)

    features = np.vstack([per_beat(chroma), 0.6 * per_beat(mfcc)])
    count = features.shape[1]
    # Cut finer than real sections are; neighbours that sound alike are merged again below.
    wanted = int(min(16, max(2, round(duration / 8.0)), count // 4))
    if wanted < 2:
        return [{"start": 0.0, "end": duration, "label": "A"}]
    cuts = librosa.segment.agglomerative(features, wanted)
    beat_times = librosa.frames_to_time(beats, sr=_SR, hop_length=hop)
    starts = sorted({0.0, *[float(beat_times[min(i, len(beat_times) - 1)]) for i in cuts]})
    # Sections shorter than four seconds are folded into their neighbour.
    kept = [starts[0]]
    for start in starts[1:]:
        if start - kept[-1] >= 4.0 and duration - start >= 4.0:
            kept.append(start)
    bounds = [*kept, duration]

    means = []
    for start, end in itertools.pairwise(bounds):
        inside = (beat_times[:count] >= start - 1e-6) & (beat_times[:count] < end)
        empty = np.zeros(features.shape[0])
        means.append(features[:, inside].mean(axis=1) if inside.any() else empty)
    labels = [0] * len(means)
    if len(means) > 1:
        tree = linkage(np.array(means), method="average", metric="cosine")
        labels = list(fcluster(tree, t=0.5, criterion="distance"))
    letters: dict[int, str] = {}
    sections: list[dict[str, Any]] = []
    for (start, end), label in zip(itertools.pairwise(bounds), labels, strict=True):
        letter = letters.setdefault(int(label), chr(ord("A") + min(25, len(letters))))
        if sections and sections[-1]["label"] == letter:
            sections[-1]["end"] = float(end)
        else:
            sections.append({"start": float(start), "end": float(end), "label": letter})
    return sections
