from __future__ import annotations

import math
from itertools import pairwise
from typing import Any


def _timeline_hop_seconds(times: list[float], fallback: float) -> float:
    if len(times) < 2:
        return fallback
    deltas = [b - a for a, b in pairwise(times) if b > a]
    if not deltas:
        return fallback
    return max(0.001, float(sorted(deltas)[len(deltas) // 2]))


def _merge_flags_to_markers(
    times: list[float],
    flags: list[bool],
    window_seconds: float,
    marker_type: str,
    severity: str,
    message: str,
) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    if not times or not flags:
        return markers
    hop = _timeline_hop_seconds(times, fallback=window_seconds)
    gap_tolerance = max(hop * 1.5, 0.03)

    active_start: float | None = None
    active_end: float | None = None

    def flush() -> None:
        nonlocal active_start, active_end
        if active_start is None or active_end is None:
            return
        markers.append(
            {
                "type": marker_type,
                "start_seconds": float(active_start),
                "end_seconds": float(active_end),
                "severity": severity,
                "message": message,
            }
        )
        active_start = None
        active_end = None

    for t, active in zip(times, flags, strict=False):
        start = float(t)
        end = float(t + window_seconds)
        if not active:
            flush()
            continue
        if active_start is None:
            active_start = start
            active_end = end
            continue
        if start <= (active_end + gap_tolerance):
            active_end = max(active_end, end)
        else:
            flush()
            active_start = start
            active_end = end

    flush()
    return markers


def loudness_dip_markers(
    times: list[float],
    short_term_lufs: list[float],
    integrated_lufs: float,
    threshold_db: float = 8.0,
) -> list[dict[str, Any]]:
    if not times or not short_term_lufs or integrated_lufs == float("-inf"):
        return []
    threshold = integrated_lufs - threshold_db
    flags = [val <= threshold for val in short_term_lufs]
    return _merge_flags_to_markers(
        times=times,
        flags=flags,
        window_seconds=3.0,
        marker_type="loudness_dip",
        severity="medium",
        message="Short-term loudness drop below target window.",
    )


def sibilance_markers(
    times: list[float],
    sibilance_ratio: list[float],
    threshold: float = 0.20,
) -> list[dict[str, Any]]:
    flags = [ratio >= threshold for ratio in sibilance_ratio]
    return _merge_flags_to_markers(
        times=times,
        flags=flags,
        window_seconds=0.5,
        marker_type="sibilance",
        severity="medium",
        message="Excessive 6k-10k sibilance-band energy.",
    )


def mono_compat_markers(times: list[float], correlation: list[float]) -> list[dict[str, Any]]:
    flags = [corr < -0.10 for corr in correlation]
    return _merge_flags_to_markers(
        times=times,
        flags=flags,
        window_seconds=1.0,
        marker_type="mono_incompatibility",
        severity="high",
        message="Negative stereo correlation indicates mono compatibility risk.",
    )


def true_peak_risk_markers(
    times: list[float],
    peak_dbfs_timeline: list[float],
    threshold_dbfs: float = -1.0,
) -> list[dict[str, Any]]:
    flags = [val >= threshold_dbfs for val in peak_dbfs_timeline]
    return _merge_flags_to_markers(
        times=times,
        flags=flags,
        window_seconds=0.05,
        marker_type="true_peak_risk",
        severity="high",
        message="Peak envelope is above -1 dBFS; inter-sample clipping risk is elevated.",
    )


def harshness_markers(
    times: list[float],
    harsh_ratio: list[float],
    threshold: float = 0.26,
) -> list[dict[str, Any]]:
    flags = [ratio >= threshold for ratio in harsh_ratio]
    return _merge_flags_to_markers(
        times=times,
        flags=flags,
        window_seconds=0.5,
        marker_type="harshness_band",
        severity="medium",
        message="Persistent 3k-9k harshness-band energy detected.",
    )


def sub_bass_markers(
    times: list[float],
    sub_ratio: list[float],
    threshold: float = 0.24,
) -> list[dict[str, Any]]:
    flags = [ratio >= threshold for ratio in sub_ratio]
    return _merge_flags_to_markers(
        times=times,
        flags=flags,
        window_seconds=0.5,
        marker_type="sub_bass_heavy",
        severity="medium",
        message="Sub-bass (20-80 Hz) dominates energy in this section.",
    )


def dc_offset_marker(
    dc_offset: float,
    duration_seconds: float,
    threshold: float = 0.01,
) -> list[dict[str, Any]]:
    if math.isfinite(dc_offset) and abs(dc_offset) >= threshold:
        return [
            {
                "type": "dc_offset",
                "start_seconds": 0.0,
                "end_seconds": max(0.05, float(duration_seconds)),
                "severity": "medium",
                "message": f"DC offset {dc_offset:+.4f} exceeds threshold ±{threshold:.3f}.",
            }
        ]
    return []
