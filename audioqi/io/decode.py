from __future__ import annotations

import subprocess
from pathlib import Path
from shutil import which

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly


def ffmpeg_available() -> bool:
    return which("ffmpeg") is not None


def decode_to_canonical(
    input_path: Path,
    output_wav_path: Path,
    target_sr: int = 48_000,
    ffmpeg_timeout_seconds: int | None = None,
) -> None:
    output_wav_path.parent.mkdir(parents=True, exist_ok=True)
    if ffmpeg_available():
        _decode_with_ffmpeg(
            input_path=input_path,
            output_wav_path=output_wav_path,
            target_sr=target_sr,
            timeout_seconds=ffmpeg_timeout_seconds,
        )
        return
    _decode_with_soundfile(
        input_path=input_path,
        output_wav_path=output_wav_path,
        target_sr=target_sr,
    )


def _decode_with_ffmpeg(
    input_path: Path,
    output_wav_path: Path,
    target_sr: int,
    timeout_seconds: int | None,
) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(input_path),
        "-vn",
        "-acodec",
        "pcm_f32le",
        "-ar",
        str(target_sr),
        str(output_wav_path),
    ]
    timeout = None if timeout_seconds is None or timeout_seconds <= 0 else timeout_seconds
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"ffmpeg decode timed out after {timeout} seconds for file: {input_path.name}"
        ) from exc
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed: {proc.stderr.strip()}")


def _decode_with_soundfile(input_path: Path, output_wav_path: Path, target_sr: int) -> None:
    data, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    if sr != target_sr:
        data = _resample(data=data, src_sr=sr, dst_sr=target_sr)
    sf.write(str(output_wav_path), data.astype(np.float32), target_sr, subtype="FLOAT")


def _resample(data: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if src_sr == dst_sr:
        return data
    gcd = int(np.gcd(src_sr, dst_sr))
    up = dst_sr // gcd
    down = src_sr // gcd
    channels: list[np.ndarray] = []
    for ch in range(data.shape[1]):
        channels.append(resample_poly(data[:, ch], up, down))
    stacked = np.stack(channels, axis=1)
    return stacked.astype(np.float32, copy=False)
