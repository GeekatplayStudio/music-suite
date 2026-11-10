"""Time-stretch, pitch-shift, denoise and loudness normalisation.

All functions take and return ``(frames, channels)`` float32 arrays, process
every channel (stereo is never collapsed) and report the engine actually used.
"""

from __future__ import annotations

import itertools
import logging
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.ndimage import uniform_filter
from scipy.signal import istft, resample_poly, stft

from audioqi.editor import engines, projects
from audioqi.editor.projects import EditorError

logger = logging.getLogger(__name__)

MIN_PROCESS_FRAMES = 4096
_GATE_NPERSEG = 2048
_GATE_HOP = 512


def fit_length(audio: np.ndarray, frames: int) -> np.ndarray:
    """Pad with silence or trim so the first axis is exactly ``frames`` long."""
    if audio.shape[0] == frames:
        return audio
    if audio.shape[0] > frames:
        return audio[:frames]
    pad = [(0, frames - audio.shape[0])] + [(0, 0)] * (audio.ndim - 1)
    return np.pad(audio, pad)


def require_min_length(audio: np.ndarray) -> None:
    if audio.shape[0] < MIN_PROCESS_FRAMES:
        raise EditorError("Audio is too short to process.")


def process_chunked(
    audio: np.ndarray,
    sample_rate: int,
    fn: Callable[[np.ndarray], np.ndarray],
    *,
    chunk_seconds: float = 30.0,
    overlap_seconds: float = 1.0,
    progress: Callable[[float], None] | None = None,
) -> np.ndarray:
    """Run ``fn`` over crossfaded chunks to bound memory on long files.

    ``fn`` maps ``(n, ch)`` to ``(k, n, ch)``. Crossfade weights of neighbouring
    chunks sum to one, so outputs that sum to the input chunk still sum to the input.
    """
    frames = audio.shape[0]
    step = int(chunk_seconds * sample_rate)
    overlap = int(overlap_seconds * sample_rate)
    if frames <= step + overlap:
        result = fn(audio)
        if progress:
            progress(1.0)
        return result
    ramp = np.linspace(0.0, 1.0, overlap, endpoint=False, dtype=np.float32)[:, None]
    out: np.ndarray | None = None
    start = 0
    while True:
        end = min(frames, start + step + overlap)
        part = np.array(fn(audio[start:end]), dtype=np.float32)
        if start > 0:
            part[:, :overlap] *= ramp
        if end < frames:
            part[:, -overlap:] *= 1.0 - ramp
        if out is None:
            out = np.zeros((part.shape[0], frames, audio.shape[1]), dtype=np.float32)
        out[:, start:end] += part
        if progress:
            progress(end / frames)
        if end >= frames:
            break
        start += step
    return out


def _run_tool(cmd: list[str]) -> None:
    timeout = projects.SETTINGS.ffmpeg_timeout_seconds
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=False,
        timeout=timeout if timeout and timeout > 0 else None,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"{cmd[0]} exited with status {proc.returncode}")


# --------------------------------------------------------------------------- stretch / pitch


def _stretch_pedalboard(audio: np.ndarray, sr: int, rate: float, semitones: float) -> np.ndarray:
    import pedalboard

    out = pedalboard.time_stretch(
        np.ascontiguousarray(audio.T, dtype=np.float32),
        float(sr),
        stretch_factor=float(rate),
        pitch_shift_in_semitones=float(semitones),
        high_quality=True,
    )
    return np.asarray(out, dtype=np.float32).T


def _stretch_rubberband_cli(
    audio: np.ndarray, sr: int, rate: float, semitones: float
) -> np.ndarray:
    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        src = Path(tmp) / "in.wav"
        dst = Path(tmp) / "out.wav"
        sf.write(str(src), audio, sr, subtype="FLOAT")
        tempo, pitch = f"{rate:.8f}", f"{semitones:.6f}"
        _run_tool(["rubberband", "-q", "--tempo", tempo, "--pitch", pitch, str(src), str(dst)])
        out, _ = sf.read(str(dst), dtype="float32", always_2d=True)
    return out


def _stretch_librosa(audio: np.ndarray, sr: int, rate: float, semitones: float) -> np.ndarray:
    import librosa

    y = np.ascontiguousarray(audio.T, dtype=np.float32)
    if rate != 1.0:
        y = librosa.effects.time_stretch(y, rate=rate)
    if semitones != 0.0:
        y = librosa.effects.pitch_shift(y, sr=sr, n_steps=semitones)
    return np.asarray(y, dtype=np.float32).T


_STRETCH_IMPL: dict[str, Callable[[np.ndarray, int, float, float], np.ndarray]] = {
    "pedalboard-rubberband": _stretch_pedalboard,
    "rubberband-cli": _stretch_rubberband_cli,
    "librosa": _stretch_librosa,
}


def stretch_pitch(
    audio: np.ndarray, sample_rate: int, *, rate: float = 1.0, semitones: float = 0.0
) -> tuple[np.ndarray, str]:
    """Change tempo by ``rate`` (2.0 = twice as fast) and pitch by ``semitones``.

    Tempo changes preserve pitch and pitch changes preserve duration. The output is
    exactly ``round(frames / rate)`` frames long.
    """
    frames = audio.shape[0]
    target = max(1, round(frames / rate))
    if rate == 1.0 and semitones == 0.0:
        return audio.copy(), "none"
    require_min_length(audio)
    candidates = engines.stretch_engines()
    for name in candidates:
        try:
            out = _STRETCH_IMPL[name](audio, sample_rate, rate, semitones)
        except Exception:
            if name == candidates[-1]:
                raise
            logger.warning("Editor stretch engine %s failed; trying the next one.", name)
            continue
        if out.ndim != 2 or out.shape[1] != audio.shape[1] or out.shape[0] == 0:
            if name == candidates[-1]:
                raise EditorError("Time-stretch produced no audio.")
            continue
        return fit_length(out.astype(np.float32, copy=False), target), name
    raise EditorError("No time-stretch engine is available.")


WARP_MIN_SEGMENT_SECONDS = 0.1
_WARP_CROSSFADE = 480


def warp_map(markers: list[tuple[float, float]], duration: float) -> list[tuple[float, float]]:
    """Full list of (source, target) anchors: the start, the markers, and the end.

    Audio after the last marker keeps its original speed.
    """
    points = [(0.0, 0.0), *[m for m in markers if m[0] < duration - 1e-6]]
    last_src, last_dst = points[-1]
    points.append((duration, last_dst + (duration - last_src)))
    return points


def warp(
    audio: np.ndarray, sample_rate: int, markers: list[tuple[float, float]]
) -> tuple[np.ndarray, str]:
    """Piecewise time-stretch: each marker's source time is moved to its target time."""
    points = warp_map(markers, audio.shape[0] / sample_rate)
    total = round(points[-1][1] * sample_rate)
    out = np.zeros((total, audio.shape[1]), dtype=np.float32)
    engine = "none"
    fade = np.linspace(0.0, 1.0, _WARP_CROSSFADE, endpoint=False, dtype=np.float32)[:, None]
    for (src0, dst0), (src1, dst1) in itertools.pairwise(points):
        a, b = round(src0 * sample_rate), round(src1 * sample_rate)
        x, y = round(dst0 * sample_rate), min(total, round(dst1 * sample_rate))
        if b - a < 2 or y - x < 2:
            continue
        rate = (b - a) / (y - x)
        if abs(rate - 1.0) < 1e-4:
            piece = audio[a:b]
        else:
            # A little extra source on both sides lets neighbouring pieces crossfade.
            lead = min(a, round(_WARP_CROSSFADE * rate))
            tail = min(audio.shape[0] - b, round(_WARP_CROSSFADE * rate))
            stretched, used = stretch_pitch(audio[a - lead : b + tail], sample_rate, rate=rate)
            engine = used if used != "none" else engine
            skip = round(lead / rate)
            piece = stretched[skip : skip + (y - x)]
        piece = fit_length(piece.astype(np.float32, copy=False), y - x).copy()
        n = min(_WARP_CROSSFADE, (y - x) // 2)
        if x > 0 and n > 1:
            # Blend from the previous piece's own continuation into this one.
            piece[:n] = piece[:n] * fade[:n] + out[x : x + n] * (1.0 - fade[:n])
        out[x:y] = piece
        if y < total and abs(rate - 1.0) >= 1e-4 and n > 1:
            extra = stretched[skip + (y - x) : skip + (y - x) + n]
            out[y : y + extra.shape[0]] = extra[: total - y]
    return out, engine


# --------------------------------------------------------------------------- denoise


def _gate_channel(x: np.ndarray, sr: int, strength: float, noise: np.ndarray | None) -> np.ndarray:
    kwargs = {"fs": sr, "nperseg": _GATE_NPERSEG, "noverlap": _GATE_NPERSEG - _GATE_HOP}
    _, _, spec = stft(x, **kwargs)
    mag = np.abs(spec)
    if noise is not None:
        _, _, noise_spec = stft(noise, **kwargs)
        noise_mag = np.abs(noise_spec)
        threshold = noise_mag.mean(axis=1) + 1.5 * noise_mag.std(axis=1)
    else:
        # No print: treat the quietest fifth of frames in each bin as the noise floor.
        threshold = np.percentile(mag, 20, axis=1) * 2.0
    threshold = threshold[:, None] + 1e-10
    mask = np.clip(mag / threshold - 1.0, 0.0, 1.0)
    mask = uniform_filter(mask, size=(5, 9), mode="nearest")
    gain = 1.0 - strength * (1.0 - mask)
    _, y = istft(spec * gain, **kwargs)
    return fit_length(y.astype(np.float32), x.shape[0])


def _spectral_gate(
    audio: np.ndarray, sr: int, strength: float, noise: np.ndarray | None
) -> np.ndarray:
    def run(chunk: np.ndarray) -> np.ndarray:
        cols = [
            _gate_channel(chunk[:, ch], sr, strength, None if noise is None else noise[:, ch])
            for ch in range(chunk.shape[1])
        ]
        return np.stack(cols, axis=1)[None]

    return process_chunked(audio, sr, run)[0]


def _noisereduce(
    audio: np.ndarray, sr: int, strength: float, noise: np.ndarray | None
) -> np.ndarray:
    import noisereduce

    out = noisereduce.reduce_noise(
        y=np.ascontiguousarray(audio.T),
        sr=sr,
        y_noise=None if noise is None else np.ascontiguousarray(noise.T),
        stationary=noise is not None,
        prop_decrease=float(strength),
    )
    return np.asarray(out, dtype=np.float32).T


def _afftdn(audio: np.ndarray, sr: int, strength: float, noise: np.ndarray | None) -> np.ndarray:
    floor_db = -50.0
    if noise is not None:
        rms = float(np.sqrt(np.mean(np.square(noise, dtype=np.float64))))
        floor_db = 20.0 * np.log10(max(rms, 1e-8))
    floor_db = float(np.clip(floor_db, -80.0, -20.0))
    reduction = float(np.clip(strength * 40.0, 0.01, 97.0))
    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        src = Path(tmp) / "in.wav"
        dst = Path(tmp) / "out.wav"
        sf.write(str(src), audio, sr, subtype="FLOAT")
        chain = f"afftdn=nr={reduction:.2f}:nf={floor_db:.2f}"
        head = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src)]
        _run_tool([*head, "-af", chain, "-acodec", "pcm_f32le", "-ar", str(sr), str(dst)])
        out, _ = sf.read(str(dst), dtype="float32", always_2d=True)
    return out


def denoise(
    audio: np.ndarray,
    sample_rate: int,
    *,
    strength: float = 0.6,
    noise_start: float | None = None,
    noise_end: float | None = None,
    mode: str = "auto",
) -> tuple[np.ndarray, str, bool]:
    """Reduce steady background noise. Returns ``(audio, engine, used_noise_print)``."""
    require_min_length(audio)
    frames = audio.shape[0]
    noise: np.ndarray | None = None
    if noise_start is not None and noise_end is not None:
        duration = frames / sample_rate
        if noise_end > duration + 1e-6:
            raise EditorError("The noise-print region lies outside the audio.")
        lo, hi = int(noise_start * sample_rate), min(frames, int(noise_end * sample_rate))
        if hi - lo < _GATE_NPERSEG:
            raise EditorError("The noise-print region is too short (need at least 50 ms).")
        noise = audio[lo:hi]

    if mode == "fft" and engines.has_ffmpeg():
        impl, engine = _afftdn, "ffmpeg-afftdn"
    elif mode == "auto" and engines.has_module("noisereduce"):
        impl, engine = _noisereduce, "noisereduce"
    else:
        impl, engine = _spectral_gate, "spectral-gate"

    if strength <= 0.0:
        return audio.copy(), engine, noise is not None
    try:
        out = impl(audio, sample_rate, strength, noise)
    except Exception:
        if impl is _spectral_gate:
            raise
        logger.warning("Editor denoise engine %s failed; using the built-in gate.", engine)
        out, engine = _spectral_gate(audio, sample_rate, strength, noise), "spectral-gate"
    if out.ndim != 2 or out.shape[1] != audio.shape[1]:
        raise EditorError("Denoise produced unexpected audio.")
    return fit_length(out.astype(np.float32, copy=False), frames), engine, noise is not None


# --------------------------------------------------------------------------- loudness


def integrated_lufs(audio: np.ndarray, sample_rate: int) -> float | None:
    """Integrated loudness (ITU-R BS.1770), or None for silence / clips under 0.4 s."""
    import pyloudnorm

    try:
        value = float(pyloudnorm.Meter(sample_rate).integrated_loudness(audio.astype(np.float64)))
    except Exception:
        return None
    return value if np.isfinite(value) else None


def true_peak_dbfs(audio: np.ndarray, sample_rate: int) -> float:
    """Approximate true peak via 4x oversampling, measured block by block."""
    block = max(1, int(sample_rate * 10))
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    for ch in range(audio.shape[1]):
        for start in range(0, audio.shape[0], block):
            part = audio[max(0, start - 64) : start + block + 64, ch]
            if part.shape[0] > 16:
                peak = max(peak, float(np.max(np.abs(resample_poly(part, 4, 1)))))
    return 20.0 * float(np.log10(max(peak, 1e-10)))


def normalize(
    audio: np.ndarray,
    sample_rate: int,
    *,
    target_lufs: float = -14.0,
    true_peak_ceiling_dbfs: float = -1.0,
) -> tuple[np.ndarray, dict[str, float]]:
    """Apply one static gain towards ``target_lufs`` without exceeding the true-peak ceiling."""
    input_lufs = integrated_lufs(audio, sample_rate)
    if input_lufs is None:
        raise EditorError("Loudness could not be measured (audio is silent or under 0.4 s).")
    gain_db = target_lufs - input_lufs
    headroom = true_peak_ceiling_dbfs - true_peak_dbfs(audio, sample_rate)
    gain_db = min(gain_db, headroom)
    out = (audio * np.float32(10.0 ** (gain_db / 20.0))).astype(np.float32)
    return out, {
        "input_lufs": round(input_lufs, 2),
        "output_lufs": round(input_lufs + gain_db, 2),
        "gain_db": round(gain_db, 2),
    }
