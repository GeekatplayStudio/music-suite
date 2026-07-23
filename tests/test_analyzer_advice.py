from __future__ import annotations

from audioqi.core.analyzer import _ai_mastering_advice


def test_ai_mastering_advice_prefers_safe_v1_for_dense_lossy_material() -> None:
    advice = _ai_mastering_advice(
        integrated_lufs=-10.2,
        true_peak_dbfs=-0.2,
        crest_db=7.4,
        lra=2.8,
        clipping_ratio=0.01,
        spectral={
            "sub_20_60": 0.18,
            "bass_60_250": 0.29,
            "mid_1k_4k": 0.11,
        },
        marker_types={"sub_bass_heavy", "mono_incompatibility"},
        compression_type="lossy",
    )

    assert advice["recommended_mode"] == "v1"
    assert advice["recommended_preset"] == "streaming"
    assert advice["recommended_backend"] == "internal"
    assert advice["recommended_refine_passes"] == 1
    assert advice["optimizer_variants"] == 2
    assert float(advice["true_peak_dbfs"]) <= -1.2


def test_ai_mastering_advice_uses_v2_for_cleaner_multi_issue_material() -> None:
    advice = _ai_mastering_advice(
        integrated_lufs=-15.5,
        true_peak_dbfs=-2.2,
        crest_db=11.2,
        lra=6.1,
        clipping_ratio=0.0,
        spectral={
            "sub_20_60": 0.08,
            "bass_60_250": 0.16,
            "mid_1k_4k": 0.22,
        },
        marker_types={"harshness_band", "mono_incompatibility", "sibilance"},
        compression_type="lossless",
    )

    assert advice["recommended_mode"] == "v2"
    assert advice["recommended_backend"] == "internal"
    assert advice["recommended_refine_passes"] == 2
    assert 3 <= int(advice["optimizer_variants"]) <= 4


def test_ai_mastering_advice_reserves_v3_for_strong_but_recoverable_cases() -> None:
    advice = _ai_mastering_advice(
        integrated_lufs=-20.0,
        true_peak_dbfs=-2.6,
        crest_db=10.0,
        lra=6.5,
        clipping_ratio=0.0,
        spectral={
            "sub_20_60": 0.16,
            "bass_60_250": 0.18,
            "mid_1k_4k": 0.19,
        },
        marker_types={"mono_incompatibility", "harshness_band", "sibilance", "sub_bass_heavy"},
        compression_type="lossless",
    )

    assert advice["recommended_mode"] == "v3"
    assert advice["recommended_backend"] == "internal"
    assert advice["recommended_refine_passes"] == 2
    assert 4 <= int(advice["optimizer_variants"]) <= 5
