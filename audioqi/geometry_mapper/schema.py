from __future__ import annotations

from collections.abc import Mapping

import numpy as np
import pandas as pd

REQUIRED_COLUMNS: list[str] = [
    "t_seconds",
    "rms",
    "spectral_centroid_hz",
    "spectral_spread_hz",
    "spectral_spread_khz",
    "spectral_rolloff_hz",
    "spectral_flatness",
    "zcr",
    "peak_hz",
    "frame_index",
]


def validate_feature_schema(df: pd.DataFrame) -> None:
    """Validate required columns, NaNs, and monotonic time/frame index."""
    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    if df.empty:
        raise ValueError("Feature table is empty.")

    if df[REQUIRED_COLUMNS].isna().to_numpy().any():
        raise ValueError("Feature table contains NaN values in required columns.")

    time_values = df["t_seconds"].to_numpy(dtype=float)
    if np.any(np.diff(time_values) < 0):
        raise ValueError("Time column `t_seconds` must be monotonic non-decreasing.")

    frame_indices = df["frame_index"].to_numpy(dtype=int)
    if np.any(np.diff(frame_indices) < 0):
        raise ValueError("`frame_index` must be monotonic non-decreasing.")


def column_min_max(df: pd.DataFrame) -> Mapping[str, dict[str, float]]:
    """Return min/max bounds for numeric columns."""
    bounds: dict[str, dict[str, float]] = {}
    for column in df.columns:
        if pd.api.types.is_numeric_dtype(df[column]):
            values = df[column].to_numpy(dtype=float)
            bounds[column] = {
                "min": float(np.min(values)),
                "max": float(np.max(values)),
            }
    return bounds
