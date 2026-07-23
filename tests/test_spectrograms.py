from __future__ import annotations

import numpy as np

from audioqi.core.analyzer import _spectrogram_input
from audioqi.core.spectrograms import spectrogram_suite


def test_spectrogram_suite_reports_substage_progress() -> None:
    sr = 48_000
    t = np.linspace(0, 1.0, sr, endpoint=False, dtype=np.float32)
    signal = (0.2 * np.sin(2 * np.pi * 440.0 * t)).astype(np.float32)
    updates: list[tuple[float, str]] = []

    payload = spectrogram_suite(
        signal,
        sr,
        progress=lambda value, detail: updates.append((value, detail)),
    )

    assert {"stft_linear", "stft_log", "mel", "cqt"}.issubset(payload)
    assert any("STFT spectrogram" in detail for _, detail in updates)
    assert any("mel spectrogram" in detail for _, detail in updates)
    assert any("CQT spectrogram" in detail for _, detail in updates)
    assert any(value >= 86.0 for value, _ in updates)


def test_spectrogram_input_downsamples_long_high_sr_audio() -> None:
    sr = 48_000
    duration_seconds = 130.0
    signal = np.zeros(int(sr * duration_seconds), dtype=np.float32)

    reduced, reduced_sr = _spectrogram_input(signal, sr)

    assert reduced_sr <= 24_000
    assert reduced.size < signal.size
    assert reduced.dtype == np.float32
