"""Restoration: click, hum, clipping and reverb reduction, and spectral repair.

All functions take and return ``(frames, channels)`` float32 arrays of the same
length. They are built on NumPy and SciPy only, so they work on every install.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy.interpolate import CubicSpline
from scipy.ndimage import binary_dilation, median_filter, uniform_filter1d
from scipy.signal import iirnotch, istft, sosfiltfilt, stft, tf2sos

from audioqi.editor.processing import fit_length, process_chunked, require_min_length

_NPERSEG = 2048
_HOP = 512
_MAX_REPAIR_RUNS = 400_000


def _stft(x: np.ndarray, sr: int) -> np.ndarray:
    return stft(x, fs=sr, nperseg=_NPERSEG, noverlap=_NPERSEG - _HOP)[2]


def _istft(spec: np.ndarray, sr: int, frames: int) -> np.ndarray:
    out = istft(spec, fs=sr, nperseg=_NPERSEG, noverlap=_NPERSEG - _HOP)[1]
    return fit_length(out.astype(np.float32), frames)


def _runs(mask: np.ndarray) -> np.ndarray:
    """Start and end (exclusive) indices of each run of True, shape ``(n, 2)``."""
    edges = np.diff(np.concatenate(([0], mask.astype(np.int8), [0])))
    return np.stack([np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)], axis=1)


# --------------------------------------------------------------------------- clicks


def declick(audio: np.ndarray, sr: int, sensitivity: float = 0.5) -> tuple[np.ndarray, int]:
    """Replace impulsive clicks and pops. Returns the audio and the number of repairs."""
    require_min_length(audio)
    out = audio.astype(np.float32, copy=True)
    threshold = 16.0 - 11.0 * float(sensitivity)
    window = max(64, int(sr * 0.02))
    max_run = max(4, int(sr * 0.003))
    index = np.arange(audio.shape[0])
    repaired = 0
    for ch in range(audio.shape[1]):
        x = out[:, ch]
        residual = np.abs(x - median_filter(x, size=5, mode="nearest"))
        # A click towers over its neighbourhood; a drum hit raises the whole neighbourhood.
        # The short window rejects noisy passages such as a snare, where every sample is "rough".
        scale = np.maximum(
            uniform_filter1d(residual, size=window, mode="nearest"),
            uniform_filter1d(residual, size=96, mode="nearest"),
        )
        scale += 1e-6
        mask = (residual > threshold * scale) & (residual > 0.004)
        if not mask.any():
            continue
        mask = binary_dilation(mask, iterations=2)
        runs = _runs(mask)
        keep = runs[(runs[:, 1] - runs[:, 0]) <= max_run]
        mask = np.zeros_like(mask)
        for start, end in keep:
            mask[start:end] = True
        if not mask.any() or mask.all():
            continue
        x[mask] = np.interp(index[mask], index[~mask], x[~mask])
        repaired += len(keep)
    return out, repaired


# --------------------------------------------------------------------------- hum


def detect_hum(audio: np.ndarray, sr: int) -> float:
    """50 or 60 Hz, whichever (with its first harmonics) carries more energy."""
    mono = audio.mean(axis=1)[: sr * 30]
    spectrum = np.abs(np.fft.rfft(mono * np.hanning(mono.shape[0])))
    freqs = np.fft.rfftfreq(mono.shape[0], 1.0 / sr)

    def energy(base: float) -> float:
        total = 0.0
        for harmonic in (1, 2, 3):
            band = (freqs > base * harmonic - 1.0) & (freqs < base * harmonic + 1.0)
            total += float(np.sum(spectrum[band] ** 2))
        return total

    return 50.0 if energy(50.0) >= energy(60.0) else 60.0


def dehum(
    audio: np.ndarray, sr: int, frequency: float | None = None, harmonics: int = 6, q: float = 35.0
) -> tuple[np.ndarray, float]:
    """Zero-phase notches at the mains frequency and its harmonics."""
    require_min_length(audio)
    base = float(frequency) if frequency else detect_hum(audio, sr)
    sections = [
        tf2sos(*iirnotch(base * k, q * k**0.5, fs=sr))
        for k in range(1, int(harmonics) + 1)
        if base * k < sr * 0.45
    ]
    sos = np.concatenate(sections, axis=0)
    out = sosfiltfilt(sos, audio.astype(np.float64), axis=0)
    return out.astype(np.float32), base


# --------------------------------------------------------------------------- clipping


def declip(
    audio: np.ndarray, sr: int, threshold: float = 0.98
) -> tuple[np.ndarray, dict[str, Any]]:
    """Rebuild flattened peaks with splines, then lower the level so they fit."""
    require_min_length(audio)
    out = audio.astype(np.float64, copy=True)
    peak = float(np.max(np.abs(out)))
    info: dict[str, Any] = {"clipped_samples": 0, "repaired_regions": 0, "gain_db": 0.0}
    if peak <= 1e-6:
        return audio.astype(np.float32, copy=True), info
    level = peak * float(threshold)
    side = 8
    for ch in range(out.shape[1]):
        x = out[:, ch]
        # Only flat tops count: at least two neighbouring samples at the ceiling.
        runs = _runs(np.abs(x) >= level)
        runs = runs[(runs[:, 1] - runs[:, 0]) >= 2]
        if not len(runs) or len(runs) > _MAX_REPAIR_RUNS:
            continue
        clipped = np.zeros(x.shape[0], dtype=bool)
        for start, end in runs:
            clipped[start:end] = True
        original = x.copy()
        for start, end in runs:
            lo, hi = max(0, start - side), min(x.shape[0], end + side)
            good = np.flatnonzero(~clipped[lo:hi]) + lo
            if good.size < 4 or good[0] >= start or good[-1] < end:
                continue
            rebuilt = CubicSpline(good, original[good])(np.arange(start, end))
            sign = 1.0 if original[start] >= 0 else -1.0
            # A repair may only extend a peak outwards, and not absurdly far.
            x[start:end] = sign * np.clip(sign * rebuilt, level, peak * 4.0)
            info["repaired_regions"] += 1
        info["clipped_samples"] += int(clipped.sum())
    new_peak = float(np.max(np.abs(out)))
    ceiling = 10 ** (-1.0 / 20.0)
    if info["repaired_regions"] and new_peak > ceiling:
        out *= ceiling / new_peak
        info["gain_db"] = round(20.0 * np.log10(ceiling / new_peak), 2)
    return out.astype(np.float32), info


# --------------------------------------------------------------------------- reverb


def _dereverb_channel(x: np.ndarray, sr: int, strength: float) -> np.ndarray:
    spec = _stft(x, sr)
    magnitude = np.abs(spec)
    delay = max(1, round(0.05 * sr / _HOP))
    decay = float(np.exp(-_HOP / (0.35 * sr)))
    late = np.zeros_like(magnitude)
    state = np.zeros(magnitude.shape[0], dtype=magnitude.dtype)
    for t in range(delay, magnitude.shape[1]):
        # Late reverberation is modelled as a decaying echo of what sounded 50 ms ago.
        state = decay * state + (1.0 - decay) * magnitude[:, t - delay]
        late[:, t] = state
    gain = np.clip((magnitude - 2.2 * strength * late) / (magnitude + 1e-9), 0.12, 1.0)
    gain = uniform_filter1d(gain, size=3, axis=0, mode="nearest")
    return _istft(spec * gain, sr, x.shape[0])


def dereverb(audio: np.ndarray, sr: int, strength: float = 0.5) -> np.ndarray:
    """Reduce room tails by spectral subtraction of estimated late reverberation."""
    require_min_length(audio)
    if strength <= 0:
        return audio.astype(np.float32, copy=True)

    def run(chunk: np.ndarray) -> np.ndarray:
        channels = [_dereverb_channel(chunk[:, ch], sr, strength) for ch in range(chunk.shape[1])]
        return np.stack(channels, axis=1)[None]

    return process_chunked(audio.astype(np.float32), sr, run)[0]


# --------------------------------------------------------------------------- spectral repair


def spectral_repair(
    audio: np.ndarray,
    sr: int,
    start: float,
    end: float,
    freq_low: float,
    freq_high: float,
    mode: str = "attenuate",
    amount_db: float = 24.0,
) -> np.ndarray:
    """Attenuate or heal one time-frequency rectangle, leaving everything else untouched.

    ``heal`` replaces the selection's magnitudes with a blend of the sound just
    before and just after it, which removes short intrusions such as a cough or chirp.
    """
    require_min_length(audio)
    frames = audio.shape[0]
    first, last = int(start * sr), min(frames, int(end * sr))
    if last - first < 16:
        return audio.astype(np.float32, copy=True)
    pad = _NPERSEG * 4
    lo, hi = max(0, first - pad), min(frames, last + pad)
    out = audio.astype(np.float32, copy=True)
    for ch in range(audio.shape[1]):
        segment = audio[lo:hi, ch]
        spec = _stft(segment, sr)
        freqs = np.fft.rfftfreq(_NPERSEG, 1.0 / sr)
        times = np.arange(spec.shape[1]) * _HOP / sr + lo / sr
        # Soft edges of one bin / one frame avoid audible seams around the rectangle.
        f_weight = np.clip((freqs - freq_low) / (sr / _NPERSEG) + 1.0, 0, 1) * np.clip(
            (freq_high - freqs) / (sr / _NPERSEG) + 1.0, 0, 1
        )
        t_weight = np.clip((times - start) / (_HOP / sr) + 1.0, 0, 1) * np.clip(
            (end - times) / (_HOP / sr) + 1.0, 0, 1
        )
        weight = f_weight[:, None] * t_weight[None, :]
        if mode == "heal":
            inside = np.flatnonzero(t_weight > 0)
            before = np.arange(max(0, inside[0] - 4), inside[0])
            after = np.arange(inside[-1] + 1, min(spec.shape[1], inside[-1] + 5))
            magnitude = np.abs(spec)
            left = magnitude[:, before].mean(axis=1) if before.size else None
            right = magnitude[:, after].mean(axis=1) if after.size else None
            left = right if left is None else left
            right = left if right is None else right
            if left is None or right is None:
                target = magnitude * 10 ** (-amount_db / 20.0)
            else:
                blend = np.linspace(0.0, 1.0, inside.size)[None, :]
                target = magnitude.copy()
                target[:, inside] = left[:, None] * (1 - blend) + right[:, None] * blend
            healed = target * np.exp(1j * np.angle(spec))
            spec = spec * (1 - weight) + healed * weight
        else:
            spec = spec * (1.0 - weight * (1.0 - 10 ** (-amount_db / 20.0)))
        out[lo:hi, ch] = _istft(spec, sr, hi - lo)
    return out
