from __future__ import annotations

import numpy as np

from audioqi.core.metrics import (
    AIR_LIMITED_DROP_DB,
    air_octave_drop_db,
    clipping_segments,
    crest_factor_db,
    dbfs,
    describe_noise_floor,
    loudness_integrated_lufs,
    noise_floor_dbfs,
    noise_floor_estimate,
    oversampled_true_peak,
    rms,
    spectral_balance,
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

    assert noise_floor_dbfs(np.zeros(sr, dtype=np.float32), sr) is None
    assert noise_floor_estimate(np.zeros(sr, dtype=np.float32), sr)["status"] == "digital_silence"


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


def _tilted_noise(sr: int, slope_db_per_octave: float, seconds: float = 6.0) -> np.ndarray:
    """Noise that is flat below 1 kHz and rolls off at the given slope above it."""
    n = int(sr * seconds)
    rng = np.random.default_rng(7)
    spectrum = np.fft.rfft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    spectrum *= 10.0 ** (-slope_db_per_octave * np.log2(np.maximum(freqs, 1000.0) / 1000.0) / 20.0)
    signal = np.fft.irfft(spectrum, n)
    return (0.3 * signal / np.max(np.abs(signal))).astype(np.float32)


def test_noise_floor_is_not_measurable_on_dense_material() -> None:
    sr = 48_000
    estimate = noise_floor_estimate(_tilted_noise(sr, 4.5), sr)
    # The old estimator reported the quietest music here as a "noise floor".
    assert estimate["dbfs"] is None
    assert estimate["status"] == "not_measurable"
    assert estimate["quiet_passage_dbfs"] is not None
    described = describe_noise_floor({"noise_floor_dbfs": None, "noise_floor": estimate})
    assert "not measurable" in described


def test_noise_floor_reads_the_level_of_a_quiet_gap() -> None:
    sr = 48_000
    rng = np.random.default_rng(3)
    hiss = (10.0 ** (-80.0 / 20.0) * rng.standard_normal(sr * 2)).astype(np.float32)
    estimate = noise_floor_estimate(np.concatenate([_tilted_noise(sr, 4.5), hiss]), sr)
    assert estimate["status"] == "measured"
    assert -83.0 < estimate["dbfs"] < -77.0
    assert describe_noise_floor({"noise_floor_dbfs": estimate["dbfs"]}).endswith("dBFS")


def test_noise_floor_reports_digitally_silent_gaps() -> None:
    sr = 48_000
    signal = np.concatenate([_tilted_noise(sr, 4.5), np.zeros(sr * 2, dtype=np.float32)])
    estimate = noise_floor_estimate(signal, sr)
    assert estimate["dbfs"] is None
    assert estimate["status"] == "digital_silence"


def test_air_drop_follows_spectral_tilt_not_energy_share() -> None:
    sr = 48_000
    pink, moderate, dull = (
        air_octave_drop_db(spectral_balance(_tilted_noise(sr, slope), sr), sr / 2.0)
        for slope in (3.0, 6.0, 10.0)
    )
    assert pink is not None and moderate is not None and dull is not None
    assert abs(pink) < 1.5  # pink noise above 1 kHz reads about 0 dB
    assert pink > moderate > dull
    # An ordinary roll-off holds well under the old 4 % air share but is not dull.
    assert spectral_balance(_tilted_noise(sr, 6.0), sr)["air_10k_20k"] < 0.04
    assert moderate > AIR_LIMITED_DROP_DB
    assert dull < AIR_LIMITED_DROP_DB


def test_air_drop_is_undefined_when_the_sample_rate_has_no_air_band() -> None:
    spectral = {"mid_1k_4k": 0.3, "air_10k_20k": 0.0}
    assert air_octave_drop_db(spectral, nyquist_hz=11_025.0) is None
