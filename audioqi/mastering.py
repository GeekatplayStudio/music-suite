from __future__ import annotations

import hashlib
import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfiltfilt

from audioqi.core.markers import (
    harshness_markers,
    loudness_dip_markers,
    mono_compat_markers,
    sub_bass_markers,
)
from audioqi.core.metrics import (
    clipping_segments,
    crest_factor_db,
    dbfs,
    loudness_integrated_lufs,
    loudness_timeline_lufs,
    oversampled_true_peak,
    spectral_balance,
    stereo_timelines,
)
from audioqi.io.decode import decode_to_canonical
from audioqi.storage import read_json, write_json

EPS = 1e-12

SUPPORTED_MASTERING_MODES = ("v1", "v2", "v3")
SUPPORTED_MASTERING_PRESETS = ("streaming", "club", "film", "voice")
SUPPORTED_MASTERING_BACKENDS = (
    "auto",
    "internal",
    "ffmpeg",
    "pedalboard",
    "matchering",
)
SUPPORTED_MASTERING_NORMALIZATION_PROFILES = (
    "off",
    "youtube",
    "spotify",
    "apple_music",
    "instagram",
    "tiktok",
    "broadcast_ebu",
    "podcast_voice",
)

NORMALIZATION_PROFILES: dict[str, dict[str, Any]] = {
    "off": {
        "name": "Off (preset/manual)",
        "target_lufs": None,
        "target_true_peak_dbfs": None,
        "description": "Disable normalization profile and use preset/manual targets.",
    },
    "youtube": {
        "name": "YouTube",
        "target_lufs": -14.0,
        "target_true_peak_dbfs": -1.0,
        "description": "Common YouTube delivery target.",
    },
    "spotify": {
        "name": "Spotify",
        "target_lufs": -14.0,
        "target_true_peak_dbfs": -1.0,
        "description": "Typical Spotify normalization alignment.",
    },
    "apple_music": {
        "name": "Apple Music",
        "target_lufs": -16.0,
        "target_true_peak_dbfs": -1.0,
        "description": "Conservative Apple Music style target.",
    },
    "instagram": {
        "name": "Instagram",
        "target_lufs": -14.0,
        "target_true_peak_dbfs": -1.0,
        "description": "Mobile/social-friendly loudness target.",
    },
    "tiktok": {
        "name": "TikTok",
        "target_lufs": -14.0,
        "target_true_peak_dbfs": -1.0,
        "description": "Short-form social media loudness target.",
    },
    "broadcast_ebu": {
        "name": "Broadcast EBU R128",
        "target_lufs": -23.0,
        "target_true_peak_dbfs": -1.0,
        "description": "EBU R128 style broadcast delivery.",
    },
    "podcast_voice": {
        "name": "Podcast Voice",
        "target_lufs": -16.0,
        "target_true_peak_dbfs": -1.5,
        "description": "Speech-forward normalization target.",
    },
}

MasteringProgressCallback = Callable[[float, str], None]


@dataclass(frozen=True)
class MasterPreset:
    name: str
    target_lufs: float
    target_true_peak_dbfs: float
    comp_ratio: float
    comp_threshold_db: float
    deess_strength: float
    low_target_ratio: float
    high_target_ratio: float
    limiter_drive: float
    desired_crest_db: float


PRESETS: dict[str, MasterPreset] = {
    "streaming": MasterPreset(
        name="streaming",
        target_lufs=-14.0,
        target_true_peak_dbfs=-1.0,
        comp_ratio=2.2,
        comp_threshold_db=-20.0,
        deess_strength=0.55,
        low_target_ratio=0.25,
        high_target_ratio=0.23,
        limiter_drive=1.15,
        desired_crest_db=9.5,
    ),
    "club": MasterPreset(
        name="club",
        target_lufs=-9.0,
        target_true_peak_dbfs=-0.5,
        comp_ratio=2.8,
        comp_threshold_db=-18.0,
        deess_strength=0.45,
        low_target_ratio=0.30,
        high_target_ratio=0.22,
        limiter_drive=1.35,
        desired_crest_db=7.5,
    ),
    "film": MasterPreset(
        name="film",
        target_lufs=-18.0,
        target_true_peak_dbfs=-2.0,
        comp_ratio=1.8,
        comp_threshold_db=-24.0,
        deess_strength=0.4,
        low_target_ratio=0.23,
        high_target_ratio=0.20,
        limiter_drive=1.05,
        desired_crest_db=12.0,
    ),
    "voice": MasterPreset(
        name="voice",
        target_lufs=-16.0,
        target_true_peak_dbfs=-1.5,
        comp_ratio=2.5,
        comp_threshold_db=-21.0,
        deess_strength=0.75,
        low_target_ratio=0.18,
        high_target_ratio=0.26,
        limiter_drive=1.1,
        desired_crest_db=8.8,
    ),
}


def mastering_status_path(run_dir: Path) -> Path:
    return run_dir / "mastering_status.json"


def mastering_manifest_path(run_dir: Path) -> Path:
    return run_dir / "mastering_manifest.json"


def mastering_output_dir(run_dir: Path) -> Path:
    return run_dir / "mastering"


def default_mastering_state() -> dict[str, Any]:
    return {
        "status": "idle",
        "progress": 0.0,
        "error_message": None,
        "mode": "v1",
        "preset": "streaming",
        "backend": "internal",
        "stage": "idle",
        "detail": "Idle.",
        "updated_at": _utc_now_iso(),
    }


def read_mastering_state(run_dir: Path) -> dict[str, Any]:
    path = mastering_status_path(run_dir)
    if not path.exists():
        return default_mastering_state()
    try:
        payload = read_json(path)
    except (OSError, ValueError):
        return default_mastering_state()
    state = default_mastering_state()
    state.update({k: v for k, v in payload.items() if k in state})
    return state


def write_mastering_state(run_dir: Path, state: dict[str, Any]) -> None:
    payload = default_mastering_state()
    payload.update(state)
    payload["updated_at"] = _utc_now_iso()
    write_json(mastering_status_path(run_dir), payload)


def read_mastering_manifest(run_dir: Path) -> dict[str, Any] | None:
    path = mastering_manifest_path(run_dir)
    if not path.exists():
        return None
    try:
        return read_json(path)
    except (OSError, ValueError):
        return None


def reset_mastering_outputs(run_dir: Path) -> None:
    out_dir = mastering_output_dir(run_dir)
    if out_dir.exists():
        shutil.rmtree(out_dir, ignore_errors=True)
    for path in (
        mastering_status_path(run_dir),
        mastering_manifest_path(run_dir),
        run_dir / "mastering_source.wav",
    ):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            continue


def parse_mastering_mode(mode: str) -> str | None:
    mode_norm = mode.strip().lower()
    if mode_norm in SUPPORTED_MASTERING_MODES:
        return mode_norm
    return None


def parse_mastering_preset(preset: str) -> str | None:
    preset_norm = preset.strip().lower()
    if preset_norm in SUPPORTED_MASTERING_PRESETS:
        return preset_norm
    return None


def parse_mastering_backend(backend: str) -> str | None:
    backend_norm = backend.strip().lower()
    if backend_norm in SUPPORTED_MASTERING_BACKENDS:
        return backend_norm
    return None


def parse_mastering_normalization_profile(profile: str | None) -> str | None:
    if profile is None:
        return None
    profile_norm = profile.strip().lower()
    if not profile_norm:
        return None
    if profile_norm in SUPPORTED_MASTERING_NORMALIZATION_PROFILES:
        return profile_norm
    return None


def run_mastering(
    source_path: Path,
    run_dir: Path,
    mode: str,
    preset: str,
    normalization_profile: str | None = None,
    target_lufs: float | None = None,
    true_peak_dbfs: float | None = None,
    optimizer_variants: int = 4,
    backend: str = "auto",
    reference_path: Path | None = None,
    max_refine_passes: int = 3,
    progress: MasteringProgressCallback | None = None,
) -> dict[str, Any]:
    preset_cfg = PRESETS[preset]
    normalized_profile = (
        parse_mastering_normalization_profile(normalization_profile) or "off"
    )
    profile_payload = NORMALIZATION_PROFILES.get(normalized_profile, NORMALIZATION_PROFILES["off"])
    profile_target_lufs = profile_payload.get("target_lufs")
    profile_target_true_peak = profile_payload.get("target_true_peak_dbfs")
    working_cfg = replace(
        preset_cfg,
        target_lufs=(
            target_lufs
            if target_lufs is not None
            else (
                float(profile_target_lufs)
                if isinstance(profile_target_lufs, (int, float))
                else preset_cfg.target_lufs
            )
        ),
        target_true_peak_dbfs=true_peak_dbfs
        if true_peak_dbfs is not None
        else (
            float(profile_target_true_peak)
            if isinstance(profile_target_true_peak, (int, float))
            else preset_cfg.target_true_peak_dbfs
        ),
    )
    variants = int(max(2, min(8, optimizer_variants)))
    refine_passes = int(max(1, min(5, max_refine_passes)))
    resolved_backend = _resolve_mastering_backend(backend=backend, reference_path=reference_path)

    request_settings = {
        "mode": mode,
        "preset": preset,
        "normalization_profile": normalized_profile,
        "target_lufs": target_lufs,
        "target_true_peak_dbfs": true_peak_dbfs,
        "optimizer_variants": variants,
        "backend": backend,
        "reference_path": str(reference_path) if reference_path else None,
        "max_refine_passes": refine_passes,
    }
    audio, sr = _load_working_audio(source_path=source_path, run_dir=run_dir)
    source_profile = _quality_profile(audio, sr=sr, cfg=working_cfg)
    source_metrics = _master_metrics(audio, sr=sr)
    working_cfg, adaptation = _build_source_adaptive_config(
        cfg=working_cfg,
        source_profile=source_profile,
        source_metrics=source_metrics,
    )
    applied_settings = _config_to_dict(working_cfg)
    applied_settings["normalization_profile"] = normalized_profile
    applied_settings["optimizer_variants"] = variants
    applied_settings["max_refine_passes"] = refine_passes
    out_dir = mastering_output_dir(run_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    backend_notes: list[str] = []

    if mode == "v1":
        if progress:
            progress(8.0, "prepare")
        mastered = _apply_master_chain(audio, sr, working_cfg, normalize_to_targets=True)
        if resolved_backend["selected"] != "internal":
            if progress:
                progress(34.0, f"backend_{resolved_backend['selected']}")
            backend_mastered, backend_note = _try_backend_master_pass(
                backend=resolved_backend["selected"],
                source_path=source_path,
                current_audio=mastered,
                sr=sr,
                cfg=working_cfg,
                run_dir=run_dir,
                reference_path=reference_path,
                tag="v1",
            )
            if backend_mastered is not None:
                mastered = backend_mastered
                if backend_note:
                    backend_notes.append(backend_note)
            else:
                backend_notes.append(
                    "Backend "
                    f"'{resolved_backend['selected']}' unavailable; fell back to internal chain."
                )
                resolved_backend["selected"] = "internal"
        if progress:
            progress(65.0, "process")
        mastered, refinement = _refine_mastered_audio(
            source_audio=audio,
            mastered_audio=mastered,
            sr=sr,
            cfg=working_cfg,
            max_passes=refine_passes,
            allow_stem_fallback=True,
            progress=progress,
            start_progress=68.0,
            end_progress=90.0,
        )
        mastered, post_check_repair = _post_check_mastering_repair(
            source_audio=audio,
            mastered_audio=mastered,
            sr=sr,
            cfg=working_cfg,
            progress=progress,
            start_progress=90.0,
            end_progress=96.0,
        )
        output_path = out_dir / "master_v1.wav"
        _write_audio(output_path, mastered, sr)
        metrics = _master_metrics(mastered, sr)
        outputs = [_output_record("master_v1", output_path, metrics)]
        if progress:
            progress(96.0, "self_check")
        best_audio = _load_audio(output_path)
        self_check = _mastering_self_check(
            source_audio=audio,
            mastered_audio=best_audio,
            sr=sr,
            cfg=working_cfg,
            best_output_id="master_v1",
            post_check_repair=post_check_repair,
        )
        manifest = {
            "created_at": _utc_now_iso(),
            "mode": mode,
            "preset": preset,
            "target_lufs": working_cfg.target_lufs,
            "target_true_peak_dbfs": working_cfg.target_true_peak_dbfs,
            "normalization_profile": {
                "id": normalized_profile,
                "name": profile_payload.get("name"),
                "description": profile_payload.get("description"),
            },
            "request_settings": request_settings,
            "applied_settings": applied_settings,
            "source_file": str(source_path),
            "source_filename": source_path.name,
            "outputs": outputs,
            "best_output_id": "master_v1",
            "adaptation": adaptation,
            "backend": {
                "requested": backend,
                "selected": resolved_backend["selected"],
                "availability": resolved_backend["availability"],
                "notes": backend_notes,
            },
            "refinement": refinement,
            "pro_features": _pro_feature_status(),
            "self_check": self_check,
        }
        if progress:
            progress(100.0, "done")
        write_json(mastering_manifest_path(run_dir), manifest)
        return manifest

    if mode == "v2":
        if progress:
            progress(5.0, "prepare")
        candidate_cfgs = _optimizer_candidates(working_cfg, variants)
        rankings: list[dict[str, Any]] = []
        outputs: list[dict[str, Any]] = []
        best_score = float("inf")
        best_path: Path | None = None

        for idx, cfg in enumerate(candidate_cfgs, start=1):
            stage = f"variant_{idx}"
            mastered = _apply_master_chain(audio, sr, cfg, normalize_to_targets=True)
            output_id = f"master_v2_variant_{idx}"
            output_path = out_dir / f"{output_id}.wav"
            _write_audio(output_path, mastered, sr)
            metrics = _master_metrics(mastered, sr)
            score = _optimizer_score(metrics=metrics, cfg=cfg)
            entry = _output_record(output_id, output_path, metrics, score=score)
            outputs.append(entry)
            rankings.append(
                {"output_id": output_id, "score": score, "config": _config_to_dict(cfg)}
            )
            if score < best_score:
                best_score = score
                best_path = output_path
            if progress:
                progress(10.0 + 78.0 * idx / max(variants, 1), stage)

        best_out = out_dir / "master_v2_best.wav"
        if best_path is not None:
            shutil.copy2(best_path, best_out)
            best_audio = _load_audio(best_out)
        else:
            best_audio = audio

        if resolved_backend["selected"] != "internal":
            if progress:
                progress(84.0, f"backend_{resolved_backend['selected']}")
            backend_mastered, backend_note = _try_backend_master_pass(
                backend=resolved_backend["selected"],
                source_path=source_path,
                current_audio=best_audio,
                sr=sr,
                cfg=working_cfg,
                run_dir=run_dir,
                reference_path=reference_path,
                tag="v2_best",
            )
            if backend_mastered is not None:
                best_audio = backend_mastered
                if backend_note:
                    backend_notes.append(backend_note)
            else:
                backend_notes.append(
                    "Backend "
                    f"'{resolved_backend['selected']}' unavailable; fell back to internal chain."
                )
                resolved_backend["selected"] = "internal"

        best_audio, refinement = _refine_mastered_audio(
            source_audio=audio,
            mastered_audio=best_audio,
            sr=sr,
            cfg=working_cfg,
            max_passes=refine_passes,
            allow_stem_fallback=True,
            progress=progress,
            start_progress=86.0,
            end_progress=92.0,
        )
        best_audio, post_check_repair = _post_check_mastering_repair(
            source_audio=audio,
            mastered_audio=best_audio,
            sr=sr,
            cfg=working_cfg,
            progress=progress,
            start_progress=92.0,
            end_progress=96.0,
        )
        _write_audio(best_out, best_audio, sr)
        best_metrics = _master_metrics(best_audio, sr)
        final_best_score = _optimizer_score(metrics=best_metrics, cfg=working_cfg)
        outputs.append(_output_record("master_v2_best", best_out, best_metrics, score=final_best_score))

        if progress:
            progress(96.0, "self_check")
        best_output_id = "master_v2_best"
        self_check = _mastering_self_check(
            source_audio=audio,
            mastered_audio=best_audio,
            sr=sr,
            cfg=working_cfg,
            best_output_id=best_output_id,
            post_check_repair=post_check_repair,
        )

        manifest = {
            "created_at": _utc_now_iso(),
            "mode": mode,
            "preset": preset,
            "target_lufs": working_cfg.target_lufs,
            "target_true_peak_dbfs": working_cfg.target_true_peak_dbfs,
            "normalization_profile": {
                "id": normalized_profile,
                "name": profile_payload.get("name"),
                "description": profile_payload.get("description"),
            },
            "request_settings": request_settings,
            "applied_settings": applied_settings,
            "source_file": str(source_path),
            "source_filename": source_path.name,
            "outputs": outputs,
            "best_output_id": best_output_id,
            "adaptation": adaptation,
            "optimizer": {
                "variant_count": variants,
                "rankings": sorted(rankings, key=lambda item: float(item["score"])),
            },
            "backend": {
                "requested": backend,
                "selected": resolved_backend["selected"],
                "availability": resolved_backend["availability"],
                "notes": backend_notes,
            },
            "refinement": refinement,
            "pro_features": _pro_feature_status(),
            "self_check": self_check,
        }
        if progress:
            progress(100.0, "done")
        write_json(mastering_manifest_path(run_dir), manifest)
        return manifest

    if mode == "v3":
        if progress:
            progress(7.0, "stems")
        stems = _spectral_stems(audio, sr)
        processed: dict[str, np.ndarray] = {}

        stem_cfgs = {
            "bass": replace(
                working_cfg, deess_strength=0.05, comp_ratio=working_cfg.comp_ratio + 0.4
            ),
            "vocals": replace(
                working_cfg,
                deess_strength=min(1.0, working_cfg.deess_strength * 1.4),
                low_target_ratio=max(0.14, working_cfg.low_target_ratio - 0.04),
            ),
            "drums": replace(
                working_cfg,
                comp_ratio=max(1.3, working_cfg.comp_ratio - 0.25),
                limiter_drive=working_cfg.limiter_drive + 0.08,
            ),
            "other": working_cfg,
        }

        stem_names = ["bass", "vocals", "drums", "other"]
        for idx, name in enumerate(stem_names, start=1):
            processed[name] = _apply_master_chain(
                stems[name], sr, stem_cfgs[name], normalize_to_targets=False
            )
            stem_path = out_dir / f"stem_{name}.wav"
            _write_audio(stem_path, processed[name], sr)
            if progress:
                progress(8.0 + 46.0 * idx / len(stem_names), f"process_{name}")

        recombined = (
            processed["bass"] + processed["vocals"] + processed["drums"] + processed["other"]
        )
        mastered = _finalize_master(recombined, sr, working_cfg)

        if resolved_backend["selected"] != "internal":
            if progress:
                progress(79.0, f"backend_{resolved_backend['selected']}")
            backend_mastered, backend_note = _try_backend_master_pass(
                backend=resolved_backend["selected"],
                source_path=source_path,
                current_audio=mastered,
                sr=sr,
                cfg=working_cfg,
                run_dir=run_dir,
                reference_path=reference_path,
                tag="v3",
            )
            if backend_mastered is not None:
                mastered = backend_mastered
                if backend_note:
                    backend_notes.append(backend_note)
            else:
                backend_notes.append(
                    "Backend "
                    f"'{resolved_backend['selected']}' unavailable; fell back to internal chain."
                )
                resolved_backend["selected"] = "internal"

        mastered, refinement = _refine_mastered_audio(
            source_audio=audio,
            mastered_audio=mastered,
            sr=sr,
            cfg=working_cfg,
            max_passes=refine_passes,
            allow_stem_fallback=False,
            progress=progress,
            start_progress=82.0,
            end_progress=92.0,
        )
        mastered, post_check_repair = _post_check_mastering_repair(
            source_audio=audio,
            mastered_audio=mastered,
            sr=sr,
            cfg=working_cfg,
            progress=progress,
            start_progress=92.0,
            end_progress=96.0,
        )
        master_path = out_dir / "master_v3.wav"
        _write_audio(master_path, mastered, sr)
        if progress:
            progress(96.0, "finalize")

        outputs = [
            _output_record("master_v3", master_path, _master_metrics(mastered, sr)),
            _output_record(
                "stem_bass", out_dir / "stem_bass.wav", _master_metrics(processed["bass"], sr)
            ),
            _output_record(
                "stem_vocals", out_dir / "stem_vocals.wav", _master_metrics(processed["vocals"], sr)
            ),
            _output_record(
                "stem_drums", out_dir / "stem_drums.wav", _master_metrics(processed["drums"], sr)
            ),
            _output_record(
                "stem_other", out_dir / "stem_other.wav", _master_metrics(processed["other"], sr)
            ),
        ]
        if progress:
            progress(96.0, "self_check")
        best_audio = _load_audio(master_path)
        self_check = _mastering_self_check(
            source_audio=audio,
            mastered_audio=best_audio,
            sr=sr,
            cfg=working_cfg,
            best_output_id="master_v3",
            post_check_repair=post_check_repair,
        )

        manifest = {
            "created_at": _utc_now_iso(),
            "mode": mode,
            "preset": preset,
            "target_lufs": working_cfg.target_lufs,
            "target_true_peak_dbfs": working_cfg.target_true_peak_dbfs,
            "normalization_profile": {
                "id": normalized_profile,
                "name": profile_payload.get("name"),
                "description": profile_payload.get("description"),
            },
            "request_settings": request_settings,
            "applied_settings": applied_settings,
            "source_file": str(source_path),
            "source_filename": source_path.name,
            "outputs": outputs,
            "best_output_id": "master_v3",
            "adaptation": adaptation,
            "stems": {
                "backend": "spectral",
                "names": stem_names,
            },
            "backend": {
                "requested": backend,
                "selected": resolved_backend["selected"],
                "availability": resolved_backend["availability"],
                "notes": backend_notes,
            },
            "refinement": refinement,
            "pro_features": _pro_feature_status(),
            "self_check": self_check,
        }
        if progress:
            progress(100.0, "done")
        write_json(mastering_manifest_path(run_dir), manifest)
        return manifest

    raise RuntimeError(f"Unsupported mastering mode: {mode}")


def _load_working_audio(source_path: Path, run_dir: Path) -> tuple[np.ndarray, int]:
    temp_wav = run_dir / "mastering_source.wav"
    decode_to_canonical(source_path, temp_wav)
    data, sr = sf.read(str(temp_wav), dtype="float32", always_2d=True)
    return data.astype(np.float64), int(sr)


def _load_audio(path: Path) -> np.ndarray:
    data, _ = sf.read(str(path), dtype="float32", always_2d=True)
    return data.astype(np.float64)


def _write_audio(path: Path, data: np.ndarray, sr: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), np.clip(data, -0.999, 0.999).astype(np.float32), sr, subtype="FLOAT")


def _build_source_adaptive_config(
    cfg: MasterPreset,
    source_profile: dict[str, Any],
    source_metrics: dict[str, Any],
) -> tuple[MasterPreset, dict[str, Any]]:
    adjusted = cfg
    adjustments: list[dict[str, Any]] = []
    marker_counts = source_profile.get("marker_counts", {})
    counts = marker_counts if isinstance(marker_counts, dict) else {}
    spectral = source_metrics.get("spectral_balance", {})
    spectral_balance_payload = spectral if isinstance(spectral, dict) else {}
    crest = float(source_metrics.get("crest_factor_db", 0.0))

    def apply_change(field: str, value: float, reason: str) -> None:
        nonlocal adjusted
        before = float(getattr(adjusted, field))
        after = float(value)
        if abs(after - before) < 1e-6:
            return
        adjusted = replace(adjusted, **{field: after})
        adjustments.append(
            {
                "field": field,
                "before": round(before, 4),
                "after": round(after, 4),
                "reason": reason,
            }
        )

    clipping_count = int(counts.get("clipping", 0))
    tp_risk_count = int(counts.get("true_peak_risk", 0))
    harsh_count = int(counts.get("harshness_band", 0))
    sub_count = int(counts.get("sub_bass_heavy", 0))
    mono_count = int(counts.get("mono_incompatibility", 0))
    dip_count = int(counts.get("loudness_dip", 0))

    if clipping_count > 0 or tp_risk_count > 0:
        apply_change(
            "target_true_peak_dbfs",
            min(adjusted.target_true_peak_dbfs, -1.2),
            "Added extra true-peak headroom because clipping or true-peak risk was detected.",
        )
        apply_change(
            "limiter_drive",
            max(1.0, adjusted.limiter_drive - 0.08),
            "Reduced limiter drive to avoid pushing clipped or near-clipped material harder.",
        )

    if harsh_count > 0:
        apply_change(
            "deess_strength",
            min(1.2, adjusted.deess_strength + 0.16 + 0.04 * min(harsh_count, 3)),
            "Raised de-essing because harsh 3k-9k regions were detected in the source.",
        )
        apply_change(
            "high_target_ratio",
            max(0.14, adjusted.high_target_ratio - 0.012),
            "Pulled back high-band target slightly to reduce aggressive top-end emphasis.",
        )

    if sub_count > 0:
        apply_change(
            "low_target_ratio",
            max(0.14, adjusted.low_target_ratio - (0.018 + 0.004 * min(sub_count, 3))),
            "Reduced low-band target because heavy sub-bass sections were detected.",
        )
        apply_change(
            "comp_ratio",
            min(3.9, adjusted.comp_ratio + 0.14),
            "Added mild extra control to stabilize low-end heavy material.",
        )

    if mono_count > 0:
        apply_change(
            "limiter_drive",
            max(1.0, adjusted.limiter_drive - 0.04),
            "Backed off limiter drive because mono-compatibility issues were detected.",
        )

    if dip_count > 0:
        apply_change(
            "comp_threshold_db",
            max(-28.0, adjusted.comp_threshold_db - 0.75),
            "Lowered compression threshold slightly to smooth low-energy loudness dips.",
        )

    if crest > 0.0 and crest < 8.0:
        apply_change(
            "comp_ratio",
            min(max(1.18, adjusted.comp_ratio - 0.7), 1.45),
            "Relaxed bus compression because crest factor suggests the source is already dense.",
        )
        apply_change(
            "comp_threshold_db",
            min(-14.0, adjusted.comp_threshold_db + 3.0),
            "Raised the compression threshold so dense material is not squeezed further.",
        )
        apply_change(
            "limiter_drive",
            min(max(1.0, adjusted.limiter_drive - 0.18), 1.04),
            "Reduced limiter drive to preserve more transient shape on a dense source.",
        )
        if harsh_count == 0:
            apply_change(
                "deess_strength",
                max(0.18, adjusted.deess_strength * 0.72),
                "Lowered de-essing because the source is dense but not measurably harsh.",
            )
    elif crest > 16.0 and clipping_count == 0:
        apply_change(
            "comp_ratio",
            min(3.9, adjusted.comp_ratio + 0.18),
            "Added gentle compression because crest factor suggests the source is under-controlled.",
        )

    air_share = float(spectral_balance_payload.get("air_10k_20k", 0.0))
    if harsh_count == 0 and air_share < 0.035:
        apply_change(
            "high_target_ratio",
            min(0.3, adjusted.high_target_ratio + 0.012),
            "Restored a small amount of top-end target because the source air band looks limited.",
        )

    return adjusted, {
        "enabled": True,
        "adjustment_count": len(adjustments),
        "adjustments": adjustments,
        "source_issue_score": int(source_profile.get("issue_score", 0)),
        "source_marker_counts": counts,
        "source_metrics": {
            "integrated_lufs": source_metrics.get("integrated_lufs"),
            "true_peak_dbfs": source_metrics.get("true_peak_dbfs"),
            "crest_factor_db": source_metrics.get("crest_factor_db"),
            "spectral_balance": spectral_balance_payload,
        },
    }


def _resample_audio_to_sr(audio: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if src_sr == dst_sr:
        return np.asarray(audio, dtype=np.float64)
    signal = np.asarray(audio, dtype=np.float64)
    if signal.ndim == 1:
        signal = signal[:, np.newaxis]
    gcd = int(np.gcd(max(1, int(src_sr)), max(1, int(dst_sr))))
    up = max(1, int(dst_sr) // gcd)
    down = max(1, int(src_sr) // gcd)
    channels: list[np.ndarray] = []
    for ch in range(signal.shape[1]):
        channels.append(resample_poly(signal[:, ch], up, down).astype(np.float64, copy=False))
    return np.stack(channels, axis=1)


def _match_target_channels(audio: np.ndarray, target_channels: int) -> np.ndarray:
    signal = np.asarray(audio, dtype=np.float64)
    if signal.ndim == 1:
        signal = signal[:, np.newaxis]
    target = max(1, int(target_channels))
    current = int(signal.shape[1]) if signal.ndim == 2 else 1
    if current == target:
        return signal
    if current > target:
        return signal[:, :target]
    if current == 1:
        return np.repeat(signal, target, axis=1)
    reps = int(np.ceil(target / current))
    tiled = np.tile(signal, (1, reps))
    return tiled[:, :target]


def _apply_master_chain(
    audio: np.ndarray,
    sr: int,
    cfg: MasterPreset,
    normalize_to_targets: bool,
) -> np.ndarray:
    y = np.asarray(audio, dtype=np.float64)
    y = _highpass(y, sr=sr, cutoff_hz=24.0)
    y = _spectral_tilt(y, sr=sr, cfg=cfg)
    y = _deesser(y, sr=sr, strength=cfg.deess_strength)
    y = _broadband_compression(y, sr=sr, threshold_db=cfg.comp_threshold_db, ratio=cfg.comp_ratio)
    if normalize_to_targets:
        y = _finalize_master(y, sr=sr, cfg=cfg)
    else:
        y = _safe_limiter(y, drive=max(1.0, cfg.limiter_drive - 0.05), sr=sr)
    return np.clip(y, -0.999, 0.999)


def _resolve_mastering_backend(
    backend: str,
    reference_path: Path | None,
) -> dict[str, Any]:
    requested = backend.strip().lower()
    availability = {
        "internal": True,
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "pedalboard": _module_available("pedalboard"),
        "matchering": _module_available("matchering") and reference_path is not None,
    }
    if requested == "auto":
        if availability["matchering"]:
            selected = "matchering"
        elif availability["pedalboard"]:
            selected = "pedalboard"
        else:
            selected = "internal"
    elif availability.get(requested, False):
        selected = requested
    else:
        selected = "internal"
    return {
        "requested": requested,
        "selected": selected,
        "availability": availability,
    }


def _try_backend_master_pass(
    backend: str,
    source_path: Path,
    current_audio: np.ndarray,
    sr: int,
    cfg: MasterPreset,
    run_dir: Path,
    reference_path: Path | None,
    tag: str,
) -> tuple[np.ndarray | None, str | None]:
    if backend == "internal":
        return current_audio, "Internal backend selected."
    try:
        if backend == "ffmpeg":
            processed = _master_with_ffmpeg_backend(
                current_audio=current_audio,
                sr=sr,
                cfg=cfg,
                run_dir=run_dir,
                tag=tag,
            )
            return processed, "Applied ffmpeg mastering backend pass."
        if backend == "pedalboard":
            processed = _master_with_pedalboard_backend(
                current_audio=current_audio,
                sr=sr,
                cfg=cfg,
            )
            return processed, "Applied pedalboard mastering backend pass."
        if backend == "matchering":
            processed = _master_with_matchering_backend(
                source_path=source_path,
                current_audio=current_audio,
                sr=sr,
                cfg=cfg,
                run_dir=run_dir,
                reference_path=reference_path,
                tag=tag,
            )
            return processed, "Applied matchering reference mastering backend pass."
    except Exception as exc:
        return None, f"Backend '{backend}' failed: {exc}"
    return None, f"Unsupported backend '{backend}'."


def _master_with_ffmpeg_backend(
    current_audio: np.ndarray,
    sr: int,
    cfg: MasterPreset,
    run_dir: Path,
    tag: str,
) -> np.ndarray:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is not installed.")
    target_in = run_dir / "mastering" / f"backend_{tag}_in.wav"
    target_out = run_dir / "mastering" / f"backend_{tag}_ffmpeg.wav"
    _write_audio(target_in, current_audio, sr)

    limiter_ceiling = float(np.clip(_db_to_linear(cfg.target_true_peak_dbfs), 0.1, 0.999))
    filter_chain = (
        "highpass=f=24,"
        f"acompressor=threshold={cfg.comp_threshold_db}dB:ratio={cfg.comp_ratio:.3f}:"
        "attack=10:release=120,"
        f"loudnorm=I={cfg.target_lufs}:TP={cfg.target_true_peak_dbfs}:LRA=11,"
        f"alimiter=limit={limiter_ceiling:.6f}"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(target_in),
        "-af",
        filter_chain,
        str(target_out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=300)
    if proc.returncode != 0:
        stderr = proc.stderr.strip() if proc.stderr else "unknown ffmpeg error"
        raise RuntimeError(stderr)
    if not target_out.exists():
        raise RuntimeError("ffmpeg backend did not produce output.")
    data, out_sr = sf.read(str(target_out), dtype="float32", always_2d=True)
    aligned = _resample_audio_to_sr(data.astype(np.float64), src_sr=int(out_sr), dst_sr=sr)
    aligned = _match_target_channels(aligned, target_channels=current_audio.shape[1])
    return _finalize_master(aligned, sr=sr, cfg=cfg)


def _master_with_pedalboard_backend(
    current_audio: np.ndarray,
    sr: int,
    cfg: MasterPreset,
) -> np.ndarray:
    try:
        import pedalboard as pb  # type: ignore
    except Exception as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("pedalboard dependency unavailable.") from exc

    plugins: list[Any] = []
    if hasattr(pb, "HighpassFilter"):
        plugins.append(pb.HighpassFilter(cutoff_frequency_hz=24.0))
    if hasattr(pb, "Compressor"):
        plugins.append(
            pb.Compressor(
                threshold_db=cfg.comp_threshold_db,
                ratio=max(1.05, cfg.comp_ratio),
                attack_ms=10.0,
                release_ms=120.0,
            )
        )
    if hasattr(pb, "Limiter"):
        plugins.append(pb.Limiter(threshold_db=cfg.target_true_peak_dbfs))
    if not plugins:
        raise RuntimeError("pedalboard plugin primitives unavailable.")

    board = pb.Pedalboard(plugins)
    source = np.asarray(current_audio, dtype=np.float32).T
    result = board(source, sr)
    processed = result if isinstance(result, np.ndarray) else np.asarray(result)
    if processed.ndim == 1:
        processed = processed[np.newaxis, :]
    return _finalize_master(processed.T.astype(np.float64), sr=sr, cfg=cfg)


def _master_with_matchering_backend(
    source_path: Path,
    current_audio: np.ndarray,
    sr: int,
    cfg: MasterPreset,
    run_dir: Path,
    reference_path: Path | None,
    tag: str,
) -> np.ndarray:
    if reference_path is None:
        raise RuntimeError("matchering backend requires a reference path.")
    if not reference_path.exists():
        raise RuntimeError(f"reference path not found: {reference_path}")
    try:
        import matchering as mg  # type: ignore
    except Exception as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("matchering dependency unavailable.") from exc

    target_in = run_dir / "mastering" / f"backend_{tag}_target.wav"
    target_out = run_dir / "mastering" / f"backend_{tag}_matchering.wav"
    _write_audio(target_in, current_audio, sr)

    result_factory = None
    for name in ("pcm24", "pcm16", "wav"):
        candidate = getattr(mg, name, None)
        if callable(candidate):
            result_factory = candidate
            break
    if result_factory is None:
        raise RuntimeError("matchering output factory unavailable.")

    _ = source_path
    mg.process(
        target=str(target_in),
        reference=str(reference_path),
        results=[result_factory(str(target_out))],
    )
    if not target_out.exists():
        raise RuntimeError("matchering backend did not produce output.")
    data, out_sr = sf.read(str(target_out), dtype="float32", always_2d=True)
    aligned = _resample_audio_to_sr(data.astype(np.float64), src_sr=int(out_sr), dst_sr=sr)
    aligned = _match_target_channels(aligned, target_channels=current_audio.shape[1])
    return _finalize_master(aligned, sr=sr, cfg=cfg)


def _module_available(module_name: str) -> bool:
    try:
        __import__(module_name)
        return True
    except Exception:
        return False


def _pro_feature_status() -> dict[str, bool]:
    return {
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "pedalboard": _module_available("pedalboard"),
        "matchering": _module_available("matchering"),
        "pyebur128": _module_available("pyebur128"),
    }


def _refine_mastered_audio(
    source_audio: np.ndarray,
    mastered_audio: np.ndarray,
    sr: int,
    cfg: MasterPreset,
    max_passes: int,
    allow_stem_fallback: bool,
    progress: MasteringProgressCallback | None,
    start_progress: float,
    end_progress: float,
) -> tuple[np.ndarray, dict[str, Any]]:
    best_audio = np.asarray(mastered_audio, dtype=np.float64)
    source_profile = _quality_profile(source_audio, sr=sr, cfg=cfg)
    best_profile = _quality_profile(best_audio, sr=sr, cfg=cfg)
    history: list[dict[str, Any]] = []
    accepted_passes = 0
    fallback_attempted = False
    fallback_applied = False
    rollback_count = 0
    non_regression_applied = False
    non_regression_reason: str | None = None

    span = max(0.001, end_progress - start_progress)
    for pass_idx in range(1, max_passes + 1):
        if int(best_profile.get("issue_score", 0)) <= 0:
            break
        intensity = 1.0 + 0.35 * max(0, pass_idx - 1)
        candidate = _apply_marker_aware_local_fixes(
            audio=best_audio,
            sr=sr,
            profile=best_profile,
            cfg=cfg,
            intensity=intensity,
        )
        candidate = _finalize_master(candidate, sr=sr, cfg=cfg)
        candidate_profile = _quality_profile(candidate, sr=sr, cfg=cfg)
        improved = _is_profile_better(before=best_profile, after=candidate_profile, cfg=cfg)
        history.append(
            {
                "pass": pass_idx,
                "intensity": round(float(intensity), 3),
                "before_score": int(best_profile.get("issue_score", 0)),
                "after_score": int(candidate_profile.get("issue_score", 0)),
                "before_marker_counts": best_profile.get("marker_counts", {}),
                "after_marker_counts": candidate_profile.get("marker_counts", {}),
                "accepted": bool(improved),
            }
        )
        if progress:
            pct = start_progress + span * (pass_idx / max(max_passes, 1))
            progress(float(min(end_progress, max(start_progress, pct))), f"refine_pass_{pass_idx}")
        if improved:
            best_audio = candidate
            best_profile = candidate_profile
            accepted_passes += 1
        else:
            rollback_count += 1
            if progress:
                progress(float(min(end_progress, max(start_progress, pct))), "rollback")
            continue

    if allow_stem_fallback and int(best_profile.get("issue_score", 0)) > 0:
        fallback_attempted = True
        if progress:
            progress(
                float(min(end_progress, max(start_progress, end_progress - 0.5))),
                "stem_fallback",
            )
        stem_candidate = _apply_stem_rescue_fallback(
            audio=best_audio,
            sr=sr,
            profile=best_profile,
            cfg=cfg,
        )
        stem_profile = _quality_profile(stem_candidate, sr=sr, cfg=cfg)
        if _is_profile_better(before=best_profile, after=stem_profile, cfg=cfg):
            best_audio = stem_candidate
            best_profile = stem_profile
            fallback_applied = True
        else:
            rollback_count += 1
            if progress:
                progress(
                    float(min(end_progress, max(start_progress, end_progress - 0.25))),
                    "rollback",
                )

    if not _is_profile_non_regressing(source_profile, best_profile):
        conservative_cfg = replace(
            cfg,
            comp_ratio=max(1.25, cfg.comp_ratio - 0.55),
            limiter_drive=max(1.0, cfg.limiter_drive - 0.15),
            deess_strength=min(1.2, cfg.deess_strength * 1.1),
        )
        source_candidate = _apply_master_chain(
            np.asarray(source_audio, dtype=np.float64),
            sr=sr,
            cfg=conservative_cfg,
            normalize_to_targets=True,
        )
        source_candidate_profile = _quality_profile(source_candidate, sr=sr, cfg=cfg)

        repaired = _apply_marker_aware_local_fixes(
            audio=source_candidate,
            sr=sr,
            profile=source_candidate_profile,
            cfg=conservative_cfg,
            intensity=1.35,
        )
        repaired = _finalize_master(repaired, sr=sr, cfg=cfg)
        repaired_profile = _quality_profile(repaired, sr=sr, cfg=cfg)

        candidates = [
            ("current", best_audio, best_profile),
            ("conservative_source", source_candidate, source_candidate_profile),
            ("source_marker_repair", repaired, repaired_profile),
        ]
        viable = [
            candidate
            for candidate in candidates
            if _is_profile_non_regressing(source_profile, candidate[2])
        ]
        if viable:
            viable.sort(key=lambda item: _profile_objective_distance(item[2], cfg))
            best_label, best_audio_candidate, best_profile_candidate = viable[0]
            if best_label != "current":
                best_audio = np.asarray(best_audio_candidate, dtype=np.float64)
                best_profile = best_profile_candidate
                non_regression_applied = True
                non_regression_reason = best_label

    return best_audio, {
        "max_passes": max_passes,
        "accepted_passes": accepted_passes,
        "history": history,
        "fallback_attempted": fallback_attempted,
        "fallback_applied": fallback_applied,
        "rollback_count": rollback_count,
        "source_issue_score": int(source_profile.get("issue_score", 0)),
        "final_issue_score": int(best_profile.get("issue_score", 0)),
        "loop_guard_triggered": rollback_count > 0 and accepted_passes == 0,
        "non_regression_applied": non_regression_applied,
        "non_regression_reason": non_regression_reason,
    }


def _apply_marker_aware_local_fixes(
    audio: np.ndarray,
    sr: int,
    profile: dict[str, Any],
    cfg: MasterPreset,
    intensity: float = 1.0,
) -> np.ndarray:
    y = np.asarray(audio, dtype=np.float64)
    marker_events = profile.get("marker_events", {})
    if not isinstance(marker_events, dict):
        return y
    repair_intensity = float(np.clip(intensity, 0.75, 2.5))

    harsh_events = _event_list(marker_events, "harshness_band")
    if harsh_events:
        harsh_gain_db = -float(
            np.clip((2.0 + 0.25 * len(harsh_events)) * repair_intensity, 1.5, 6.0)
        )
        y = _apply_band_segment_gain(
            audio=y,
            sr=sr,
            markers=harsh_events,
            low_hz=3000.0,
            high_hz=9000.0,
            gain_db=harsh_gain_db,
            fade_seconds=0.03,
        )

    sub_events = _event_list(marker_events, "sub_bass_heavy")
    if sub_events:
        sub_gain_db = -float(
            np.clip((2.1 + 0.2 * len(sub_events)) * repair_intensity, 1.5, 5.5)
        )
        y = _apply_band_segment_gain(
            audio=y,
            sr=sr,
            markers=sub_events,
            low_hz=20.0,
            high_hz=120.0,
            gain_db=sub_gain_db,
            fade_seconds=0.04,
        )
        y = _apply_sub_bass_dynamic_control(
            audio=y,
            sr=sr,
            markers=sub_events,
            max_reduction_db=float(np.clip(2.6 * repair_intensity, 1.5, 6.5)),
            low_hz=120.0,
        )

    mono_events = _event_list(marker_events, "mono_incompatibility")
    if mono_events:
        y = _apply_mono_compat_fix(
            audio=y,
            sr=sr,
            markers=mono_events,
            side_gain_db=-float(np.clip(3.5 + 0.9 * repair_intensity, 3.0, 7.0)),
            low_mono_blend=float(np.clip(0.6 + 0.12 * repair_intensity, 0.5, 0.88)),
            low_mono_hz=130.0,
            fade_seconds=0.05,
        )

    dip_events = _event_list(marker_events, "loudness_dip")
    if dip_events:
        dip_gain_db = float(
            np.clip((1.2 + 0.12 * len(dip_events)) * repair_intensity, 0.9, 4.2)
        )
        y = _apply_time_segment_gain(
            audio=y,
            sr=sr,
            markers=dip_events,
            gain_db=dip_gain_db,
            fade_seconds=0.06,
        )
        y = _apply_loudness_dip_repair(
            audio=y,
            sr=sr,
            markers=dip_events,
            max_boost_db=float(np.clip(2.4 * repair_intensity, 1.2, 4.8)),
        )

    clipping_events = _event_list(marker_events, "clipping")
    if clipping_events:
        y = _apply_time_segment_gain(
            audio=y,
            sr=sr,
            markers=clipping_events,
            gain_db=-1.4,
            fade_seconds=0.01,
        )

    if int(profile.get("marker_counts", {}).get("true_peak_risk", 0)) > 0:
        y = _safe_limiter(y, drive=max(1.0, cfg.limiter_drive - 0.12), sr=sr)

    return np.clip(y, -1.25, 1.25)


def _apply_stem_rescue_fallback(
    audio: np.ndarray,
    sr: int,
    profile: dict[str, Any],
    cfg: MasterPreset,
) -> np.ndarray:
    stems = _spectral_stems(audio, sr)
    marker_counts = profile.get("marker_counts", {})
    marker_events = profile.get("marker_events", {})

    if int(marker_counts.get("sub_bass_heavy", 0)) > 0:
        stems["bass"] *= _db_to_linear(-2.0)
    if int(marker_counts.get("harshness_band", 0)) > 0:
        stems["vocals"] = _deesser(
            stems["vocals"],
            sr=sr,
            strength=min(1.2, cfg.deess_strength * 1.7),
        )
    if int(marker_counts.get("mono_incompatibility", 0)) > 0:
        stems["other"] = _apply_mono_compat_fix(
            audio=stems["other"],
            sr=sr,
            markers=_event_list(marker_events, "mono_incompatibility"),
            side_gain_db=-4.5,
            low_mono_blend=0.7,
            low_mono_hz=140.0,
            fade_seconds=0.04,
        )
    if int(marker_counts.get("loudness_dip", 0)) > 0:
        stems["other"] = _apply_time_segment_gain(
            audio=stems["other"],
            sr=sr,
            markers=_event_list(marker_events, "loudness_dip"),
            gain_db=1.0,
            fade_seconds=0.05,
        )

    recombined = stems["bass"] + stems["vocals"] + stems["drums"] + stems["other"]
    return _finalize_master(recombined, sr=sr, cfg=cfg)


def _is_profile_better(before: dict[str, Any], after: dict[str, Any], cfg: MasterPreset) -> bool:
    before_score = int(before.get("issue_score", 0))
    after_score = int(after.get("issue_score", 0))
    if after_score < before_score:
        return True
    if after_score > before_score:
        return False

    before_markers = _profile_marker_load(before)
    after_markers = _profile_marker_load(after)
    if after_markers < before_markers:
        return True
    if after_markers > before_markers:
        return False

    before_distance = _profile_objective_distance(before, cfg)
    after_distance = _profile_objective_distance(after, cfg)
    return after_distance + 0.2 < before_distance


def _is_profile_non_regressing(source: dict[str, Any], candidate: dict[str, Any]) -> bool:
    source_score = int(source.get("issue_score", 0))
    candidate_score = int(candidate.get("issue_score", 0))
    if candidate_score < source_score:
        return True
    if candidate_score > source_score:
        return False

    source_load = _profile_marker_load(source)
    candidate_load = _profile_marker_load(candidate)
    if candidate_load > source_load + 0.25:
        return False

    source_counts = source.get("marker_counts", {})
    candidate_counts = candidate.get("marker_counts", {})
    if not isinstance(source_counts, dict) or not isinstance(candidate_counts, dict):
        return candidate_load <= source_load + 0.25
    guarded = (
        "clipping",
        "true_peak_risk",
        "mono_incompatibility",
        "sub_bass_heavy",
        "loudness_dip",
    )
    for key in guarded:
        before = int(source_counts.get(key, 0))
        after = int(candidate_counts.get(key, 0))
        if after > before:
            return False
    return True


def _profile_objective_distance(profile: dict[str, Any], cfg: MasterPreset) -> float:
    lufs = float(profile.get("integrated_lufs", float("-inf")))
    tp = float(profile.get("true_peak_dbfs", 0.0))
    marker_load = _profile_marker_load(profile)
    lufs_penalty = 50.0 if not np.isfinite(lufs) else abs(lufs - cfg.target_lufs) * 2.5
    tp_penalty = max(0.0, tp - cfg.target_true_peak_dbfs) * 6.0
    return float(lufs_penalty + tp_penalty + marker_load * 2.0)


def _profile_marker_load(profile: dict[str, Any]) -> float:
    counts = profile.get("marker_counts", {})
    if not isinstance(counts, dict):
        return 0.0
    weights = {
        "mono_incompatibility": 3.0,
        "harshness_band": 2.0,
        "sub_bass_heavy": 2.0,
        "loudness_dip": 2.0,
        "clipping": 3.0,
        "true_peak_risk": 3.0,
        "loudness_hot": 3.0,
        "loudness_quiet": 2.0,
        "crest_factor_dense": 2.0,
    }
    total = 0.0
    for key, weight in weights.items():
        raw = counts.get(key, 0)
        count = int(raw) if isinstance(raw, (int, float)) else 0
        total += weight * min(count, 3)
    return total


def _event_list(marker_events: dict[str, Any], key: str) -> list[dict[str, Any]]:
    payload = marker_events.get(key)
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    return []


def _apply_band_segment_gain(
    audio: np.ndarray,
    sr: int,
    markers: list[dict[str, Any]],
    low_hz: float,
    high_hz: float,
    gain_db: float,
    fade_seconds: float,
) -> np.ndarray:
    if not markers:
        return audio
    band = _bandpass(audio, sr=sr, low_hz=low_hz, high_hz=high_hz)
    mask = _segment_mask(
        length=audio.shape[0],
        sr=sr,
        markers=markers,
        fade_seconds=fade_seconds,
    )
    gain = 1.0 + mask * (_db_to_linear(gain_db) - 1.0)
    return np.clip(audio - band + band * gain[:, np.newaxis], -1.5, 1.5)


def _apply_time_segment_gain(
    audio: np.ndarray,
    sr: int,
    markers: list[dict[str, Any]],
    gain_db: float,
    fade_seconds: float,
) -> np.ndarray:
    if not markers:
        return audio
    mask = _segment_mask(
        length=audio.shape[0],
        sr=sr,
        markers=markers,
        fade_seconds=fade_seconds,
    )
    gain = 1.0 + mask * (_db_to_linear(gain_db) - 1.0)
    return np.clip(audio * gain[:, np.newaxis], -1.5, 1.5)


def _apply_loudness_dip_repair(
    audio: np.ndarray,
    sr: int,
    markers: list[dict[str, Any]],
    max_boost_db: float,
) -> np.ndarray:
    if not markers:
        return audio
    signal = np.asarray(audio, dtype=np.float64)
    mask = _segment_mask(
        length=signal.shape[0],
        sr=sr,
        markers=markers,
        fade_seconds=0.08,
    )
    if mask.size == 0 or float(np.max(mask)) <= 0.0:
        return signal
    env = np.sqrt(np.mean(signal**2, axis=1) + EPS)
    env = _moving_average(env, max(8, int(sr * 0.06)))
    target_env = float(np.percentile(env, 68))
    max_gain = _db_to_linear(float(np.clip(max_boost_db, 0.8, 6.0)))
    desired = np.clip(target_env / (env + EPS), 1.0, max_gain)
    gain = 1.0 + mask * (desired - 1.0)
    gain = _smooth_gain(gain, sr=sr, attack_s=0.02, release_s=0.22)
    return np.clip(signal * gain[:, np.newaxis], -1.5, 1.5)


def _apply_sub_bass_dynamic_control(
    audio: np.ndarray,
    sr: int,
    markers: list[dict[str, Any]],
    max_reduction_db: float,
    low_hz: float,
) -> np.ndarray:
    if not markers:
        return audio
    signal = np.asarray(audio, dtype=np.float64)
    low_band = _lowpass(signal, sr=sr, cutoff_hz=low_hz, order=3)
    mask = _segment_mask(
        length=signal.shape[0],
        sr=sr,
        markers=markers,
        fade_seconds=0.06,
    )
    if mask.size == 0 or float(np.max(mask)) <= 0.0:
        return signal
    env = np.mean(np.abs(low_band), axis=1)
    env = _moving_average(env, max(8, int(sr * 0.05)))
    hotspot = env[mask > 0.2]
    threshold = float(np.percentile(hotspot, 62)) if hotspot.size > 0 else float(np.percentile(env, 62))
    threshold = max(threshold, EPS)
    over = np.maximum(env / threshold - 1.0, 0.0)
    raw_reduction = 1.0 / (1.0 + 2.2 * over)
    min_gain = _db_to_linear(-float(np.clip(max_reduction_db, 1.0, 8.0)))
    reduced = np.clip(raw_reduction, min_gain, 1.0)
    gain = 1.0 + mask * (reduced - 1.0)
    gain = _smooth_gain(gain, sr=sr, attack_s=0.015, release_s=0.18)
    return np.clip(signal - low_band + low_band * gain[:, np.newaxis], -1.5, 1.5)


def _apply_mono_compat_fix(
    audio: np.ndarray,
    sr: int,
    markers: list[dict[str, Any]],
    side_gain_db: float,
    low_mono_blend: float,
    low_mono_hz: float,
    fade_seconds: float,
) -> np.ndarray:
    if audio.ndim != 2 or audio.shape[1] < 2 or not markers:
        return audio
    mask = _segment_mask(
        length=audio.shape[0],
        sr=sr,
        markers=markers,
        fade_seconds=fade_seconds,
    )
    side_gain = 1.0 + mask * (_db_to_linear(side_gain_db) - 1.0)

    left = audio[:, 0]
    right = audio[:, 1]
    mid = 0.5 * (left + right)
    side = 0.5 * (left - right) * side_gain
    out_left = mid + side
    out_right = mid - side
    out = np.stack([out_left, out_right], axis=1)

    blend = np.clip(mask * float(np.clip(low_mono_blend, 0.0, 1.0)), 0.0, 1.0)
    low_left = _lowpass(out[:, [0]], sr=sr, cutoff_hz=low_mono_hz)[:, 0]
    low_right = _lowpass(out[:, [1]], sr=sr, cutoff_hz=low_mono_hz)[:, 0]
    low_mono = 0.5 * (low_left + low_right)
    out[:, 0] = out[:, 0] - low_left + (low_left * (1.0 - blend) + low_mono * blend)
    out[:, 1] = out[:, 1] - low_right + (low_right * (1.0 - blend) + low_mono * blend)
    return np.clip(out, -1.5, 1.5)


def _segment_mask(
    length: int,
    sr: int,
    markers: list[dict[str, Any]],
    fade_seconds: float,
) -> np.ndarray:
    if length <= 0:
        return np.zeros(0, dtype=np.float64)
    mask = np.zeros(length, dtype=np.float64)
    fade = max(1, int(max(0.0, fade_seconds) * sr))
    for marker in markers:
        start_s = float(marker.get("start_seconds", 0.0))
        end_s = float(marker.get("end_seconds", start_s))
        if end_s <= start_s:
            continue
        start = max(0, min(length, int(start_s * sr)))
        end = max(0, min(length, int(end_s * sr)))
        if end <= start:
            continue
        span_start = max(0, start - fade)
        span_end = min(length, end + fade)
        span_len = span_end - span_start
        if span_len <= 0:
            continue
        curve = np.ones(span_len, dtype=np.float64)
        rise_len = max(0, start - span_start)
        fall_len = max(0, span_end - end)
        if rise_len > 0:
            curve[:rise_len] = np.linspace(0.0, 1.0, rise_len, endpoint=False)
        if fall_len > 0:
            curve[-fall_len:] = np.linspace(1.0, 0.0, fall_len, endpoint=True)
        mask[span_start:span_end] = np.maximum(mask[span_start:span_end], curve)
    return np.clip(mask, 0.0, 1.0)


def _measure_loudness_and_true_peak(audio: np.ndarray, sr: int) -> tuple[float, float]:
    signal = np.asarray(audio, dtype=np.float64)
    lufs = loudness_integrated_lufs(signal.astype(np.float32), sr=sr)
    tp_db = float(dbfs(oversampled_true_peak(signal.astype(np.float32), sr=sr)))
    return float(lufs), tp_db


def _normalization_objective(
    lufs: float,
    true_peak_db: float,
    target_lufs: float,
    target_true_peak_dbfs: float,
) -> float:
    loudness_error = 40.0 if not np.isfinite(lufs) else abs(lufs - target_lufs)
    peak_penalty = max(0.0, true_peak_db - target_true_peak_dbfs) * 6.0
    return float(loudness_error + peak_penalty)


def _render_normalized_candidate(
    audio: np.ndarray,
    sr: int,
    cfg: MasterPreset,
    gain_db: float,
) -> tuple[np.ndarray, float, float]:
    candidate = np.asarray(audio, dtype=np.float64) * _db_to_linear(gain_db)
    candidate = _safe_limiter(candidate, drive=cfg.limiter_drive, sr=sr)
    lufs, tp_db = _measure_loudness_and_true_peak(candidate, sr=sr)
    if np.isfinite(tp_db) and tp_db > cfg.target_true_peak_dbfs:
        candidate = candidate * _db_to_linear(cfg.target_true_peak_dbfs - tp_db)
        lufs, tp_db = _measure_loudness_and_true_peak(candidate, sr=sr)
    candidate = np.clip(candidate, -0.999, 0.999)
    return candidate, lufs, tp_db


def _normalize_to_targets(
    audio: np.ndarray,
    sr: int,
    cfg: MasterPreset,
) -> np.ndarray:
    working = np.asarray(audio, dtype=np.float64)
    input_lufs, _ = _measure_loudness_and_true_peak(working, sr=sr)
    initial_gain_db = 0.0 if not np.isfinite(input_lufs) else float(cfg.target_lufs - input_lufs)

    best, best_lufs, best_tp = _render_normalized_candidate(
        working,
        sr=sr,
        cfg=cfg,
        gain_db=initial_gain_db,
    )
    best_score = _normalization_objective(
        best_lufs,
        best_tp,
        target_lufs=cfg.target_lufs,
        target_true_peak_dbfs=cfg.target_true_peak_dbfs,
    )

    low_gain_db = initial_gain_db - 12.0
    high_gain_db = initial_gain_db + 12.0
    for _ in range(12):
        mid_gain_db = 0.5 * (low_gain_db + high_gain_db)
        candidate, lufs, tp_db = _render_normalized_candidate(
            working,
            sr=sr,
            cfg=cfg,
            gain_db=mid_gain_db,
        )
        score = _normalization_objective(
            lufs,
            tp_db,
            target_lufs=cfg.target_lufs,
            target_true_peak_dbfs=cfg.target_true_peak_dbfs,
        )
        if score <= best_score + 1e-6:
            best = candidate
            best_score = score
            best_lufs = lufs
            best_tp = tp_db

        if np.isfinite(lufs) and abs(lufs - cfg.target_lufs) <= 0.2:
            break

        if not np.isfinite(lufs):
            high_gain_db = mid_gain_db
            continue
        if lufs > cfg.target_lufs:
            high_gain_db = mid_gain_db
        else:
            low_gain_db = mid_gain_db

    for gain_db in np.linspace(low_gain_db, high_gain_db, num=7):
        candidate, lufs, tp_db = _render_normalized_candidate(
            working,
            sr=sr,
            cfg=cfg,
            gain_db=float(gain_db),
        )
        score = _normalization_objective(
            lufs,
            tp_db,
            target_lufs=cfg.target_lufs,
            target_true_peak_dbfs=cfg.target_true_peak_dbfs,
        )
        if score <= best_score + 1e-6:
            best = candidate
            best_score = score

    return np.clip(best, -0.999, 0.999)


def _finalize_master(audio: np.ndarray, sr: int, cfg: MasterPreset) -> np.ndarray:
    y = np.asarray(audio, dtype=np.float64)
    return _normalize_to_targets(y, sr=sr, cfg=cfg)


def _highpass(audio: np.ndarray, sr: int, cutoff_hz: float) -> np.ndarray:
    sos = butter(2, cutoff_hz / (0.5 * sr), btype="highpass", output="sos")
    return sosfiltfilt(sos, audio, axis=0)


def _lowpass(audio: np.ndarray, sr: int, cutoff_hz: float, order: int = 2) -> np.ndarray:
    sos = butter(order, cutoff_hz / (0.5 * sr), btype="lowpass", output="sos")
    return sosfiltfilt(sos, audio, axis=0)


def _bandpass(
    audio: np.ndarray, sr: int, low_hz: float, high_hz: float, order: int = 2
) -> np.ndarray:
    low = max(5.0, low_hz) / (0.5 * sr)
    high = min(high_hz, 0.49 * sr) / (0.5 * sr)
    if high <= low + 1e-6:
        return np.zeros_like(audio)
    sos = butter(order, [low, high], btype="bandpass", output="sos")
    return sosfiltfilt(sos, audio, axis=0)


def _spectral_tilt(audio: np.ndarray, sr: int, cfg: MasterPreset) -> np.ndarray:
    mono = np.mean(audio, axis=1).astype(np.float32)
    balance = spectral_balance(mono, sr=sr)
    low = float(balance.get("sub_20_60", 0.0) + balance.get("bass_60_250", 0.0))
    high = float(
        balance.get("presence_4k_6k", 0.0)
        + balance.get("sibilance_6k_10k", 0.0)
        + balance.get("air_10k_20k", 0.0)
    )

    low_gain_db = float(np.clip((cfg.low_target_ratio - low) * 10.0, -1.5, 1.5))
    high_gain_db = float(np.clip((cfg.high_target_ratio - high) * 10.0, -1.5, 1.5))

    low_band = _lowpass(audio, sr=sr, cutoff_hz=220.0)
    high_band = _highpass(audio, sr=sr, cutoff_hz=4200.0)
    y = (
        audio
        + low_band * (_db_to_linear(low_gain_db) - 1.0)
        + high_band * (_db_to_linear(high_gain_db) - 1.0)
    )
    return np.clip(y, -1.5, 1.5)


def _deesser(audio: np.ndarray, sr: int, strength: float) -> np.ndarray:
    if strength <= 0.0:
        return audio
    band = _bandpass(audio, sr=sr, low_hz=5600.0, high_hz=9800.0)
    env = np.mean(np.abs(band), axis=1)
    env = _moving_average(env, max(8, int(sr * 0.004)))
    threshold = float(np.percentile(env, 90)) + EPS
    ratio = np.maximum(env / threshold, 1.0)
    attenuation = 1.0 / (1.0 + float(np.clip(strength, 0.0, 1.2)) * 0.7 * (ratio - 1.0))
    attenuation = np.clip(attenuation, _db_to_linear(-4.0), 1.0)
    y = audio - band + band * attenuation[:, np.newaxis]
    return np.clip(y, -1.5, 1.5)


def _broadband_compression(
    audio: np.ndarray, sr: int, threshold_db: float, ratio: float
) -> np.ndarray:
    ratio = max(1.05, ratio)
    env = np.sqrt(np.mean(audio**2, axis=1) + EPS)
    env = _moving_average(env, max(16, int(sr * 0.03)))
    threshold = _db_to_linear(threshold_db)

    target = np.where(env > threshold, threshold + (env - threshold) / ratio, env)
    gain = target / (env + EPS)
    max_reduction_db = min(3.0, max(0.8, (ratio - 1.0) * 2.0))
    gain = np.clip(gain, _db_to_linear(-max_reduction_db), 1.0)
    smoothed = _smooth_gain(gain, sr=sr, attack_s=0.02, release_s=0.18)
    return np.clip(audio * smoothed[:, np.newaxis], -1.5, 1.5)


def _safe_limiter(audio: np.ndarray, drive: float = 1.1, sr: int = 48_000) -> np.ndarray:
    signal = np.asarray(audio, dtype=np.float64)
    if signal.ndim == 1:
        signal = signal[:, np.newaxis]

    aggression = max(0.0, float(drive) - 1.0)
    limited = signal.copy()
    envelope = np.max(np.abs(limited), axis=1)
    ceiling = 0.985
    knee = ceiling * max(0.72, 0.92 - 0.16 * aggression)

    target_gain = np.ones_like(envelope, dtype=np.float64)
    over_knee = envelope > knee
    if np.any(over_knee):
        softened_env = np.where(
            over_knee,
            knee + (envelope - knee) * max(0.18, 0.42 - 0.18 * aggression),
            envelope,
        )
        target_gain = np.minimum(1.0, ceiling / np.maximum(softened_env, EPS))

    smoothed_gain = _smooth_gain(target_gain, sr=sr, attack_s=0.0015, release_s=0.08)
    output = limited * smoothed_gain[:, np.newaxis]

    peak = float(np.max(np.abs(output))) if output.size > 0 else 0.0
    if peak > ceiling:
        output *= ceiling / max(peak, EPS)
    return np.clip(output, -0.999, 0.999)


def _moving_average(x: np.ndarray, window: int) -> np.ndarray:
    window = max(1, int(window))
    kernel = np.ones(window, dtype=np.float64) / float(window)
    return np.convolve(x.astype(np.float64), kernel, mode="same")


def _smooth_gain(gain: np.ndarray, sr: int, attack_s: float, release_s: float) -> np.ndarray:
    attack = np.exp(-1.0 / max(sr * attack_s, 1.0))
    release = np.exp(-1.0 / max(sr * release_s, 1.0))
    out = np.empty_like(gain, dtype=np.float64)
    prev = 1.0
    for i, g in enumerate(gain):
        coeff = attack if g < prev else release
        prev = coeff * prev + (1.0 - coeff) * g
        out[i] = prev
    return out


def _optimizer_candidates(base: MasterPreset, variant_count: int) -> list[MasterPreset]:
    rng = np.random.default_rng(42)
    configs: list[MasterPreset] = []
    for _ in range(variant_count):
        cfg = replace(
            base,
            comp_ratio=float(np.clip(base.comp_ratio + rng.normal(0.0, 0.35), 1.3, 3.8)),
            comp_threshold_db=float(
                np.clip(base.comp_threshold_db + rng.normal(0.0, 2.1), -28.0, -12.0)
            ),
            deess_strength=float(np.clip(base.deess_strength + rng.normal(0.0, 0.14), 0.1, 1.0)),
            low_target_ratio=float(
                np.clip(base.low_target_ratio + rng.normal(0.0, 0.02), 0.16, 0.34)
            ),
            high_target_ratio=float(
                np.clip(base.high_target_ratio + rng.normal(0.0, 0.02), 0.14, 0.30)
            ),
            limiter_drive=float(np.clip(base.limiter_drive + rng.normal(0.0, 0.08), 1.0, 1.5)),
        )
        configs.append(cfg)
    return configs


def _optimizer_score(metrics: dict[str, Any], cfg: MasterPreset) -> float:
    lufs = float(metrics.get("integrated_lufs", float("-inf")))
    tp = float(metrics.get("true_peak_dbfs", 0.0))
    crest = float(metrics.get("crest_factor_db", 0.0))
    clipping_count = int(metrics.get("clipping_segments", 0))
    spectral = metrics.get("spectral_balance", {})
    low = 0.0
    high = 0.0
    if isinstance(spectral, dict):
        low = float(spectral.get("sub_20_60", 0.0) + spectral.get("bass_60_250", 0.0))
        high = float(
            spectral.get("presence_4k_6k", 0.0)
            + spectral.get("sibilance_6k_10k", 0.0)
            + spectral.get("air_10k_20k", 0.0)
        )

    lufs_penalty = (
        80.0 if not np.isfinite(lufs) else abs(lufs - cfg.target_lufs) * 3.5
    )
    tp_penalty = (
        max(0.0, tp - cfg.target_true_peak_dbfs) * 8.0
        + abs(min(0.0, cfg.target_true_peak_dbfs - tp)) * 0.2
    )
    crest_penalty = abs(crest - cfg.desired_crest_db) * 0.8
    tone_penalty = abs(low - cfg.low_target_ratio) * 22.0 + abs(high - cfg.high_target_ratio) * 22.0
    clipping_penalty = 20.0 * clipping_count
    return float(lufs_penalty + tp_penalty + crest_penalty + tone_penalty + clipping_penalty)


def _spectral_stems(audio: np.ndarray, sr: int) -> dict[str, np.ndarray]:
    bass = _lowpass(audio, sr=sr, cutoff_hz=180.0, order=3)
    vocals = _bandpass(audio, sr=sr, low_hz=180.0, high_hz=4200.0, order=2)
    drum_band = _bandpass(audio, sr=sr, low_hz=2500.0, high_hz=12000.0, order=2)
    drum_env = _lowpass(drum_band, sr=sr, cutoff_hz=900.0, order=2)
    drums = np.clip(drum_band - drum_env, -1.0, 1.0)
    other = np.clip(audio - (bass + vocals + drums), -1.0, 1.0)
    return {"bass": bass, "vocals": vocals, "drums": drums, "other": other}


def _master_metrics(audio: np.ndarray, sr: int) -> dict[str, Any]:
    mono = np.mean(audio, axis=1).astype(np.float32)
    integrated_lufs = loudness_integrated_lufs(audio.astype(np.float32), sr=sr)
    true_peak = float(dbfs(oversampled_true_peak(audio.astype(np.float32), sr=sr)))
    crest = float(crest_factor_db(mono))
    clipping = clipping_segments(audio.astype(np.float32), sr=sr)
    balance = spectral_balance(mono, sr=sr)
    payload: dict[str, Any] = {
        "integrated_lufs": integrated_lufs,
        "true_peak_dbfs": true_peak,
        "crest_factor_db": crest,
        "clipping_segments": len(clipping),
        "spectral_balance": balance,
        "sample_rate": int(sr),
        "channels": int(audio.shape[1]) if audio.ndim > 1 else 1,
        "duration_seconds": float(audio.shape[0] / max(sr, 1)),
    }
    ebur = _try_ebur128_metrics(audio=audio, sr=sr)
    if ebur:
        payload["ebu_r128"] = ebur
    return payload


def _try_ebur128_metrics(audio: np.ndarray, sr: int) -> dict[str, Any] | None:
    try:
        import pyebur128 as ebur  # type: ignore
    except Exception:
        return None

    signal = np.asarray(audio, dtype=np.float32)
    if signal.ndim == 1:
        signal = signal[:, np.newaxis]

    try:
        meter = ebur.Meter(int(sr), int(signal.shape[1]))
        meter.add_frames(signal)
        integrated = meter.loudness_global()
        result: dict[str, Any] = {"integrated_lufs": float(integrated)}
        lra_fn = getattr(meter, "loudness_range", None)
        if callable(lra_fn):
            result["lra_lu"] = float(lra_fn())
        true_peak_fn = getattr(meter, "true_peak", None)
        if callable(true_peak_fn):
            tp = true_peak_fn()
            if isinstance(tp, (list, tuple)):
                tp_val = max(float(x) for x in tp) if tp else None
            else:
                tp_val = float(tp)
            if tp_val is not None:
                result["true_peak_dbfs"] = float(dbfs(tp_val))
        return result
    except Exception:
        return None


def _output_record(
    output_id: str, path: Path, metrics: dict[str, Any], score: float | None = None
) -> dict[str, Any]:
    size_bytes = path.stat().st_size if path.exists() else 0
    sr = int(metrics.get("sample_rate", 0)) if isinstance(metrics, dict) else 0
    channels = int(metrics.get("channels", 0)) if isinstance(metrics, dict) else 0
    duration_seconds = (
        float(metrics.get("duration_seconds", 0.0)) if isinstance(metrics, dict) else 0.0
    )
    payload: dict[str, Any] = {
        "id": output_id,
        "filename": path.name,
        "path": str(path),
        "size_bytes": size_bytes,
        "size_megabytes": round(size_bytes / (1024 * 1024), 3),
        "sha256": _file_sha256(path),
        "sample_rate": sr,
        "channels": channels,
        "duration_seconds": duration_seconds,
        "metrics": metrics,
    }
    if score is not None:
        payload["score"] = float(score)
    return payload


def _config_to_dict(cfg: MasterPreset) -> dict[str, Any]:
    return {
        "name": cfg.name,
        "target_lufs": cfg.target_lufs,
        "target_true_peak_dbfs": cfg.target_true_peak_dbfs,
        "comp_ratio": cfg.comp_ratio,
        "comp_threshold_db": cfg.comp_threshold_db,
        "deess_strength": cfg.deess_strength,
        "low_target_ratio": cfg.low_target_ratio,
        "high_target_ratio": cfg.high_target_ratio,
        "limiter_drive": cfg.limiter_drive,
        "desired_crest_db": cfg.desired_crest_db,
    }


def _post_check_score(profile: dict[str, Any], cfg: MasterPreset) -> float:
    compliance = _mastering_compliance(profile, cfg=cfg)
    failed = compliance.get("failed", [])
    failed_count = len(failed) if isinstance(failed, list) else 0
    clipping_count = int(profile.get("marker_counts", {}).get("clipping", 0)) if isinstance(profile.get("marker_counts", {}), dict) else 0
    return _profile_objective_distance(profile, cfg) + failed_count * 6.0 + clipping_count * 10.0


def _mastering_compliance(profile: dict[str, Any], cfg: MasterPreset) -> dict[str, Any]:
    marker_counts = profile.get("marker_counts", {})
    counts = marker_counts if isinstance(marker_counts, dict) else {}
    lufs = float(profile.get("integrated_lufs", float("-inf")))
    tp = float(profile.get("true_peak_dbfs", 0.0))
    crest = float(profile.get("crest_factor_db", 0.0))
    loudness_delta = None if not np.isfinite(lufs) else float(lufs - cfg.target_lufs)
    true_peak_delta = None if not np.isfinite(tp) else float(tp - cfg.target_true_peak_dbfs)
    crest_delta = None if not np.isfinite(crest) else float(crest - cfg.desired_crest_db)
    loudness_ok = loudness_delta is not None and abs(loudness_delta) <= 0.75
    true_peak_ok = true_peak_delta is not None and true_peak_delta <= 0.10
    crest_floor = max(6.8, cfg.desired_crest_db - 1.4)
    crest_ok = np.isfinite(crest) and crest >= crest_floor
    clipping_ok = int(counts.get("clipping", 0)) <= 0

    failed: list[str] = []
    if not loudness_ok:
        if loudness_delta is None:
            failed.append("loudness_unreadable")
        elif loudness_delta > 0:
            failed.append("loudness_hot")
        else:
            failed.append("loudness_quiet")
    if not true_peak_ok:
        failed.append("true_peak_risk")
    if not crest_ok:
        failed.append("crest_factor_dense")
    if not clipping_ok:
        failed.append("clipping")

    return {
        "passed": len(failed) == 0,
        "failed": failed,
        "integrated_lufs": lufs,
        "target_lufs": cfg.target_lufs,
        "loudness_delta_lu": loudness_delta,
        "true_peak_dbfs": tp,
        "target_true_peak_dbfs": cfg.target_true_peak_dbfs,
        "true_peak_delta_db": true_peak_delta,
        "crest_factor_db": crest,
        "desired_crest_db": cfg.desired_crest_db,
        "crest_delta_db": crest_delta,
    }


def _build_post_check_repair_config(
    cfg: MasterPreset,
    profile: dict[str, Any],
    round_idx: int,
) -> tuple[MasterPreset, list[str]]:
    adjusted = cfg
    reasons: list[str] = []
    compliance = _mastering_compliance(profile, cfg=cfg)
    failed = compliance.get("failed", [])
    failed_set = set(failed) if isinstance(failed, list) else set()

    def change(field: str, value: float, reason: str) -> None:
        nonlocal adjusted
        before = float(getattr(adjusted, field))
        after = float(value)
        if abs(after - before) < 1e-6:
            return
        adjusted = replace(adjusted, **{field: after})
        reasons.append(reason)

    if "loudness_hot" in failed_set or "true_peak_risk" in failed_set or "clipping" in failed_set:
        change(
            "limiter_drive",
            max(1.0, adjusted.limiter_drive - (0.14 + 0.04 * max(0, round_idx - 1))),
            "Backed off limiter drive for a safer second pass.",
        )
        change(
            "comp_ratio",
            max(1.2, adjusted.comp_ratio - (0.22 + 0.08 * max(0, round_idx - 1))),
            "Reduced compression ratio to lower density and overshoot risk.",
        )
        change(
            "comp_threshold_db",
            min(-10.0, adjusted.comp_threshold_db + 1.4 + 0.5 * max(0, round_idx - 1)),
            "Raised compression threshold so the rescue pass clamps less aggressively.",
        )
        change(
            "target_true_peak_dbfs",
            min(adjusted.target_true_peak_dbfs, -1.2 - 0.2 * max(0, round_idx - 1)),
            "Lowered true-peak ceiling for post-check safety.",
        )

    if "crest_factor_dense" in failed_set:
        change(
            "comp_ratio",
            max(1.15, adjusted.comp_ratio - (0.28 + 0.1 * max(0, round_idx - 1))),
            "Relaxed compression further because the first pass remained too dense.",
        )
        change(
            "limiter_drive",
            max(1.0, adjusted.limiter_drive - (0.12 + 0.05 * max(0, round_idx - 1))),
            "Reduced limiter drive further to recover transient shape.",
        )

    if "loudness_quiet" in failed_set and "true_peak_risk" not in failed_set and "clipping" not in failed_set:
        change(
            "comp_ratio",
            min(3.8, adjusted.comp_ratio + 0.12),
            "Added a small amount of control because the first pass came out too quiet.",
        )
        change(
            "comp_threshold_db",
            max(-28.0, adjusted.comp_threshold_db - 0.8),
            "Lowered compression threshold slightly to recover target loudness.",
        )

    return adjusted, reasons


def _post_check_mastering_repair(
    source_audio: np.ndarray,
    mastered_audio: np.ndarray,
    sr: int,
    cfg: MasterPreset,
    progress: MasteringProgressCallback | None,
    start_progress: float,
    end_progress: float,
) -> tuple[np.ndarray, dict[str, Any]]:
    best_audio = np.asarray(mastered_audio, dtype=np.float64)
    best_profile = _quality_profile(best_audio, sr=sr, cfg=cfg)
    best_compliance = _mastering_compliance(best_profile, cfg=cfg)
    best_score = _post_check_score(best_profile, cfg=cfg)
    history: list[dict[str, Any]] = []
    applied_round = 0

    if best_compliance.get("passed") is True:
        return best_audio, {
            "attempted": False,
            "applied": False,
            "applied_round": 0,
            "history": history,
            "initial": best_compliance,
            "final": best_compliance,
        }

    span = max(0.001, end_progress - start_progress)
    for round_idx in range(1, 3):
        repair_cfg, reasons = _build_post_check_repair_config(cfg=cfg, profile=best_profile, round_idx=round_idx)
        if not reasons:
            break
        candidate = _apply_master_chain(source_audio, sr=sr, cfg=repair_cfg, normalize_to_targets=True)
        candidate = _apply_marker_aware_local_fixes(
            audio=candidate,
            sr=sr,
            profile=_quality_profile(candidate, sr=sr, cfg=repair_cfg),
            cfg=repair_cfg,
            intensity=1.2 + 0.2 * max(0, round_idx - 1),
        )
        candidate = _finalize_master(candidate, sr=sr, cfg=repair_cfg)
        candidate_profile = _quality_profile(candidate, sr=sr, cfg=repair_cfg)
        candidate_compliance = _mastering_compliance(candidate_profile, cfg=repair_cfg)
        candidate_score = _post_check_score(candidate_profile, cfg=repair_cfg)
        accepted = candidate_score + 0.15 < best_score or (
            candidate_compliance.get("passed") is True and best_compliance.get("passed") is not True
        )
        history.append(
            {
                "round": round_idx,
                "reasons": reasons,
                "accepted": accepted,
                "before": best_compliance,
                "after": candidate_compliance,
            }
        )
        if progress:
            pct = start_progress + span * (round_idx / 2.0)
            progress(float(min(end_progress, max(start_progress, pct))), f"post_check_round_{round_idx}")
        if accepted:
            best_audio = candidate
            best_profile = candidate_profile
            best_compliance = candidate_compliance
            best_score = candidate_score
            applied_round = round_idx
        if best_compliance.get("passed") is True:
            break

    return best_audio, {
        "attempted": True,
        "applied": applied_round > 0,
        "applied_round": applied_round,
        "history": history,
        "initial": history[0]["before"] if history else best_compliance,
        "final": best_compliance,
    }


def _quality_profile(audio: np.ndarray, sr: int, cfg: MasterPreset) -> dict[str, Any]:
    signal = np.asarray(audio, dtype=np.float64)
    mono = np.mean(signal, axis=1).astype(np.float32)
    duration_seconds = float(signal.shape[0] / max(sr, 1))
    integrated_lufs = loudness_integrated_lufs(signal.astype(np.float32), sr=sr)
    true_peak_db = float(dbfs(oversampled_true_peak(signal.astype(np.float32), sr=sr)))
    crest = float(crest_factor_db(mono))
    clipping = clipping_segments(signal.astype(np.float32), sr=sr)
    clipping_count = len(clipping)
    stereo = stereo_timelines(signal.astype(np.float32), sr=sr, window_seconds=1.0, hop_seconds=0.5)
    short_term = loudness_timeline_lufs(
        signal=signal.astype(np.float32),
        sr=sr,
        window_seconds=3.0,
        hop_seconds=max(0.5, duration_seconds / 1600.0),
    )
    harsh = _band_ratio_timeline(
        signal=mono,
        sr=sr,
        low_hz=3000.0,
        high_hz=9000.0,
        window_seconds=0.5,
        hop_seconds=0.5,
    )
    sub = _band_ratio_timeline(
        signal=mono,
        sr=sr,
        low_hz=20.0,
        high_hz=80.0,
        window_seconds=0.5,
        hop_seconds=0.5,
    )
    mono_events = mono_compat_markers(stereo.get("times", []), stereo.get("correlation", []))
    harsh_events = harshness_markers(harsh.get("times", []), harsh.get("ratio", []))
    sub_events = sub_bass_markers(sub.get("times", []), sub.get("ratio", []))
    dip_events = loudness_dip_markers(
        times=short_term.times,
        short_term_lufs=short_term.values,
        integrated_lufs=integrated_lufs,
    )
    true_peak_events: list[dict[str, Any]] = []
    if true_peak_db >= (cfg.target_true_peak_dbfs + 0.2):
        true_peak_events = [
            {
                "type": "true_peak_risk",
                "start_seconds": 0.0,
                "end_seconds": duration_seconds,
                "severity": "high",
                "message": "True peak exceeds configured target safety ceiling.",
            }
        ]
    loudness_hot_events: list[dict[str, Any]] = []
    loudness_quiet_events: list[dict[str, Any]] = []
    if np.isfinite(integrated_lufs):
        loudness_delta = float(integrated_lufs - cfg.target_lufs)
        if loudness_delta > 0.75:
            loudness_hot_events = [
                {
                    "type": "loudness_hot",
                    "start_seconds": 0.0,
                    "end_seconds": duration_seconds,
                    "severity": "high" if loudness_delta > 2.0 else "medium",
                    "message": f"Master remains {loudness_delta:.2f} LU above target loudness.",
                }
            ]
        elif loudness_delta < -1.0:
            loudness_quiet_events = [
                {
                    "type": "loudness_quiet",
                    "start_seconds": 0.0,
                    "end_seconds": duration_seconds,
                    "severity": "medium",
                    "message": f"Master remains {abs(loudness_delta):.2f} LU below target loudness.",
                }
            ]
    crest_dense_events: list[dict[str, Any]] = []
    if np.isfinite(crest) and crest < max(6.8, cfg.desired_crest_db - 1.4):
        crest_dense_events = [
            {
                "type": "crest_factor_dense",
                "start_seconds": 0.0,
                "end_seconds": duration_seconds,
                "severity": "medium",
                "message": "Master remains denser than the selected preset target.",
            }
        ]
    marker_events = {
        "mono_incompatibility": mono_events,
        "harshness_band": harsh_events,
        "sub_bass_heavy": sub_events,
        "loudness_dip": dip_events,
        "clipping": clipping,
        "true_peak_risk": true_peak_events,
        "loudness_hot": loudness_hot_events,
        "loudness_quiet": loudness_quiet_events,
        "crest_factor_dense": crest_dense_events,
    }
    marker_counts = {
        "mono_incompatibility": len(mono_events),
        "harshness_band": len(harsh_events),
        "sub_bass_heavy": len(sub_events),
        "loudness_dip": len(dip_events),
        "clipping": int(clipping_count),
        "true_peak_risk": len(true_peak_events),
        "loudness_hot": len(loudness_hot_events),
        "loudness_quiet": len(loudness_quiet_events),
        "crest_factor_dense": len(crest_dense_events),
    }
    issue_weights = {
        "mono_incompatibility": 3,
        "harshness_band": 2,
        "sub_bass_heavy": 2,
        "loudness_dip": 2,
        "clipping": 3,
        "true_peak_risk": 3,
        "loudness_hot": 3,
        "loudness_quiet": 2,
        "crest_factor_dense": 2,
    }
    issue_score = int(sum(issue_weights[key] for key, count in marker_counts.items() if count > 0))
    payload: dict[str, Any] = {
        "integrated_lufs": integrated_lufs,
        "target_lufs": cfg.target_lufs,
        "true_peak_dbfs": true_peak_db,
        "target_true_peak_dbfs": cfg.target_true_peak_dbfs,
        "crest_factor_db": crest,
        "desired_crest_db": cfg.desired_crest_db,
        "marker_counts": marker_counts,
        "marker_events": marker_events,
        "issue_weights": issue_weights,
        "issue_score": issue_score,
        "duration_seconds": duration_seconds,
    }
    ebur = _try_ebur128_metrics(signal, sr=sr)
    if ebur:
        payload["ebu_r128"] = ebur
    return payload


def _mastering_self_check(
    source_audio: np.ndarray,
    mastered_audio: np.ndarray,
    sr: int,
    cfg: MasterPreset,
    best_output_id: str,
    post_check_repair: dict[str, Any] | None = None,
) -> dict[str, Any]:
    source = _quality_profile(source_audio, sr=sr, cfg=cfg)
    mastered = _quality_profile(mastered_audio, sr=sr, cfg=cfg)
    source_counts = source.get("marker_counts", {})
    mastered_counts = mastered.get("marker_counts", {})
    marker_types = sorted(set(source_counts.keys()) | set(mastered_counts.keys()))

    resolved: list[str] = []
    improved: list[str] = []
    worsened: list[str] = []
    remaining: list[str] = []
    for marker in marker_types:
        before = int(source_counts.get(marker, 0))
        after = int(mastered_counts.get(marker, 0))
        if before > 0 and after == 0:
            resolved.append(marker)
        if after > 0:
            remaining.append(marker)
        if after < before:
            improved.append(marker)
        elif after > before:
            worsened.append(marker)

    before_score = int(source.get("issue_score", 0))
    after_score = int(mastered.get("issue_score", 0))
    if after_score <= max(0, before_score - 4):
        assessment = "strong_improvement"
    elif after_score < before_score:
        assessment = "partial_improvement"
    elif after_score == before_score:
        assessment = "unchanged"
    else:
        assessment = "regression"

    return {
        "assessment": assessment,
        "best_output_id": best_output_id,
        "score_before": before_score,
        "score_after": after_score,
        "score_delta": after_score - before_score,
        "resolved": resolved,
        "improved": improved,
        "remaining": remaining,
        "worsened": worsened,
        "recommended_fixes": _marker_fix_recommendations(remaining),
        "compliance_source": _mastering_compliance(source, cfg=cfg),
        "compliance_mastered": _mastering_compliance(mastered, cfg=cfg),
        "post_check_repair": post_check_repair or {
            "attempted": False,
            "applied": False,
            "applied_round": 0,
            "history": [],
        },
        "source": source,
        "mastered": mastered,
    }


def _marker_fix_recommendations(remaining: list[str]) -> list[dict[str, str]]:
    guidance_map = {
        "harshness_band": {
            "issue": "harshness_band",
            "action": (
                "Use dynamic EQ in 3k-9k and reduce resonant peaks in "
                "mix bus or vocal/music stems."
            ),
        },
        "sub_bass_heavy": {
            "issue": "sub_bass_heavy",
            "action": (
                "Tighten 20-80 Hz with dynamic low-shelf and mono low-end "
                "management below ~120 Hz."
            ),
        },
        "mono_incompatibility": {
            "issue": "mono_incompatibility",
            "action": "Reduce out-of-phase side content and collapse low frequencies to mono.",
        },
        "loudness_dip": {
            "issue": "loudness_dip",
            "action": (
                "Use clip gain/automation and light upward compression "
                "in low-energy sections."
            ),
        },
        "clipping": {
            "issue": "clipping",
            "action": (
                "Lower input into limiter and repair clipped transients "
                "before final limiting."
            ),
        },
        "true_peak_risk": {
            "issue": "true_peak_risk",
            "action": (
                "Set true-peak limiter ceiling around -1.0 dBTP "
                "(or lower for lossy exports)."
            ),
        },
        "loudness_hot": {
            "issue": "loudness_hot",
            "action": "Back off limiter drive/compression and rerender from source to hit the requested LUFS target.",
        },
        "loudness_quiet": {
            "issue": "loudness_quiet",
            "action": "Raise loudness more gently from source with moderate control instead of pushing the final limiter harder.",
        },
        "crest_factor_dense": {
            "issue": "crest_factor_dense",
            "action": "Reduce bus compression and limiter density; rerender from source to recover transient contrast.",
        },
    }
    recommendations: list[dict[str, str]] = []
    for key in remaining:
        payload = guidance_map.get(key)
        if payload:
            recommendations.append(payload)
    return recommendations


def _band_ratio_timeline(
    signal: np.ndarray,
    sr: int,
    low_hz: float,
    high_hz: float,
    window_seconds: float,
    hop_seconds: float,
) -> dict[str, list[float]]:
    window = max(1, int(window_seconds * sr))
    hop = max(1, int(hop_seconds * sr))
    times: list[float] = []
    ratios: list[float] = []
    for start in range(0, max(1, signal.shape[0] - window), hop):
        chunk = signal[start : start + window]
        if chunk.shape[0] < window:
            break
        spectrum = np.abs(np.fft.rfft(chunk)) ** 2
        freqs = np.fft.rfftfreq(chunk.size, d=1.0 / sr)
        band = float(np.sum(spectrum[(freqs >= low_hz) & (freqs <= high_hz)]))
        total = float(np.sum(spectrum) + EPS)
        ratios.append(band / total)
        times.append(start / sr)
    return {"times": times, "ratio": ratios}


def _file_sha256(path: Path) -> str | None:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                if not chunk:
                    break
                digest.update(chunk)
    except OSError:
        return None
    return digest.hexdigest()


def _db_to_linear(value_db: float) -> float:
    return float(10.0 ** (value_db / 20.0))


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()
