from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf


def write_synthetic_fixture(path: Path, sr: int = 48_000, duration_seconds: float = 3.0) -> Path:
    t = np.linspace(
        0, duration_seconds, int(sr * duration_seconds), endpoint=False, dtype=np.float32
    )
    left = 0.25 * np.sin(2 * np.pi * 440.0 * t)
    right = 0.20 * np.sin(2 * np.pi * 880.0 * t)

    # Inject deterministic clipped pulse to validate markers.
    clip_start = int(1.00 * sr)
    clip_end = int(1.02 * sr)
    left[clip_start:clip_end] = 1.0
    right[clip_start:clip_end] = -1.0

    stereo = np.stack([left, right], axis=1).astype(np.float32)
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), stereo, sr, subtype="FLOAT")
    return path
