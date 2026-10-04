from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pyloudnorm as pyln
from scipy.signal import stft

EPS = 1e-12


@dataclass(frozen=True)
class Timeline:
    times: list[float]
    values: list[float]


def dbfs(value: float) -> float:
    return float(20.0 * np.log10(max(value, EPS)))


def rms(signal: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(signal), dtype=np.float64)))


def peak(signal: np.ndarray) -> float:
    return float(np.max(np.abs(signal)))


def crest_factor_db(signal: np.ndarray) -> float:
    p = peak(signal)
    r = rms(signal)
    return dbfs(p) - dbfs(r)


def loudness_integrated_lufs(signal: np.ndarray, sr: int) -> float:
    meter = pyln.Meter(sr)
    try:
        return float(meter.integrated_loudness(signal))
    except ValueError:
        return float("-inf")


def loudness_timeline_lufs(
    signal: np.ndarray,
    sr: int,
    window_seconds: float,
    hop_seconds: float,
) -> Timeline:
    meter = pyln.Meter(sr)
    window = max(1, int(window_seconds * sr))
    hop = max(1, int(hop_seconds * sr))
    times: list[float] = []
    values: list[float] = []
    for start in range(0, max(1, signal.shape[0] - window), hop):
        end = start + window
        chunk = signal[start:end]
        if chunk.shape[0] < window:
            break
        try:
            loudness = float(meter.integrated_loudness(chunk))
        except ValueError:
            loudness = float("-inf")
        times.append(start / sr)
        values.append(loudness)
    return Timeline(times=times, values=values)


def envelope_timeline(
    signal: np.ndarray,
    sr: int,
    window_seconds: float = 0.05,
    hop_seconds: float = 0.025,
) -> dict[str, list[float]]:
    window = max(1, int(window_seconds * sr))
    hop = max(1, int(hop_seconds * sr))
    times: list[float] = []
    peaks: list[float] = []
    rms_vals: list[float] = []
    for start in range(0, max(1, signal.shape[0] - window), hop):
        end = start + window
        chunk = signal[start:end]
        if chunk.shape[0] < window:
            break
        times.append(start / sr)
        peaks.append(dbfs(float(np.max(np.abs(chunk)))))
        rms_vals.append(dbfs(rms(chunk)))
    return {"times": times, "peak_dbfs": peaks, "rms_dbfs": rms_vals}


def clipping_segments(
    signal: np.ndarray,
    sr: int,
    threshold: float = 0.999,
    min_consecutive: int = 3,
) -> list[dict[str, Any]]:
    if signal.ndim == 1:
        mask = np.abs(signal) >= threshold
    else:
        mask = np.any(np.abs(signal) >= threshold, axis=1)
    indices = np.flatnonzero(mask)
    if indices.size == 0:
        return []
    segments: list[dict[str, Any]] = []
    start = int(indices[0])
    prev = int(indices[0])
    for idx in indices[1:]:
        idx = int(idx)
        if idx != prev + 1:
            if prev - start + 1 >= min_consecutive:
                samples = prev - start + 1
                duration = samples / sr
                severity = "high" if duration >= 0.005 else "medium"
                segments.append(
                    {
                        "type": "clipping",
                        "start_seconds": start / sr,
                        "end_seconds": (prev + 1) / sr,
                        "samples": samples,
                        "severity": severity,
                        "message": f"Hard clipping for {duration * 1000.0:.2f} ms.",
                    }
                )
            start = idx
        prev = idx
    if prev - start + 1 >= min_consecutive:
        samples = prev - start + 1
        duration = samples / sr
        severity = "high" if duration >= 0.005 else "medium"
        segments.append(
            {
                "type": "clipping",
                "start_seconds": start / sr,
                "end_seconds": (prev + 1) / sr,
                "samples": samples,
                "severity": severity,
                "message": f"Hard clipping for {duration * 1000.0:.2f} ms.",
            }
        )
    return segments


def oversampled_true_peak(signal: np.ndarray, sr: int, upsample_factor: int = 4) -> float:
    from scipy.signal import resample_poly

    if signal.ndim == 1:
        signal = signal[:, np.newaxis]
    peak_value = 0.0
    for ch in range(signal.shape[1]):
        up = resample_poly(signal[:, ch], upsample_factor, 1)
        peak_value = max(peak_value, float(np.max(np.abs(up))))
    return peak_value


def stereo_timelines(
    stereo: np.ndarray,
    sr: int,
    window_seconds: float = 1.0,
    hop_seconds: float = 0.5,
) -> dict[str, list[float]]:
    if stereo.shape[1] < 2:
        return {"times": [], "correlation": [], "ms_ratio_db": [], "lr_balance_db": []}
    left_channel = stereo[:, 0]
    right_channel = stereo[:, 1]
    window = max(1, int(window_seconds * sr))
    hop = max(1, int(hop_seconds * sr))
    times: list[float] = []
    corr_vals: list[float] = []
    ms_ratio: list[float] = []
    lr_balance: list[float] = []
    for start in range(0, max(1, stereo.shape[0] - window), hop):
        end = start + window
        if end > stereo.shape[0]:
            break
        left_chunk = left_channel[start:end]
        right_chunk = right_channel[start:end]
        c = _safe_correlation(left_chunk, right_chunk)
        mid = 0.5 * (left_chunk + right_chunk)
        side = 0.5 * (left_chunk - right_chunk)
        mid_energy = float(np.mean(mid**2))
        side_energy = float(np.mean(side**2))
        ms_db = float(10.0 * np.log10((side_energy + EPS) / (mid_energy + EPS)))
        left_db = dbfs(rms(left_chunk))
        right_db = dbfs(rms(right_chunk))
        times.append(start / sr)
        corr_vals.append(float(c))
        ms_ratio.append(ms_db)
        lr_balance.append(float(left_db - right_db))
    return {
        "times": times,
        "correlation": corr_vals,
        "ms_ratio_db": ms_ratio,
        "lr_balance_db": lr_balance,
    }


def _safe_correlation(left_chunk: np.ndarray, right_chunk: np.ndarray) -> float:
    left_std = float(np.std(left_chunk, dtype=np.float64))
    right_std = float(np.std(right_chunk, dtype=np.float64))
    if left_std <= 1e-10 or right_std <= 1e-10:
        return 0.0
    c = np.corrcoef(left_chunk, right_chunk)[0, 1]
    if not np.isfinite(c):
        return 0.0
    return float(c)


NOISE_FLOOR_GAP_DB = 40.0
NOISE_FLOOR_MIN_GAP_SECONDS = 0.2
DIGITAL_SILENCE_DBFS = -140.0


def noise_floor_estimate(signal: np.ndarray, sr: int) -> dict[str, Any]:
    """Estimate the noise floor from passages where the music drops out.

    Music masks its own noise, so a floor can only be read in fades, gaps,
    and quiet intros: 50 ms windows at least NOISE_FLOOR_GAP_DB below the
    programme's median level. Dense material has no such passages, and the
    quietest music is then reported as `quiet_passage_dbfs` rather than
    passed off as a noise floor, which would read as a ruined recording.
    """
    window = max(1, int(0.05 * sr))
    levels: list[float] = []
    for start in range(0, max(1, signal.shape[0] - window), window):
        levels.append(dbfs(rms(signal[start : start + window])))
    result: dict[str, Any] = {
        "dbfs": None,
        "status": "not_measurable",
        "quiet_passage_dbfs": None,
        "gap_seconds": 0.0,
    }
    if not levels:
        return result
    level_arr = np.asarray(levels, dtype=np.float64)
    audible = level_arr[level_arr > DIGITAL_SILENCE_DBFS]
    silent_seconds = float((level_arr.size - audible.size) * window / sr)
    if audible.size == 0:
        result["status"] = "digital_silence"
        result["gap_seconds"] = silent_seconds
        return result
    result["quiet_passage_dbfs"] = float(np.percentile(audible, 10))
    gaps = audible[audible <= float(np.median(audible)) - NOISE_FLOOR_GAP_DB]
    gap_seconds = float(gaps.size * window / sr)
    if gap_seconds >= NOISE_FLOOR_MIN_GAP_SECONDS:
        result["dbfs"] = float(np.percentile(gaps, 10))
        result["status"] = "measured"
        result["gap_seconds"] = gap_seconds
    elif silent_seconds >= NOISE_FLOOR_MIN_GAP_SECONDS:
        result["status"] = "digital_silence"
        result["gap_seconds"] = silent_seconds
    return result


def noise_floor_dbfs(signal: np.ndarray, sr: int) -> float | None:
    """Measured noise floor in dBFS, or None when the material has no gaps to read it from."""
    value = noise_floor_estimate(signal, sr)["dbfs"]
    return None if value is None else float(value)


def describe_noise_floor(metrics: dict[str, Any]) -> str:
    """Human-readable noise floor for prompts and reports, honest about gaps."""
    value = metrics.get("noise_floor_dbfs")
    if isinstance(value, (int, float)) and np.isfinite(value):
        return f"{float(value):.2f} dBFS"
    info = metrics.get("noise_floor")
    status = info.get("status") if isinstance(info, dict) else None
    if status == "digital_silence":
        return "below measurement (gaps are digital silence)"
    return "not measurable (no quiet gaps; the music masks it)"


AIR_LIMITED_DROP_DB = -20.0


def air_octave_drop_db(spectral: dict[str, float], nyquist_hz: float) -> float | None:
    """Per-octave level of the 10-20 kHz air band relative to 1-4 kHz, in dB.

    Music rolls off with frequency, so air holds a tiny share of total energy
    even in a bright master, and a fixed share threshold flags nearly every
    track. Comparing per-octave levels measures the tilt instead: pink noise
    reads about 0 dB, and each extra dB/octave of roll-off lowers it by about
    2.8 dB. Below AIR_LIMITED_DROP_DB the top end is genuinely dull.
    """
    air_top_hz = min(20_000.0, float(nyquist_hz))
    if air_top_hz < 10_000.0 * np.sqrt(2.0):  # under half an octave of air is too thin to judge
        return None
    mid_share = float(spectral.get("mid_1k_4k", 0.0))
    air_share = float(spectral.get("air_10k_20k", 0.0))
    if mid_share <= 0.0:
        return None
    air_per_octave = air_share / float(np.log2(air_top_hz / 10_000.0))
    mid_per_octave = mid_share / 2.0
    return float(10.0 * np.log10(max(air_per_octave, EPS) / mid_per_octave))


def spectral_balance(signal: np.ndarray, sr: int) -> dict[str, float]:
    if signal.shape[0] < 4096:
        signal = np.pad(signal, (0, 4096 - signal.shape[0]), mode="constant")
    freqs, _, zxx = stft(signal, fs=sr, nperseg=4096, noverlap=3072, boundary=None)
    power = np.abs(zxx) ** 2
    spectrum = np.mean(power, axis=1)
    total = float(np.sum(spectrum) + EPS)
    bands = {
        "sub_20_60": (20, 60),
        "bass_60_250": (60, 250),
        "low_mid_250_1000": (250, 1000),
        "mid_1k_4k": (1000, 4000),
        "presence_4k_6k": (4000, 6000),
        "sibilance_6k_10k": (6000, 10000),
        "air_10k_20k": (10000, 20000),
    }
    out: dict[str, float] = {}
    for key, (low, high) in bands.items():
        idx = np.where((freqs >= low) & (freqs < high))[0]
        band_energy = float(np.sum(spectrum[idx])) if idx.size else 0.0
        out[key] = band_energy / total
    return out


def distortion_proxies(signal: np.ndarray, sr: int) -> dict[str, float]:
    if signal.shape[0] < 4096:
        signal = np.pad(signal, (0, 4096 - signal.shape[0]), mode="constant")
    freqs, _, zxx = stft(signal, fs=sr, nperseg=4096, noverlap=3072, boundary=None)
    power = np.abs(zxx) ** 2
    total = float(np.sum(power) + EPS)
    hf = float(np.sum(power[freqs >= 8000])) / total
    harsh = float(np.sum(power[(freqs >= 4000) & (freqs <= 10000)])) / total
    return {"high_freq_energy_ratio": hf, "harsh_band_ratio": harsh}


def spectrum_curve(signal: np.ndarray, sr: int) -> dict[str, list[float]]:
    if signal.shape[0] < 4096:
        signal = np.pad(signal, (0, 4096 - signal.shape[0]), mode="constant")
    freqs, _, zxx = stft(signal, fs=sr, nperseg=4096, noverlap=3072, boundary=None)
    power = np.mean(np.abs(zxx) ** 2, axis=1)
    db = 10.0 * np.log10(np.maximum(power, EPS))
    return {"freq_hz": freqs.tolist(), "db": db.tolist()}
