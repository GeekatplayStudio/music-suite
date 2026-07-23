from __future__ import annotations

from typing import Any

import numpy as np


def gpu_spectrogram_suite(signal: np.ndarray, sr: int) -> dict[str, dict[str, Any]]:
    """
    Optional CUDA backend placeholder.
    Keep CPU analysis as default deterministic path for MVP.
    """
    try:
        import torch
        import torchaudio
    except Exception as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("GPU backend unavailable; install torch + torchaudio.") from exc

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    x = torch.from_numpy(signal.astype(np.float32)).to(device)
    if x.ndim == 1:
        x = x.unsqueeze(0)
    spec_transform = torchaudio.transforms.Spectrogram(
        n_fft=4096,
        hop_length=1024,
        power=2.0,
    ).to(device)
    spec = spec_transform(x).squeeze(0).detach().cpu().numpy()
    spec_db = 10.0 * np.log10(np.maximum(spec, 1e-12))
    times = np.arange(spec_db.shape[1]) * (1024.0 / sr)
    freqs = np.linspace(0, sr / 2.0, spec_db.shape[0])
    return {
        "stft_linear": {
            "z": spec_db.tolist(),
            "x": times.tolist(),
            "y": freqs.tolist(),
            "x_title": "Time (s)",
            "y_title": "Frequency (Hz)",
        }
    }
