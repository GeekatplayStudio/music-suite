"""Stem separation with the best engine available and an always-present fallback.

Preference: ``audio-separator`` (BS-RoFormer / htdemucs), then ``demucs``, then the
built-in ``basic-hpss`` (HPSS plus mid/side centre extraction; approximate, 2 or 4
stems). Every stem has exactly the input's length, sample rate and channel count.

With ``audio-separator`` installed, two finer passes can follow (or run on a stem on
its own): drums into kit pieces (MDX23C DrumSep) and vocals into lead and backing
(Mel-RoFormer Karaoke). A full split is then up to 12 stems.
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
DRUMSEP_MODEL = "MDX23C-DrumSep-aufr33-jarredou.ckpt"
KARAOKE_MODEL = "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt"
# DrumSep's outputs, in kit order, with the names the tracks get.
DRUM_PIECES = {
    "kick": "kick",
    "snare": "snare",
    "toms": "toms",
    "hh": "hi-hat",
    "ride": "ride",
    "crash": "crash",
}
LEAD, BACKING = "lead vocals", "backing vocals"
PARTS = ("mix", "drums", "vocals")
NEEDS_PACK = (
    "Splitting drums into kit pieces and vocals into lead and backing needs AI stem "
    "separation. Install it from Models & engines."
)
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


def _run_separator(
    audio: np.ndarray, sr: int, model: str, progress: Progress
) -> tuple[dict[str, np.ndarray], int]:
    """Run one audio-separator model; returns its stems by lower-case name and their rate."""
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
        separator.load_model(model_filename=model)
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
    return stems, int(out_sr)


def _audio_separator(audio: np.ndarray, sr: int, wanted: int, progress: Progress):
    stems, out_sr = _run_separator(audio, sr, _SEPARATOR_MODELS[wanted], progress)
    return _finish(stems, wanted, audio, out_sr, sr)


def _conform(stem: np.ndarray, sr_in: int, sr: int, like: np.ndarray) -> np.ndarray:
    stem = _match_channels(_resample(stem, sr_in, sr), like.shape[1])
    return fit_length(stem.astype(np.float32, copy=False), like.shape[0])


def drum_kit(drums: np.ndarray, sr: int, progress: Progress) -> dict[str, np.ndarray]:
    """A drum stem split into kick, snare, toms, hi-hat, ride and crash."""
    stems, out_sr = _run_separator(drums, sr, DRUMSEP_MODEL, progress)
    missing = [name for name in DRUM_PIECES if name not in stems]
    if missing:
        raise RuntimeError(f"DrumSep did not return: {', '.join(missing)}")
    return {label: _conform(stems[name], out_sr, sr, drums) for name, label in DRUM_PIECES.items()}


def lead_backing(vocals: np.ndarray, sr: int, progress: Progress) -> dict[str, np.ndarray]:
    """A vocal stem split into the lead voice and everything behind it."""
    stems, out_sr = _run_separator(vocals, sr, KARAOKE_MODEL, progress)
    if "vocals" not in stems or "instrumental" not in stems:
        raise RuntimeError("The karaoke model did not return vocals and instrumental.")
    return {
        LEAD: _conform(stems["vocals"], out_sr, sr, vocals),
        BACKING: _conform(stems["instrumental"], out_sr, sr, vocals),
    }


def detail_available() -> bool:
    return "audio-separator" in engines.separation_engines()


_IMPL = {"audio-separator": _audio_separator, "demucs": _demucs, "basic-hpss": _basic_hpss}


def _span(report: Progress, start: float, end: float) -> Progress:
    return lambda fraction: report(start + (end - start) * min(1.0, max(0.0, fraction)))


def _replace(
    stems: dict[str, np.ndarray], key: str, parts: dict[str, np.ndarray]
) -> dict[str, np.ndarray]:
    """``stems`` with ``key`` swapped for ``parts`` at the same position."""
    out: dict[str, np.ndarray] = {}
    for name, value in stems.items():
        if name == key:
            out.update(parts)
        else:
            out[name] = value
    return out


def separate(
    audio: np.ndarray,
    sample_rate: int,
    stems: int = 4,
    progress: Progress | None = None,
    *,
    drum_kit_pass: bool = False,
    lead_backing_pass: bool = False,
    part: str = "mix",
) -> tuple[dict[str, np.ndarray], str]:
    """Split ``(frames, channels)`` audio into named stems. Returns ``(stems, engine)``.

    ``part`` "drums" or "vocals" treats the audio as that stem already and only runs the
    finer pass on it. Otherwise ``drum_kit_pass`` and ``lead_backing_pass`` follow the
    main split.
    """
    if part not in PARTS:
        raise EditorError("Part must be mix, drums or vocals.")
    if stems not in STEM_NAMES:
        raise EditorError("Stems must be 2, 4 or 6.")
    if drum_kit_pass and stems == 2 and part == "mix":
        raise EditorError("Drum pieces need a 4- or 6-stem split (2 stems has no drum stem).")
    require_min_length(audio)
    report = progress or (lambda _fraction: None)
    finer = part != "mix" or drum_kit_pass or lead_backing_pass
    if finer and not detail_available():
        raise EditorError(NEEDS_PACK)
    if part == "drums":
        return drum_kit(audio, sample_rate, report), "audio-separator (DrumSep)"
    if part == "vocals":
        return lead_backing(audio, sample_rate, report), "audio-separator (Karaoke)"

    passes = int(drum_kit_pass) + int(lead_backing_pass)
    main_end = 1.0 if passes == 0 else 0.55
    result, engine = _separate_main(audio, sample_rate, stems, _span(report, 0.0, main_end))
    step = (1.0 - main_end) / max(1, passes)
    at = main_end
    if drum_kit_pass:
        result = _replace(
            result, "drums", drum_kit(result["drums"], sample_rate, _span(report, at, at + step))
        )
        engine += " + DrumSep"
        at += step
    if lead_backing_pass:
        result = _replace(
            result,
            "vocals",
            lead_backing(result["vocals"], sample_rate, _span(report, at, at + step)),
        )
        engine += " + Karaoke"
    return result, engine


def _separate_main(
    audio: np.ndarray, sample_rate: int, stems: int, report: Progress
) -> tuple[dict[str, np.ndarray], str]:
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
