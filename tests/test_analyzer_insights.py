from __future__ import annotations

from audioqi.core.analyzer import (
    _approx_lra,
    _compression_insights,
    _dynamic_range_insights,
    _mastering_recommendations,
)

# Band shares of an ordinary master: about -6 dB/octave above 1 kHz.
NORMAL_SPECTRAL = {
    "sub_20_60": 0.08,
    "bass_60_250": 0.25,
    "low_mid_250_1000": 0.30,
    "mid_1k_4k": 0.25,
    "presence_4k_6k": 0.05,
    "sibilance_6k_10k": 0.04,
    "air_10k_20k": 0.02,
}


def _recommendations(spectral: dict[str, float], content_high_hz: float) -> list[str]:
    recs = _mastering_recommendations(
        integrated_lufs=-14.0,
        true_peak_dbfs=-1.2,
        crest_db=12.0,
        lra=6.0,
        clipping_ratio=0.0,
        dc_offset=0.0,
        spectral=spectral,
        marker_types=set(),
        nyquist_hz=24_000.0,
        content_high_hz=content_high_hz,
    )
    return [rec["issue"] for rec in recs]


def test_lossless_file_reaching_the_audible_limit_reports_no_loss() -> None:
    insights = _compression_insights(
        metadata={"codec": "pcm_f32le", "format": "wav"},
        sample_rate=48_000,
        estimated_high_hz=20_180.0,
    )
    # Previously reported as 3 820 Hz (15.9 % of Nyquist) of "compression loss".
    assert insights["compression_type"] == "lossless"
    assert insights["loss_reference_hz"] == 20_000.0
    assert insights["estimated_high_freq_loss_hz"] == 0.0
    assert insights["estimated_high_freq_loss_percent"] == 0.0


def test_lossless_container_with_lossy_cutoff_is_called_out() -> None:
    insights = _compression_insights(
        metadata={"codec": "flac", "format": "flac"},
        sample_rate=44_100,
        estimated_high_hz=15_800.0,
    )
    assert "transcoded from a lossy source" in insights["assessment"]
    assert insights["estimated_high_freq_loss_hz"] == 4_200.0


def test_lossy_cutoff_is_measured_against_the_audible_band() -> None:
    insights = _compression_insights(
        metadata={"codec": "mp3", "format": "mp3"},
        sample_rate=44_100,
        estimated_high_hz=16_000.0,
    )
    assert insights["estimated_high_freq_loss_hz"] == 4_000.0
    assert insights["estimated_high_freq_loss_percent"] == 20.0


def test_low_sample_rate_is_named_as_the_band_limit() -> None:
    insights = _compression_insights(
        metadata={"codec": "pcm_s16le", "format": "wav"},
        sample_rate=22_050,
        estimated_high_hz=11_000.0,
    )
    assert "sample rate itself limits the band" in insights["assessment"]


def test_peak_to_noise_is_absent_when_no_floor_was_measured() -> None:
    insights = _dynamic_range_insights(
        sample_peak=0.87,
        true_peak=0.87,
        integrated_lufs=-14.9,
        noise_floor_dbfs=None,
        crest_factor_db=16.6,
        lra=1.9,
    )
    assert insights["noise_floor_dbfs"] is None
    assert insights["peak_to_noise_span_db"] is None


def test_lra_gates_out_silence_and_fades() -> None:
    steady = [-14.0, -13.5, -14.5, -14.2, -13.8] * 20
    with_silence = [*steady, *([-65.0] * 60), *([float("-inf")] * 10)]
    assert _approx_lra(with_silence) < 2.0
    assert _approx_lra(with_silence) == _approx_lra(steady)


def test_air_recommendation_skips_an_ordinary_roll_off() -> None:
    issues = _recommendations(NORMAL_SPECTRAL, content_high_hz=20_180.0)
    assert not any("air" in issue.lower() or "top end" in issue.lower() for issue in issues)


def test_air_recommendation_flags_a_genuinely_dull_top() -> None:
    dull = {**NORMAL_SPECTRAL, "air_10k_20k": 0.0008}
    issues = _recommendations(dull, content_high_hz=20_000.0)
    assert any(issue.startswith("Top-end air appears limited") for issue in issues)


def test_band_limited_source_gets_a_cutoff_note_instead_of_a_shelf_boost() -> None:
    dull = {**NORMAL_SPECTRAL, "air_10k_20k": 0.0008}
    issues = _recommendations(dull, content_high_hz=15_000.0)
    assert any(issue.startswith("Top end stops near 15.0 kHz") for issue in issues)
    assert not any(issue.startswith("Top-end air appears limited") for issue in issues)
