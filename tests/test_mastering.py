from __future__ import annotations

import numpy as np

import audioqi.mastering as mastering_module
from audioqi.core.metrics import dbfs, loudness_integrated_lufs, oversampled_true_peak
from audioqi.mastering import (
    PRESETS,
    _apply_master_chain,
    _build_source_adaptive_config,
    _finalize_master,
    _master_metrics,
    _mastering_compliance,
    _post_check_mastering_repair,
    _post_check_score,
    _quality_profile,
    _resolve_mastering_backend,
    _safe_limiter,
)


def test_source_adaptive_config_reports_and_tames_problem_audio() -> None:
    sr = 48_000
    duration_seconds = 2.5
    t = np.linspace(0, duration_seconds, int(sr * duration_seconds), endpoint=False, dtype=np.float64)

    low_band = 0.72 * np.sin(2 * np.pi * 42.0 * t)
    harsh_band = 0.48 * np.sin(2 * np.pi * 6500.0 * t)
    body = 0.16 * np.sin(2 * np.pi * 220.0 * t)
    dense = np.clip(low_band + harsh_band + body, -1.25, 1.25)
    dense[int(0.7 * sr) : int(0.74 * sr)] = 1.0

    stereo = np.stack([dense, dense * 0.92], axis=1)
    base_cfg = PRESETS["streaming"]
    source_profile = _quality_profile(stereo, sr=sr, cfg=base_cfg)
    source_metrics = _master_metrics(stereo, sr=sr)

    adapted_cfg, adaptation = _build_source_adaptive_config(
        cfg=base_cfg,
        source_profile=source_profile,
        source_metrics=source_metrics,
    )

    adjustments = adaptation.get("adjustments")
    assert isinstance(adjustments, list)
    assert adaptation.get("adjustment_count", 0) >= 2

    changed_fields = {str(item.get("field", "")) for item in adjustments if isinstance(item, dict)}
    assert "target_true_peak_dbfs" in changed_fields
    assert "deess_strength" in changed_fields
    assert "low_target_ratio" in changed_fields

    assert adapted_cfg.target_true_peak_dbfs <= base_cfg.target_true_peak_dbfs
    assert adapted_cfg.deess_strength >= base_cfg.deess_strength
    assert adapted_cfg.low_target_ratio <= base_cfg.low_target_ratio


def test_source_adaptive_config_strongly_relaxes_dense_material() -> None:
    sr = 48_000
    duration_seconds = 3.0
    t = np.linspace(0, duration_seconds, int(sr * duration_seconds), endpoint=False, dtype=np.float64)

    dense = (
        0.52 * np.sin(2 * np.pi * 70.0 * t)
        + 0.38 * np.sin(2 * np.pi * 220.0 * t)
        + 0.22 * np.sin(2 * np.pi * 2400.0 * t)
    )
    dense = np.tanh(dense * 1.6)
    stereo = np.stack([dense, dense * 0.98], axis=1)

    base_cfg = PRESETS["streaming"]
    source_profile = _quality_profile(stereo, sr=sr, cfg=base_cfg)
    source_metrics = _master_metrics(stereo, sr=sr)

    adapted_cfg, adaptation = _build_source_adaptive_config(
        cfg=base_cfg,
        source_profile=source_profile,
        source_metrics=source_metrics,
    )

    assert adaptation.get("adjustment_count", 0) >= 2
    assert adapted_cfg.comp_ratio <= 1.45
    assert adapted_cfg.comp_threshold_db >= -17.0
    assert adapted_cfg.limiter_drive <= 1.04


def test_master_chain_stays_close_to_plain_normalization_for_dense_safe_audio() -> None:
    sr = 48_000
    duration_seconds = 4.0
    t = np.linspace(0, duration_seconds, int(sr * duration_seconds), endpoint=False, dtype=np.float64)

    left = 0.34 * np.sin(2 * np.pi * 95.0 * t) + 0.23 * np.sin(2 * np.pi * 1900.0 * t)
    right = 0.33 * np.sin(2 * np.pi * 110.0 * t) + 0.21 * np.sin(2 * np.pi * 2300.0 * t)
    dense = np.tanh(np.stack([left, right], axis=1) * 1.45)

    cfg = PRESETS["streaming"]
    source_profile = _quality_profile(dense, sr=sr, cfg=cfg)
    source_metrics = _master_metrics(dense, sr=sr)
    adapted_cfg, _ = _build_source_adaptive_config(
        cfg=cfg,
        source_profile=source_profile,
        source_metrics=source_metrics,
    )

    mastered = _apply_master_chain(dense, sr=sr, cfg=adapted_cfg, normalize_to_targets=True)
    normalized_only = _finalize_master(dense, sr=sr, cfg=adapted_cfg)
    delta = float(np.sqrt(np.mean((mastered - normalized_only) ** 2)))

    assert delta < 0.12
    assert float(np.max(np.abs(mastered))) <= 0.999


def test_finalize_master_normalizes_close_to_lufs_target_and_respects_true_peak() -> None:
    sr = 48_000
    duration_seconds = 4.0
    t = np.linspace(0, duration_seconds, int(sr * duration_seconds), endpoint=False, dtype=np.float64)
    left = 0.26 * np.sin(2 * np.pi * 110.0 * t) + 0.13 * np.sin(2 * np.pi * 1600.0 * t)
    right = 0.24 * np.sin(2 * np.pi * 220.0 * t) + 0.11 * np.sin(2 * np.pi * 3200.0 * t)
    transient = np.zeros_like(left)
    transient[int(1.0 * sr) : int(1.01 * sr)] = 0.75
    stereo = np.stack([left + transient, right - transient], axis=1)

    cfg = PRESETS["streaming"]
    mastered = _finalize_master(stereo, sr=sr, cfg=cfg)

    integrated_lufs = loudness_integrated_lufs(mastered.astype(np.float32), sr=sr)
    true_peak_dbfs = float(dbfs(oversampled_true_peak(mastered.astype(np.float32), sr=sr)))

    assert np.isfinite(integrated_lufs)
    assert abs(integrated_lufs - cfg.target_lufs) <= 0.6
    assert true_peak_dbfs <= cfg.target_true_peak_dbfs + 0.12


def test_post_check_mastering_repair_can_improve_hot_and_dense_first_pass() -> None:
    sr = 48_000
    duration_seconds = 5.0
    t = np.linspace(0, duration_seconds, int(sr * duration_seconds), endpoint=False, dtype=np.float64)
    left = 0.33 * np.sin(2 * np.pi * 90.0 * t) + 0.18 * np.sin(2 * np.pi * 2800.0 * t)
    right = 0.3 * np.sin(2 * np.pi * 180.0 * t) + 0.16 * np.sin(2 * np.pi * 5600.0 * t)
    source = np.stack([left, right], axis=1)

    target_cfg = PRESETS["streaming"]
    first_pass_cfg = PRESETS["club"]
    first_pass = _apply_master_chain(source, sr=sr, cfg=first_pass_cfg, normalize_to_targets=True)
    before_profile = _quality_profile(first_pass, sr=sr, cfg=target_cfg)
    before_score = _post_check_score(before_profile, cfg=target_cfg)
    before_compliance = _mastering_compliance(before_profile, cfg=target_cfg)

    repaired_audio, repair = _post_check_mastering_repair(
        source_audio=source,
        mastered_audio=first_pass,
        sr=sr,
        cfg=target_cfg,
        progress=None,
        start_progress=0.0,
        end_progress=100.0,
    )
    after_profile = _quality_profile(repaired_audio, sr=sr, cfg=target_cfg)
    after_score = _post_check_score(after_profile, cfg=target_cfg)
    after_compliance = _mastering_compliance(after_profile, cfg=target_cfg)

    assert repair.get("attempted") is True
    assert after_score < before_score
    assert len(after_compliance.get("failed", [])) <= len(before_compliance.get("failed", []))


def test_safe_limiter_is_transparent_when_signal_is_already_safe() -> None:
    sr = 48_000
    t = np.linspace(0, 1.0, sr, endpoint=False, dtype=np.float64)
    source = np.stack([
        0.18 * np.sin(2 * np.pi * 440.0 * t),
        0.16 * np.sin(2 * np.pi * 660.0 * t),
    ], axis=1)

    limited = _safe_limiter(source, drive=1.35)
    delta = float(np.sqrt(np.mean((limited - source) ** 2)))

    assert delta < 0.02
    assert float(np.max(np.abs(limited))) <= 0.999


def test_auto_backend_prefers_internal_over_ffmpeg(monkeypatch) -> None:
    monkeypatch.setattr(mastering_module.shutil, "which", lambda name: "ffmpeg.exe" if name == "ffmpeg" else None)
    monkeypatch.setattr(mastering_module, "_module_available", lambda name: False)

    resolved = _resolve_mastering_backend(backend="auto", reference_path=None)

    assert resolved["selected"] == "internal"
    assert resolved["availability"]["ffmpeg"] is True
