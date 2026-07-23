from __future__ import annotations

import math
import threading
import time
from collections.abc import Callable
from typing import Any

import librosa
import numpy as np
from librosa.util.exceptions import ParameterError

SpectrogramProgressCallback = Callable[[float, str], None]


def _compress_with_axes(
    z: np.ndarray,
    y_axis: np.ndarray,
    x_axis: np.ndarray,
    max_freq_bins: int = 512,
    max_time_bins: int = 1400,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    freq_step = max(1, z.shape[0] // max_freq_bins)
    time_step = max(1, z.shape[1] // max_time_bins)
    zc = z[::freq_step, ::time_step]
    yc = y_axis[::freq_step][: zc.shape[0]]
    xc = x_axis[::time_step][: zc.shape[1]]
    return zc, yc, xc


def _db(x: np.ndarray, amin: float = 1e-12) -> np.ndarray:
    return librosa.amplitude_to_db(np.maximum(x, amin), ref=np.max)


def _report_progress(
    progress: SpectrogramProgressCallback | None,
    value: float,
    detail: str,
) -> None:
    if progress:
        progress(value, detail)


def _run_with_heartbeat(
    *,
    progress: SpectrogramProgressCallback | None,
    value: float,
    detail: str,
    fn: Callable[[], Any],
) -> Any:
    if progress is None:
        return fn()

    stop_event = threading.Event()
    started_at = time.monotonic()

    def heartbeat() -> None:
        _report_progress(progress, value, detail)
        while not stop_event.wait(5.0):
            elapsed = int(max(1.0, time.monotonic() - started_at))
            _report_progress(progress, value, f"{detail} Elapsed {elapsed}s.")

    heartbeat_thread = threading.Thread(
        target=heartbeat,
        name="audioqi-spectrogram-heartbeat",
        daemon=True,
    )
    heartbeat_thread.start()
    try:
        return fn()
    finally:
        stop_event.set()
        heartbeat_thread.join(timeout=0.1)


def _safe_cqt_magnitude(
    signal: np.ndarray,
    sr: int,
    fmin: float,
    bins_per_octave: int,
    desired_bins: int,
    hop_length: int,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Build CQT robustly near Nyquist:
    1) pre-limit bins with Nyquist headroom
    2) if librosa still rejects basis, decrement bins until valid
    """
    nyquist = max(1.0, sr / 2.0)
    nyquist_headroom = nyquist * 0.95
    if nyquist_headroom <= fmin:
        max_bins_headroom = bins_per_octave * 2
    else:
        max_bins_headroom = int(
            math.floor(bins_per_octave * math.log2(nyquist_headroom / fmin)) + 1
        )
    min_bins = bins_per_octave * 2
    n_bins = int(max(min_bins, min(desired_bins, max_bins_headroom)))

    while n_bins >= min_bins:
        try:
            cqt = np.abs(
                librosa.cqt(
                    y=signal,
                    sr=sr,
                    hop_length=hop_length,
                    n_bins=n_bins,
                    bins_per_octave=bins_per_octave,
                    fmin=fmin,
                )
            )
            freqs = librosa.cqt_frequencies(n_bins=cqt.shape[0], fmin=fmin)
            return cqt, freqs
        except ParameterError:
            n_bins -= 1

    # Last-resort fallback: mel bands to keep analysis resilient.
    mel = librosa.feature.melspectrogram(
        y=signal,
        sr=sr,
        n_fft=4096,
        hop_length=hop_length,
        n_mels=96,
        fmin=fmin,
        fmax=nyquist,
        power=2.0,
    )
    mel_mag = np.sqrt(np.maximum(mel, 1e-12))
    mel_freqs = librosa.mel_frequencies(n_mels=mel.shape[0], fmin=fmin, fmax=nyquist)
    return mel_mag, mel_freqs


def spectrogram_suite(
    signal: np.ndarray,
    sr: int,
    progress: SpectrogramProgressCallback | None = None,
) -> dict[str, dict[str, Any]]:
    n_fft = 4096
    hop_length = 1024

    _report_progress(progress, 78.2, "Preparing STFT spectrogram.")
    stft_mag = _run_with_heartbeat(
        progress=progress,
        value=79.0,
        detail="Computing STFT spectrogram.",
        fn=lambda: np.abs(librosa.stft(signal, n_fft=n_fft, hop_length=hop_length, window="hann")),
    )
    stft_db_full = _db(stft_mag)
    stft_freqs_full = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    stft_times_full = librosa.frames_to_time(
        np.arange(stft_mag.shape[1]),
        sr=sr,
        hop_length=hop_length,
    )
    _report_progress(progress, 80.8, "Compressing STFT spectrogram payload.")
    stft_db, stft_freqs, stft_times = _compress_with_axes(
        stft_db_full,
        stft_freqs_full,
        stft_times_full,
    )

    mel = _run_with_heartbeat(
        progress=progress,
        value=82.0,
        detail="Computing mel spectrogram.",
        fn=lambda: librosa.feature.melspectrogram(
            y=signal,
            sr=sr,
            n_fft=n_fft,
            hop_length=hop_length,
            n_mels=256,
            power=2.0,
        ),
    )
    mel_db_full = librosa.power_to_db(np.maximum(mel, 1e-12), ref=np.max)
    mel_freqs_full = librosa.mel_frequencies(n_mels=mel.shape[0], fmin=0.0, fmax=sr / 2.0)
    mel_times_full = librosa.frames_to_time(np.arange(mel.shape[1]), sr=sr, hop_length=hop_length)
    _report_progress(progress, 83.4, "Compressing mel spectrogram payload.")
    mel_db, mel_freqs, mel_times = _compress_with_axes(mel_db_full, mel_freqs_full, mel_times_full)

    cqt_fmin = max(20.0, float(librosa.note_to_hz("A0")))
    cqt_bins_per_octave = 12
    nyquist = max(1.0, sr / 2.0)
    octaves = max(1.0, math.log2(nyquist / cqt_fmin))
    # Cover practical range up to Nyquist with a semitone grid.
    cqt_n_bins = int(max(96, math.ceil(octaves * cqt_bins_per_octave)))
    cqt, cqt_freqs_raw = _run_with_heartbeat(
        progress=progress,
        value=84.2,
        detail="Computing CQT spectrogram.",
        fn=lambda: _safe_cqt_magnitude(
            signal=signal,
            sr=sr,
            fmin=cqt_fmin,
            bins_per_octave=cqt_bins_per_octave,
            desired_bins=cqt_n_bins,
            hop_length=512,
        ),
    )
    cqt_db_full = _db(cqt)
    cqt_freqs_full = cqt_freqs_raw
    cqt_times_full = librosa.frames_to_time(np.arange(cqt.shape[1]), sr=sr, hop_length=512)
    _report_progress(progress, 85.4, "Compressing CQT spectrogram payload.")
    cqt_db, cqt_freqs, cqt_times = _compress_with_axes(cqt_db_full, cqt_freqs_full, cqt_times_full)

    log_stft = stft_db.copy()
    safe_freqs = np.maximum(stft_freqs, 1.0)
    log_freqs = np.log10(safe_freqs)

    _report_progress(progress, 86.0, "Spectrogram suite complete.")

    return {
        "stft_linear": {
            "z": stft_db.tolist(),
            "x": stft_times.tolist(),
            "y": stft_freqs.tolist(),
            "x_title": "Time (s)",
            "y_title": "Frequency (Hz)",
        },
        "stft_log": {
            "z": log_stft.tolist(),
            "x": stft_times.tolist(),
            "y": log_freqs.tolist(),
            "x_title": "Time (s)",
            "y_title": "log10(Frequency Hz)",
        },
        "mel": {
            "z": mel_db.tolist(),
            "x": mel_times.tolist(),
            "y": mel_freqs.tolist(),
            "x_title": "Time (s)",
            "y_title": "Mel frequency (Hz)",
        },
        "cqt": {
            "z": cqt_db.tolist(),
            "x": cqt_times.tolist(),
            "y": cqt_freqs.tolist(),
            "x_title": "Time (s)",
            "y_title": "CQT frequency (Hz)",
        },
    }
