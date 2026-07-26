from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

import librosa
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

KNN_DEFAULT_COLUMNS: tuple[str, ...] = (
    "spectral_centroid_hz",
    "spectral_spread_hz",
    "spectral_flatness",
    "rms",
    "peak_hz",
)


def extract_frame_features(
    audio_path: str | Path,
    sr: int = 48_000,
    n_fft: int = 2_048,
    hop_length: int = 512,
) -> tuple[pd.DataFrame, dict[str, float | int]]:
    """Extract frame-wise spectral descriptors from an audio file."""
    path = Path(audio_path)
    signal, sample_rate = librosa.load(path.as_posix(), sr=sr, mono=True)

    stft = librosa.stft(signal, n_fft=n_fft, hop_length=hop_length)
    magnitude = np.abs(stft)
    frequencies = librosa.fft_frequencies(sr=sample_rate, n_fft=n_fft)

    arrays: dict[str, np.ndarray] = {
        "rms": librosa.feature.rms(S=magnitude)[0],
        "spectral_centroid_hz": librosa.feature.spectral_centroid(S=magnitude, sr=sample_rate)[0],
        "spectral_spread_hz": librosa.feature.spectral_bandwidth(S=magnitude, sr=sample_rate)[0],
        "spectral_rolloff_hz": librosa.feature.spectral_rolloff(S=magnitude, sr=sample_rate)[0],
        "spectral_flatness": librosa.feature.spectral_flatness(S=magnitude)[0],
        "zcr": librosa.feature.zero_crossing_rate(
            signal,
            frame_length=n_fft,
            hop_length=hop_length,
        )[0],
        "peak_hz": frequencies[np.argmax(magnitude, axis=0)],
    }

    min_frames = min(len(values) for values in arrays.values())
    times = librosa.frames_to_time(np.arange(min_frames), sr=sample_rate, hop_length=hop_length)

    frame_data: dict[str, np.ndarray] = {
        "t_seconds": times,
        "rms": arrays["rms"][:min_frames],
        "spectral_centroid_hz": arrays["spectral_centroid_hz"][:min_frames],
        "spectral_spread_hz": arrays["spectral_spread_hz"][:min_frames],
        "spectral_rolloff_hz": arrays["spectral_rolloff_hz"][:min_frames],
        "spectral_flatness": arrays["spectral_flatness"][:min_frames],
        "zcr": arrays["zcr"][:min_frames],
        "peak_hz": arrays["peak_hz"][:min_frames],
        "frame_index": np.arange(min_frames, dtype=int),
    }

    frame_data["spectral_spread_khz"] = frame_data["spectral_spread_hz"] / 1_000.0
    table = pd.DataFrame(frame_data)

    metadata: dict[str, float | int] = {
        "sample_rate": int(sample_rate),
        "duration_seconds": float(len(signal) / sample_rate),
        "num_samples": len(signal),
        "num_frames": int(min_frames),
        "n_fft": int(n_fft),
        "hop_length": int(hop_length),
    }
    return table, metadata


def build_temporal_edges(frame_indices: Iterable[int]) -> pd.DataFrame:
    """Create temporal edges connecting i -> i+1."""
    ids = np.asarray(list(frame_indices), dtype=int)
    if len(ids) < 2:
        return pd.DataFrame(columns=["i", "j", "weight", "mode"])

    edges = pd.DataFrame(
        {
            "i": ids[:-1],
            "j": ids[1:],
            "weight": np.ones(len(ids) - 1, dtype=float),
            "mode": "temporal",
        }
    )
    return edges


def build_knn_edges(
    df: pd.DataFrame,
    columns: Iterable[str] = KNN_DEFAULT_COLUMNS,
    neighbors: int = 3,
) -> pd.DataFrame:
    """Create undirected kNN edges in descriptor space."""
    cols = list(columns)
    missing = [column for column in cols if column not in df.columns]
    if missing:
        raise ValueError(f"Cannot build kNN edges, missing columns: {missing}")

    if neighbors < 1:
        raise ValueError("neighbors must be >= 1")

    points = df[cols].to_numpy(dtype=float)
    if len(points) < 2:
        return pd.DataFrame(columns=["i", "j", "weight", "mode"])

    tree = cKDTree(points)
    query_k = min(neighbors + 1, len(points))
    distances, indices = tree.query(points, k=query_k)

    if query_k == 1:
        distances = distances[:, np.newaxis]
        indices = indices[:, np.newaxis]

    edge_weights: dict[tuple[int, int], float] = {}
    for source in range(len(points)):
        for target, dist in zip(indices[source, 1:], distances[source, 1:], strict=True):
            if int(target) == source:
                continue
            a, b = sorted((source, int(target)))
            key = (a, b)
            distance_value = float(dist)
            if key not in edge_weights or distance_value < edge_weights[key]:
                edge_weights[key] = distance_value

    rows = [
        {"i": i, "j": j, "weight": weight, "mode": "knn"}
        for (i, j), weight in sorted(edge_weights.items())
    ]
    return pd.DataFrame(rows, columns=["i", "j", "weight", "mode"])
