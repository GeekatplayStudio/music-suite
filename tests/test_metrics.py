from __future__ import annotations

import numpy as np

from audioqi.core.metrics import (
    clipping_segments,
    crest_factor_db,
    dbfs,
    loudness_integrated_lufs,
    noise_floor_dbfs,
    oversampled_true_peak,
    rms,
    stereo_timelines,
)


def test_loudness_and_dynamics_are_deterministic() -> None:
    sr = 48_000
    t = np.linspace(0, 2.0, int(sr * 2.0), endpoint=False, dtype=np.float32)
    mono = 0.1 * np.sin(2 * np.pi * 1000.0 * t)
    loudness = loudness_integrated_lufs(mono, sr)
    assert np.isfinite(loudness)
    assert loudness < -10.0

    r = rms(mono)
    assert r > 0
    assert dbfs(r) < 0
    assert crest_factor_db(mono) > 0


def test_true_peak_and_clipping_detection() -> None:
    sr = 48_000
    signal = np.zeros((sr, 2), dtype=np.float32)
    signal[100:120, :] = 1.0
    clips = clipping_segments(signal, sr, threshold=0.999, min_consecutive=2)
    assert clips
    assert clips[0]["start_seconds"] >= 0

    tp = oversampled_true_peak(signal, sr, upsample_factor=4)
    assert tp >= 1.0


def test_stereo_and_noise_floor() -> None:
    sr = 48_000
    t = np.linspace(0, 1.0, sr, endpoint=False, dtype=np.float32)
    left = 0.2 * np.sin(2 * np.pi * 220.0 * t)
    right = 0.2 * np.sin(2 * np.pi * 220.0 * t + np.pi / 4)
    stereo = np.stack([left, right], axis=1)
    timeline = stereo_timelines(stereo, sr, window_seconds=0.2, hop_seconds=0.1)
    assert len(timeline["times"]) > 0
    assert len(timeline["correlation"]) == len(timeline["times"])

    floor = noise_floor_dbfs(np.zeros(sr, dtype=np.float32), sr)
    assert np.isfinite(floor)


def test_short_signal_handling() -> None:
    from audioqi.core.metrics import distortion_proxies, spectral_balance, spectrum_curve
    sr = 48_000
    signal = np.zeros(1000, dtype=np.float32)
    sb = spectral_balance(signal, sr)
    assert "sub_20_60" in sb
    sc = spectrum_curve(signal, sr)
    assert "freq_hz" in sc
    dp = distortion_proxies(signal, sr)
    assert "harsh_band_ratio" in dp
