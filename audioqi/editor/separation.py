"""Stem separation with the best engine available and an always-present fallback.

Preference: ``audio-separator`` (BS-RoFormer / htdemucs), then ``demucs``, then the
built-in ``basic-hpss`` (HPSS plus mid/side centre extraction; approximate, 2 or 4
stems). Every stem has exactly the input's length, sample rate and channel count.
"""

from __future__ import annotations

import logging
import re
import tempfile
from collections.abc import Callable
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from audioqi.editor import engines, projects
from audioqi.editor.processing import fit_length, process_chunked, require_min_length
from audioqi.editor.projects import EditorError

logger = logging.getLogger(__name__)

STEM_NAMES: dict[int, list[str]] = {
    2: ["vocals", "instrumental"],
    4: ["vocals", "drums", "bass", "other"],
    6: ["vocals", "drums", "bass", "guitar", "piano", "other"],
}
_SEPARATOR_MODELS = {
    2: "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
    4: "htdemucs_ft.yaml",
    6: "htdemucs_6s.yaml",
}
_STEM_IN_FILENAME = re.compile(r"_\(([A-Za-z ]+)\)")
Progress = Callable[[float], None]


def _resample(audio: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if src_sr == dst_sr:
        return audio
    gcd = int(np.gcd(src_sr, dst_sr))
    return resample_poly(audio, dst_sr // gcd, src_sr // gcd, axis=0).astype(np.float32)


def _match_channels(audio: np.ndarray, channels: int) -> np.ndarray:
    if audio.shape[1] == channels:
        return audio
    if channels == 1:
        return audio.mean(axis=1, keepdims=True)
    return np.repeat(audio.mean(axis=1, keepdims=True), channels, axis=1)


def _to_stereo(audio: np.ndarray) -> np.ndarray:
    if audio.shape[1] == 2:
        return audio
    return np.repeat(audio.mean(axis=1, keepdims=True), 2, axis=1)


def _finish(stems: dict[str, np.ndarray], wanted: int, like: np.ndarray, sr_in: int, sr: int):
    """Collapse to the requested stem set and conform each stem to the input's shape."""
    names = STEM_NAMES[wanted]
    if wanted == 2 and "instrumental" not in stems:
        rest = [value for key, value in stems.items() if key != "vocals"]
        stems = {"vocals": stems["vocals"], "instrumental": np.sum(rest, axis=0)}
    missing = [name for name in names if name not in stems]
    if missing:
        raise RuntimeError(f"separation engine did not return: {', '.join(missing)}")
    out: dict[str, np.ndarray] = {}
    for name in names:
        stem = _match_channels(_resample(stems[name], sr_in, sr), like.shape[1])
        out[name] = fit_length(stem.astype(np.float32, copy=False), like.shape[0])
    return out


# --------------------------------------------------------------------------- basic-hpss


def _band(freqs: np.ndarray, low: float, high: float, width: float = 0.35) -> np.ndarray:
    """Smooth band-pass weight in 0..1 with log-frequency edges."""
    logf = np.log2(np.maximum(freqs, 1.0))
    rise = 1.0 / (1.0 + np.exp(-(logf - np.log2(low)) / width))
    fall = 1.0 / (1.0 + np.exp((logf - np.log2(high)) / width))
    return (rise * fall).astype(np.float32)


def _hpss_chunk(chunk: np.ndarray, sr: int) -> np.ndarray:
    import librosa

    n_fft, hop = 2048, 512
    channels = range(chunk.shape[1])
    specs = [librosa.stft(chunk[:, ch], n_fft=n_fft, hop_length=hop) for ch in channels]
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    low = (1.0 - _band(freqs, 160.0, 1e9, width=0.25))[:, None]
    vocal_band = _band(freqs, 180.0, 7000.0)[:, None]
    if len(specs) == 2:
        left, right = specs
        power = np.abs(left) ** 2 + np.abs(right) ** 2 + 1e-12
        # 1.0 where both channels carry the same signal (centre-panned), 0.0 when unrelated.
        centre = np.clip(2.0 * np.real(left * np.conj(right)) / power, 0.0, 1.0) ** 2
    else:
        centre = np.full(specs[0].shape, 0.5, dtype=np.float32)
    vocal_share = centre * vocal_band
    stems = np.zeros((4, chunk.shape[0], chunk.shape[1]), dtype=np.float32)
    for ch, spec in enumerate(specs):
        harmonic, percussive = librosa.decompose.hpss(np.abs(spec), mask=True)
        masks = (
            harmonic * (1.0 - low) * vocal_share,  # vocals
            percussive * (1.0 - 0.5 * low),  # drums (kick shares the low end with bass)
            harmonic * low + percussive * 0.5 * low,  # bass
            harmonic * (1.0 - low) * (1.0 - vocal_share),  # other
        )
        for index, mask in enumerate(masks):
            stems[index, :, ch] = librosa.istft(
                spec * mask, hop_length=hop, n_fft=n_fft, length=chunk.shape[0]
            )
    return stems


def _basic_hpss(audio: np.ndarray, sr: int, wanted: int, progress: Progress):
    if wanted not in (2, 4):
        raise EditorError(
            "6-stem separation needs an AI engine (install the editor-ai extra); "
            "the built-in separator supports 2 or 4 stems."
        )
    stacked = process_chunked(audio, sr, lambda chunk: _hpss_chunk(chunk, sr), progress=progress)
    stems = dict(zip(STEM_NAMES[4], stacked, strict=True))
    return _finish(stems, wanted, audio, sr, sr)


# --------------------------------------------------------------------------- demucs


def _demucs(audio: np.ndarray, sr: int, wanted: int, progress: Progress):
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    model = get_model("htdemucs_6s" if wanted == 6 else "htdemucs")
    model.eval()
    model_sr = int(model.samplerate)
    progress(0.1)
    mix = torch.from_numpy(np.ascontiguousarray(_resample(_to_stereo(audio), sr, model_sr).T))
    ref = mix.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    devices = list(dict.fromkeys([engines.torch_device(), "cpu"]))
    for device in devices:
        try:
            with torch.no_grad():
                out = apply_model(
                    model, ((mix - mean) / std)[None], device=device, split=True, overlap=0.25
                )[0]
            break
        except Exception:
            if device == devices[-1]:
                raise
            logger.warning("Demucs failed on %s; retrying on CPU.", device)
    progress(0.9)
    out = (out * std + mean).cpu().numpy()
    stems = {name: out[index].T for index, name in enumerate(model.sources)}
    return _finish(stems, wanted, audio, model_sr, sr)


# --------------------------------------------------------------------------- audio-separator


def _audio_separator(audio: np.ndarray, sr: int, wanted: int, progress: Progress):
    from audio_separator.separator import Separator

    models_dir = projects.SETTINGS.data_dir.resolve() / "models" / "audio-separator"
    models_dir.mkdir(parents=True, exist_ok=True)
    # The library rescales loud mixes; feed it a safely quiet copy and undo the gain after.
    peak = float(np.max(np.abs(audio)))
    scale = 0.8 / peak if peak > 0.8 else 1.0
    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        src = Path(tmp) / "mix.wav"
        sf.write(str(src), _to_stereo(audio) * np.float32(scale), sr, subtype="FLOAT")
        separator = Separator(
            log_level=logging.WARNING,
            model_file_dir=str(models_dir),
            output_dir=tmp,
            output_format="WAV",
            normalization_threshold=1.0,
        )
        separator.load_model(model_filename=_SEPARATOR_MODELS[wanted])
        progress(0.2)
        files = separator.separate(str(src))
        progress(0.9)
        stems: dict[str, np.ndarray] = {}
        out_sr = sr
        for item in files:
            found = _STEM_IN_FILENAME.findall(Path(item).name)
            if not found:
                continue
            produced = Path(tmp) / Path(item).name
            data, out_sr = sf.read(str(produced), dtype="float32", always_2d=True)
            stems[found[-1].strip().lower()] = data / np.float32(scale)
    return _finish(stems, wanted, audio, int(out_sr), sr)


_IMPL = {"audio-separator": _audio_separator, "demucs": _demucs, "basic-hpss": _basic_hpss}


def separate(
    audio: np.ndarray, sample_rate: int, stems: int = 4, progress: Progress | None = None
) -> tuple[dict[str, np.ndarray], str]:
    """Split ``(frames, channels)`` audio into named stems. Returns ``(stems, engine)``."""
    if stems not in STEM_NAMES:
        raise EditorError("Stems must be 2, 4 or 6.")
    require_min_length(audio)
    report = progress or (lambda _fraction: None)
    candidates = engines.separation_engines()
    for name in candidates:
        try:
            return _IMPL[name](audio, sample_rate, stems, report), name
        except EditorError:
            raise
        except Exception:
            if name == candidates[-1]:
                raise
            logger.warning("Separation engine %s failed; trying the next one.", name, exc_info=True)
    raise EditorError("No separation engine is available.")
