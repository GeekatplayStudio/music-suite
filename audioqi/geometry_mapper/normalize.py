from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import pandas as pd

NORMALIZATION_CHOICES = {"none", "minmax", "zscore"}


def _target_columns(df: pd.DataFrame, exclude: Iterable[str]) -> list[str]:
    excluded = set(exclude)
    return [
        column
        for column in df.columns
        if column not in excluded and pd.api.types.is_numeric_dtype(df[column])
    ]


def normalize_dataframe(
    df: pd.DataFrame,
    method: str = "none",
    exclude: Iterable[str] = ("t_seconds", "frame_index"),
) -> pd.DataFrame:
    """Normalize numeric columns with `none`, `minmax`, or `zscore`."""
    mode = method.lower()
    if mode not in NORMALIZATION_CHOICES:
        options = ", ".join(sorted(NORMALIZATION_CHOICES))
        raise ValueError(f"Unsupported normalization method: {method}. Expected one of: {options}")

    out = df.copy()
    if mode == "none":
        return out

    for column in _target_columns(out, exclude):
        series = out[column].astype(float)
        if mode == "minmax":
            min_value = float(series.min())
            max_value = float(series.max())
            denom = max_value - min_value
            out[column] = 0.0 if np.isclose(denom, 0.0) else (series - min_value) / denom
        elif mode == "zscore":
            mean_value = float(series.mean())
            std_value = float(series.std(ddof=0))
            out[column] = 0.0 if np.isclose(std_value, 0.0) else (series - mean_value) / std_value

    return out


def smooth_dataframe(
    df: pd.DataFrame,
    window: int = 1,
    exclude: Iterable[str] = ("t_seconds", "frame_index"),
) -> pd.DataFrame:
    """Apply moving-average smoothing to numeric columns."""
    win = max(int(window), 1)
    out = df.copy()
    if win <= 1:
        return out

    for column in _target_columns(out, exclude):
        out[column] = (
            out[column].astype(float).rolling(window=win, min_periods=1, center=True).mean()
        )

    return out
