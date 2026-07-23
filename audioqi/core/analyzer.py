from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from audioqi.core.charts import (
    build_correlation_meter,
    build_loudness_figure,
    build_ms_view,
    build_spectrogram_heatmap,
    build_spectrum_figure,
    build_stereo_figure,
    build_vectorscope,
    build_waveform_figure,
)
from audioqi.core.markers import (
    dc_offset_marker,
    harshness_markers,
    loudness_dip_markers,
    mono_compat_markers,
    sibilance_markers,
    sub_bass_markers,
    true_peak_risk_markers,
)
from audioqi.core.metrics import (
    clipping_segments,
    crest_factor_db,
    dbfs,
    distortion_proxies,
    envelope_timeline,
    loudness_integrated_lufs,
    loudness_timeline_lufs,
    noise_floor_dbfs,
    oversampled_true_peak,
    peak,
    rms,
    spectral_balance,
    spectrum_curve,
    stereo_timelines,
)
from audioqi.core.spectrograms import spectrogram_suite
from audioqi.io.decode import decode_to_canonical
from audioqi.io.metadata import extract_metadata
from audioqi.storage import write_json

ProgressCallback = Callable[[float, str, str | None], None]


@dataclass(frozen=True)
class AnalysisOutput:
    metadata: dict[str, Any]
    metrics: dict[str, Any]
    markers: list[dict[str, Any]]
    charts: dict[str, dict[str, Any]]
    metadata_path: Path
    metrics_path: Path
    charts_path: Path
    canonical_wav_path: Path


def analyze_audio_file(
    input_path: Path,
    run_dir: Path,
    target_sr: int = 48_000,
    chunk_seconds: float = 10.0,
    progress: ProgressCallback | None = None,
    use_gpu: bool = False,
    ffmpeg_timeout_seconds: int | None = None,
) -> AnalysisOutput:
    def update(value: float, stage: str, detail: str | None = None) -> None:
        if progress:
            progress(value, stage, detail)

    canonical_path = run_dir / "canonical.wav"
    metadata_path = run_dir / "metadata.json"
    metrics_path = run_dir / "metrics.json"
    charts_path = run_dir / "charts.json"
    memmap_path = run_dir / "audio.f32"

    update(2.0, "metadata")
    metadata = extract_metadata(input_path)
    write_json(metadata_path, metadata)

    update(10.0, "decode")
    decode_to_canonical(
        input_path=input_path,
        output_wav_path=canonical_path,
        target_sr=target_sr,
        ffmpeg_timeout_seconds=ffmpeg_timeout_seconds,
    )

    update(15.0, "scan")
    scan = _scan_to_memmap(
        canonical_wav_path=canonical_path,
        memmap_path=memmap_path,
        chunk_seconds=chunk_seconds,
        progress=progress,
    )

    sr = scan["sample_rate"]
    channels = scan["channels"]
    frames = scan["frames"]
    duration = frames / sr
    audio = np.memmap(memmap_path, dtype=np.float32, mode="r", shape=(frames, channels))

    mono = np.mean(audio, axis=1)

    if mono.shape[0] < 4096:
        pad_len = 4096 - mono.shape[0]
        mono = np.pad(mono, (0, pad_len), mode="constant")
        audio = np.pad(audio, ((0, pad_len), (0, 0)), mode="constant")


    update(55.0, "dynamics")
    sample_peak = peak(audio)
    rms_value = rms(audio)
    integrated_lufs = loudness_integrated_lufs(signal=audio, sr=sr)
    momentary = loudness_timeline_lufs(
        signal=audio,
        sr=sr,
        window_seconds=0.4,
        hop_seconds=max(0.1, duration / 2500),
    )
    short_term = loudness_timeline_lufs(
        signal=audio,
        sr=sr,
        window_seconds=3.0,
        hop_seconds=max(0.5, duration / 1600),
    )
    env = envelope_timeline(signal=mono, sr=sr, window_seconds=0.05, hop_seconds=0.025)
    clipping = clipping_segments(signal=audio, sr=sr)
    true_peak_value = oversampled_true_peak(signal=audio, sr=sr, upsample_factor=4)
    stereo = stereo_timelines(audio, sr=sr, window_seconds=1.0, hop_seconds=0.5)
    noise_floor = noise_floor_dbfs(mono, sr=sr)
    spectral = spectral_balance(mono, sr=sr)
    spectrum = spectrum_curve(mono, sr=sr)
    distortion = distortion_proxies(mono, sr=sr)
    sibilance = _sibilance_ratio_timeline(mono, sr=sr, window_seconds=0.5, hop_seconds=0.5)
    harshness = _band_ratio_timeline(
        signal=mono,
        sr=sr,
        low_hz=3000.0,
        high_hz=9000.0,
        window_seconds=0.5,
        hop_seconds=0.5,
    )
    sub_bass = _band_ratio_timeline(
        signal=mono,
        sr=sr,
        low_hz=20.0,
        high_hz=80.0,
        window_seconds=0.5,
        hop_seconds=0.5,
    )

    lra = _approx_lra(short_term.values)
    dc_offset = float(np.mean(audio))
    crest_db = crest_factor_db(mono)
    clipping_ratio = _clipping_ratio(audio)
    bandwidth = _estimate_content_bandwidth(spectrum["freq_hz"], spectrum["db"])
    compression = _compression_insights(
        metadata=metadata,
        sample_rate=sr,
        estimated_high_hz=bandwidth["high_hz"],
    )
    dynamic_insights = _dynamic_range_insights(
        sample_peak=sample_peak,
        true_peak=true_peak_value,
        integrated_lufs=integrated_lufs,
        noise_floor_dbfs=noise_floor,
        crest_factor_db=crest_db,
        lra=lra,
    )

    update(72.0, "markers")
    markers: list[dict[str, Any]] = []
    markers.extend(clipping)
    markers.extend(loudness_dip_markers(short_term.times, short_term.values, integrated_lufs))
    markers.extend(mono_compat_markers(stereo["times"], stereo["correlation"]))
    markers.extend(sibilance_markers(sibilance["times"], sibilance["ratio"]))
    markers.extend(true_peak_risk_markers(env["times"], env["peak_dbfs"]))
    markers.extend(harshness_markers(harshness["times"], harshness["ratio"]))
    markers.extend(sub_bass_markers(sub_bass["times"], sub_bass["ratio"]))
    markers.extend(dc_offset_marker(dc_offset, duration))
    markers = _sorted_markers(markers)

    marker_types = {str(m.get("type")) for m in markers}
    warnings = _warnings_from_markers(markers=markers, dc_offset=dc_offset)
    recommendations = _mastering_recommendations(
        integrated_lufs=integrated_lufs,
        true_peak_dbfs=dbfs(true_peak_value),
        crest_db=crest_db,
        lra=lra,
        clipping_ratio=clipping_ratio,
        dc_offset=dc_offset,
        spectral=spectral,
        marker_types=marker_types,
    )
    ai_mastering_advice = _ai_mastering_advice(
        integrated_lufs=integrated_lufs,
        true_peak_dbfs=dbfs(true_peak_value),
        crest_db=crest_db,
        lra=lra,
        clipping_ratio=clipping_ratio,
        spectral=spectral,
        marker_types=marker_types,
        compression_type=str(compression.get("compression_type") or "unknown"),
    )

    update(78.0, "spectrograms", "Preparing spectrogram input.")
    spec_input, spec_sr = _spectrogram_input(mono, sr)
    backend_mode = "cpu"
    spec_data = spectrogram_suite(
        spec_input,
        spec_sr,
        progress=lambda value, detail: update(value, "spectrograms", detail),
    )
    if use_gpu:
        try:
            from audioqi.gpu.spectrogram import gpu_spectrogram_suite

            update(85.7, "spectrograms", "Computing GPU spectrogram refinements.")
            gpu_specs = gpu_spectrogram_suite(spec_input, spec_sr)
            spec_data.update(gpu_specs)
            backend_mode = "gpu+cpu"
        except Exception:
            backend_mode = "cpu_fallback"
            update(85.7, "spectrograms", "GPU spectrogram path unavailable; continuing on CPU.")
    update(85.9, "spectrograms", "Finalizing spectrogram payloads.")
    _cap_spectrogram_payloads(
        spec_data,
        max_freq_bins=512,
        max_time_bins=1400,
    )

    update(86.0, "charts")
    waveform_times, waveform_preview = _waveform_preview(mono=mono, sr=sr)
    figures = _build_charts(
        waveform_times=waveform_times,
        waveform_preview=waveform_preview,
        envelope=env,
        momentary=momentary,
        short_term=short_term,
        integrated_lufs=integrated_lufs,
        spectrum=spectrum,
        stereo=stereo,
        spec_data=spec_data,
        audio=audio,
    )
    chart_payloads = {
        name: _slim_chart_payload(fig.to_plotly_json())
        for name, fig in figures.items()
    }

    metrics = {
        "technical": {
            "sample_rate": sr,
            "channels": channels,
            "frames": frames,
            "duration_seconds": duration,
            "dc_offset": dc_offset,
        },
        "loudness": {
            "integrated_lufs": integrated_lufs,
            "lra_approx": lra,
            "momentary": {"times": momentary.times, "values": momentary.values},
            "short_term": {"times": short_term.times, "values": short_term.values},
        },
        "dynamics": {
            "sample_peak": sample_peak,
            "sample_peak_dbfs": dbfs(sample_peak),
            "true_peak_estimate": true_peak_value,
            "true_peak_dbfs": dbfs(true_peak_value),
            "rms": rms_value,
            "rms_dbfs": dbfs(rms_value),
            "crest_factor_db": crest_db,
        },
        "stereo": stereo,
        "noise_floor_dbfs": noise_floor,
        "clipping": {
            "ratio": clipping_ratio,
            "segments": clipping,
        },
        "distortion_proxy": distortion,
        "spectral_balance": spectral,
        "spectrum_curve": spectrum,
        "sibilance": sibilance,
        "harshness": harshness,
        "sub_bass": sub_bass,
        "file_insights": {
            "human_hearing_reference_hz": {"low_hz": 20.0, "high_hz": 20_000.0},
            "file_nyquist_hz": float(sr / 2.0),
            "theoretical_usable_range_hz": {
                "low_hz": 20.0,
                "high_hz": float(min(sr / 2.0, 20_000.0)),
            },
            "estimated_content_range_hz": bandwidth,
            "compression": compression,
            "dynamic_range": dynamic_insights,
        },
        "warnings": warnings,
        "markers": markers,
        "mastering_recommendations": recommendations,
        "ai_mastering_advice": ai_mastering_advice,
        "backend": {"gpu_enabled": use_gpu, "analysis_mode": backend_mode},
    }

    write_json(metrics_path, metrics)
    write_json(charts_path, chart_payloads)
    charts_dir = run_dir / "charts"
    charts_dir.mkdir(parents=True, exist_ok=True)
    for stale_chart in charts_dir.glob("*.json"):
        try:
            stale_chart.unlink()
        except OSError:
            continue
    for chart_name, chart_payload in chart_payloads.items():
        write_json(charts_dir / f"{chart_name}.json", chart_payload)

    update(95.0, "finalize")
    return AnalysisOutput(
        metadata=metadata,
        metrics=metrics,
        markers=markers,
        charts=chart_payloads,
        metadata_path=metadata_path,
        metrics_path=metrics_path,
        charts_path=charts_path,
        canonical_wav_path=canonical_path,
    )


def _cap_spectrogram_payloads(
    spec_data: dict[str, dict[str, Any]],
    max_freq_bins: int,
    max_time_bins: int,
) -> None:
    def maybe_2d_float_array(value: Any) -> np.ndarray | None:
        try:
            arr = np.asarray(value, dtype=np.float32)
        except Exception:
            return None
        if arr.ndim != 2 or arr.shape[0] < 2 or arr.shape[1] < 2:
            return None
        return arr

    for payload in spec_data.values():
        if not isinstance(payload, dict):
            continue
        z_arr = maybe_2d_float_array(payload.get("z"))
        if z_arr is None:
            continue
        x_arr = np.asarray(payload.get("x", []), dtype=np.float64)
        y_arr = np.asarray(payload.get("y", []), dtype=np.float64)

        freq_step = max(1, z_arr.shape[0] // max(1, int(max_freq_bins)))
        time_step = max(1, z_arr.shape[1] // max(1, int(max_time_bins)))
        z_comp = z_arr[::freq_step, ::time_step]

        x_comp = x_arr[::time_step] if x_arr.ndim == 1 and x_arr.size >= z_arr.shape[1] else x_arr
        y_comp = y_arr[::freq_step] if y_arr.ndim == 1 and y_arr.size >= z_arr.shape[0] else y_arr
        if x_comp.ndim == 1 and x_comp.size > z_comp.shape[1]:
            x_comp = x_comp[: z_comp.shape[1]]
        if y_comp.ndim == 1 and y_comp.size > z_comp.shape[0]:
            y_comp = y_comp[: z_comp.shape[0]]

        payload["z"] = np.round(z_comp, 2).astype(float).tolist()
        payload["x"] = np.round(x_comp, 4).astype(float).tolist() if x_comp.ndim == 1 else []
        payload["y"] = np.round(y_comp, 4).astype(float).tolist() if y_comp.ndim == 1 else []


def _scan_to_memmap(
    canonical_wav_path: Path,
    memmap_path: Path,
    chunk_seconds: float,
    progress: ProgressCallback | None = None,
) -> dict[str, int]:
    with sf.SoundFile(str(canonical_wav_path), mode="r") as snd:
        sr = int(snd.samplerate)
        channels = int(snd.channels)
        frames = int(snd.frames)
        block_size = max(1, int(chunk_seconds * sr))
        mm = np.memmap(memmap_path, dtype=np.float32, mode="w+", shape=(frames, channels))
        idx = 0
        no_progress_reads = 0
        while idx < frames:
            previous_idx = idx
            block = snd.read(frames=min(block_size, frames - idx), dtype="float32", always_2d=True)
            if block.size == 0:
                no_progress_reads += 1
                if no_progress_reads >= 3:
                    raise RuntimeError(
                        "Audio scan stalled: decoder returned repeated empty blocks."
                    )
                break
            mm[idx : idx + block.shape[0], :] = block
            idx += block.shape[0]
            if idx <= previous_idx:
                no_progress_reads += 1
                if no_progress_reads >= 3:
                    raise RuntimeError("Audio scan stalled: frame cursor did not advance.")
            else:
                no_progress_reads = 0
            if progress:
                pct = 15.0 + 35.0 * (idx / max(frames, 1))
                progress(pct, "scan", None)
        mm.flush()
    return {"sample_rate": sr, "channels": channels, "frames": frames}


def _waveform_preview(
    mono: np.ndarray,
    sr: int,
    max_points: int = 60_000,
) -> tuple[list[float], list[float]]:
    if mono.size <= max_points:
        indices = np.arange(mono.size)
    else:
        step = math.ceil(mono.size / max_points)
        indices = np.arange(0, mono.size, step)
    times = (indices / sr).astype(float).tolist()
    values = mono[indices].astype(float).tolist()
    return times, values


def _slim_chart_payload(payload: dict[str, Any]) -> dict[str, Any]:
    layout = payload.get("layout")
    if isinstance(layout, dict):
        # Plotly embeds a large default template in JSON payloads; remove it to reduce transfer size.
        layout.pop("template", None)
    return payload


def _build_charts(
    waveform_times: list[float],
    waveform_preview: list[float],
    envelope: dict[str, list[float]],
    momentary: Any,
    short_term: Any,
    integrated_lufs: float,
    spectrum: dict[str, list[float]],
    stereo: dict[str, list[float]],
    spec_data: dict[str, dict[str, Any]],
    audio: np.ndarray,
) -> dict[str, Any]:
    left = audio[:, 0]
    right = audio[:, 1] if audio.shape[1] > 1 else audio[:, 0]

    charts = {
        "waveform": build_waveform_figure(
            times=waveform_times,
            waveform=waveform_preview,
            envelope_peak_dbfs=envelope["peak_dbfs"],
            envelope_rms_dbfs=envelope["rms_dbfs"],
            envelope_times=envelope["times"],
        ),
        "loudness": build_loudness_figure(
            momentary_times=momentary.times,
            momentary_values=momentary.values,
            short_times=short_term.times,
            short_values=short_term.values,
            integrated_lufs=integrated_lufs,
        ),
        "spectrum": build_spectrum_figure(freq_hz=spectrum["freq_hz"], spectrum_db=spectrum["db"]),
        "stereo": build_stereo_figure(
            times=stereo["times"],
            correlation=stereo["correlation"],
            ms_ratio_db=stereo["ms_ratio_db"],
        ),
        "correlation_meter": build_correlation_meter(
            times=stereo["times"],
            correlation=stereo["correlation"],
        ),
        "ms_view": build_ms_view(
            times=stereo["times"],
            ms_ratio_db=stereo["ms_ratio_db"],
            lr_balance_db=stereo["lr_balance_db"],
        ),
        "vectorscope": build_vectorscope(left=left, right=right),
        "spectrogram_stft_linear": build_spectrogram_heatmap(
            spec_data["stft_linear"],
            "STFT Spectrogram (Linear)",
        ),
        "spectrogram_stft_log": build_spectrogram_heatmap(
            spec_data["stft_log"],
            "STFT Spectrogram (Log Frequency)",
        ),
        "spectrogram_mel": build_spectrogram_heatmap(spec_data["mel"], "Mel Spectrogram"),
        "spectrogram_cqt": build_spectrogram_heatmap(spec_data["cqt"], "CQT Spectrogram"),
    }
    return charts


def _approx_lra(short_term_lufs: list[float]) -> float:
    values = np.asarray([v for v in short_term_lufs if np.isfinite(v)], dtype=np.float64)
    if values.size == 0:
        return 0.0
    return float(np.percentile(values, 95) - np.percentile(values, 10))


def _clipping_ratio(audio: np.ndarray, threshold: float = 0.999) -> float:
    clipped = np.count_nonzero(np.abs(audio) >= threshold)
    return float(clipped / max(audio.size, 1))


def _spectrogram_input(
    mono: np.ndarray,
    sr: int,
    max_seconds: int = 180,
    max_sr: int = 24_000,
) -> tuple[np.ndarray, int]:
    signal = mono.astype(np.float32, copy=False)
    effective_sr = int(sr)

    if effective_sr > max_sr:
        sr_step = max(1, math.ceil(effective_sr / max_sr))
        signal = signal[::sr_step]
        effective_sr = max(1, effective_sr // sr_step)

    max_samples = effective_sr * max_seconds
    if signal.size > max_samples:
        time_step = max(1, math.ceil(signal.size / max_samples))
        signal = signal[::time_step]
        effective_sr = max(1, effective_sr // time_step)

    return signal.astype(np.float32, copy=False), effective_sr


def _warnings_from_markers(markers: list[dict[str, Any]], dc_offset: float) -> list[str]:
    warnings: list[str] = []
    marker_types = {m.get("type") for m in markers}
    if "clipping" in marker_types:
        warnings.append("Clipping detected.")
    if abs(dc_offset) > 0.01:
        warnings.append("DC offset exceeds 0.01 FS.")
    if "mono_incompatibility" in marker_types:
        warnings.append("Mono compatibility risk (negative correlation sections).")
    if "sibilance" in marker_types:
        warnings.append("Potential excessive sibilance (6k-10k band).")
    if "harshness_band" in marker_types:
        warnings.append("Harsh upper-mid/high band energy detected (3k-9k).")
    if "sub_bass_heavy" in marker_types:
        warnings.append("Sub-bass dominance detected in sections (20-80 Hz).")
    if "true_peak_risk" in marker_types:
        warnings.append("True-peak safety risk detected near 0 dBFS.")
    if "loudness_dip" in marker_types:
        warnings.append("Loudness dips detected.")
    seen: set[str] = set()
    deduped: list[str] = []
    for warning in warnings:
        if warning in seen:
            continue
        seen.add(warning)
        deduped.append(warning)
    return deduped


def _sibilance_ratio_timeline(
    signal: np.ndarray,
    sr: int,
    window_seconds: float = 0.5,
    hop_seconds: float = 0.5,
) -> dict[str, list[float]]:
    return _band_ratio_timeline(
        signal=signal,
        sr=sr,
        low_hz=6000.0,
        high_hz=10000.0,
        window_seconds=window_seconds,
        hop_seconds=hop_seconds,
    )


def _band_ratio_timeline(
    signal: np.ndarray,
    sr: int,
    low_hz: float,
    high_hz: float,
    window_seconds: float,
    hop_seconds: float,
) -> dict[str, list[float]]:
    window = max(1, int(window_seconds * sr))
    hop = max(1, int(hop_seconds * sr))
    times: list[float] = []
    ratios: list[float] = []
    for start in range(0, max(1, signal.shape[0] - window), hop):
        chunk = signal[start : start + window]
        if chunk.shape[0] < window:
            break
        spectrum = np.abs(np.fft.rfft(chunk)) ** 2
        freqs = np.fft.rfftfreq(chunk.size, d=1.0 / sr)
        sib = float(np.sum(spectrum[(freqs >= low_hz) & (freqs <= high_hz)]))
        total = float(np.sum(spectrum) + 1e-12)
        ratios.append(sib / total)
        times.append(start / sr)
    return {"times": times, "ratio": ratios}


def _sorted_markers(markers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        markers,
        key=lambda m: (
            float(m.get("start_seconds", 0.0)),
            float(m.get("end_seconds", 0.0)),
            str(m.get("type", "")),
        ),
    )


def _estimate_content_bandwidth(
    freq_hz: list[float],
    spectrum_db: list[float],
    relative_threshold_db: float = 70.0,
) -> dict[str, float]:
    if not freq_hz or not spectrum_db:
        return {"low_hz": 0.0, "high_hz": 0.0, "threshold_db_below_peak": relative_threshold_db}
    freq = np.asarray(freq_hz, dtype=np.float64)
    db = np.asarray(spectrum_db, dtype=np.float64)
    peak_db = float(np.max(db))
    threshold = peak_db - relative_threshold_db
    active = np.where((db >= threshold) & (freq >= 20.0))[0]
    if active.size == 0:
        return {"low_hz": 0.0, "high_hz": 0.0, "threshold_db_below_peak": relative_threshold_db}
    low_hz = float(freq[int(active[0])])
    high_hz = float(freq[int(active[-1])])
    return {"low_hz": low_hz, "high_hz": high_hz, "threshold_db_below_peak": relative_threshold_db}


def _compression_insights(
    metadata: dict[str, Any],
    sample_rate: int,
    estimated_high_hz: float,
) -> dict[str, Any]:
    codec = str(metadata.get("codec") or "").lower()
    container = str(metadata.get("format") or "").lower()

    lossy_codecs = {
        "mp3",
        "aac",
        "vorbis",
        "opus",
        "wmav2",
        "ac3",
        "eac3",
        "mp2",
    }
    lossless_codecs = {"flac", "alac", "pcm_s16le", "pcm_s24le", "pcm_f32le", "wavpack"}

    compression_type = "unknown"
    if codec in lossy_codecs or any(x in container for x in ("mp3", "aac", "ogg", "opus")):
        compression_type = "lossy"
    elif codec in lossless_codecs or any(x in container for x in ("flac", "wav", "aiff", "alac")):
        compression_type = "lossless"

    nyquist = float(sample_rate / 2.0)
    lost_high_hz = max(0.0, nyquist - float(estimated_high_hz))
    lost_high_pct = 100.0 * lost_high_hz / max(nyquist, 1.0)

    if compression_type == "lossless":
        loss_note = "Lossless codec detected; no codec-induced loss expected from compression."
    elif compression_type == "lossy":
        if estimated_high_hz < 16_000.0:
            loss_note = (
                "Likely high-frequency roll-off from lossy compression "
                "(strong cutoff below ~16 kHz)."
            )
        elif estimated_high_hz < 19_000.0:
            loss_note = "Possible mild high-frequency roll-off from lossy compression."
        else:
            loss_note = "Lossy codec detected; frequency retention appears relatively high."
    else:
        loss_note = "Compression type could not be confidently classified."

    return {
        "codec": codec or None,
        "container_format": container or None,
        "compression_type": compression_type,
        "estimated_high_freq_loss_hz": lost_high_hz,
        "estimated_high_freq_loss_percent_of_nyquist": lost_high_pct,
        "assessment": loss_note,
    }


def _dynamic_range_insights(
    sample_peak: float,
    true_peak: float,
    integrated_lufs: float,
    noise_floor_dbfs: float,
    crest_factor_db: float,
    lra: float,
) -> dict[str, float | None]:
    sample_peak_db = dbfs(sample_peak)
    true_peak_db = dbfs(true_peak)
    peak_to_loudness_ratio = None
    if np.isfinite(integrated_lufs):
        peak_to_loudness_ratio = float(true_peak_db - integrated_lufs)

    return {
        "sample_peak_dbfs": sample_peak_db,
        "true_peak_dbfs": true_peak_db,
        "noise_floor_dbfs": float(noise_floor_dbfs),
        "crest_factor_db": float(crest_factor_db),
        "lra_approx_lu": float(lra),
        "peak_to_loudness_ratio_db": peak_to_loudness_ratio,
        "peak_to_noise_span_db": float(sample_peak_db - noise_floor_dbfs),
    }


def _mastering_recommendations(
    integrated_lufs: float,
    true_peak_dbfs: float,
    crest_db: float,
    lra: float,
    clipping_ratio: float,
    dc_offset: float,
    spectral: dict[str, float],
    marker_types: set[str],
) -> list[dict[str, str]]:
    recs: list[dict[str, str]] = []

    def add(priority: str, issue: str, action: str) -> None:
        recs.append({"priority": priority, "issue": issue, "action": action})

    if clipping_ratio > 0:
        add(
            "high",
            "Hard clipping was detected.",
            "Lower limiter/input gain by 1-3 dB before final limiting; "
            "use declip restoration on clipped passages.",
        )

    if true_peak_dbfs > -1.0:
        add(
            "high",
            f"True peak {true_peak_dbfs:.2f} dBFS exceeds -1.0 dBFS safety ceiling.",
            "Set limiter true-peak ceiling to -1.0 dBTP (or -1.2 dBTP for AAC/MP3 delivery).",
        )

    if math.isfinite(integrated_lufs):
        if integrated_lufs > -10.0:
            add(
                "medium",
                f"Integrated loudness is very hot ({integrated_lufs:.2f} LUFS).",
                "Back off bus compression/limiting and target around -14 LUFS "
                "for streaming or your delivery spec.",
            )
        elif integrated_lufs < -18.0:
            add(
                "medium",
                f"Integrated loudness is low ({integrated_lufs:.2f} LUFS).",
                "Raise gain gently and add moderate bus compression to improve "
                "perceived loudness without clipping.",
            )

    if crest_db < 8.0:
        add(
            "medium",
            f"Low crest factor ({crest_db:.2f} dB) suggests over-compression.",
            "Reduce compressor ratio/GR and relax limiter to restore transients.",
        )
    elif crest_db > 18.0:
        add(
            "low",
            f"Very high crest factor ({crest_db:.2f} dB) may feel under-controlled.",
            "Use light bus compression or transient shaping to improve consistency.",
        )

    if lra < 3.0:
        add(
            "low",
            f"Low loudness range ({lra:.2f} LU).",
            "Automate sections and ease broadband compression to recover macro-dynamics.",
        )

    if "mono_incompatibility" in marker_types:
        add(
            "high",
            "Mono compatibility issues were detected.",
            "Reduce out-of-phase side content and mono the low end (below ~120 Hz).",
        )

    if "sibilance" in marker_types:
        add(
            "medium",
            "Sibilance-heavy regions detected (6k-10k).",
            "Apply dynamic EQ or de-esser in 6k-10k range, typically -2 to -5 dB on hotspots.",
        )

    if "harshness_band" in marker_types:
        add(
            "medium",
            "Harsh 3k-9k regions detected.",
            "Use dynamic EQ/notching around 3k-6k and 7k-9k where resonance is strongest.",
        )

    if "sub_bass_heavy" in marker_types:
        add(
            "medium",
            "Sub-bass heavy sections detected.",
            "Tighten 20-80 Hz with high-pass filtering and dynamic low-shelf control.",
        )

    if spectral.get("air_10k_20k", 0.0) < 0.04:
        add(
            "low",
            "Top-end air appears limited.",
            "Consider gentle high-shelf boost around 10-16 kHz if material sounds dull.",
        )

    if spectral.get("sub_20_60", 0.0) > 0.18:
        add(
            "low",
            "Very high sub (20-60 Hz) energy share.",
            "Control sub with multiband compression or low-shelf EQ to preserve headroom.",
        )

    if abs(dc_offset) > 0.01:
        add(
            "medium",
            f"DC offset ({dc_offset:+.4f}) exceeds recommended range.",
            "Apply a DC removal filter/high-pass at 20 Hz before mastering.",
        )

    if not recs:
        add(
            "info",
            "No major issues detected.",
            "Use subtle mastering: minor tonal polish, transparent limiting, "
            "and verify final codec exports.",
        )

    return recs


def _ai_mastering_advice(
    integrated_lufs: float,
    true_peak_dbfs: float,
    crest_db: float,
    lra: float,
    clipping_ratio: float,
    spectral: dict[str, float],
    marker_types: set[str],
    compression_type: str,
) -> dict[str, Any]:
    issue_score = 0
    reasons: list[str] = []
    clipping_detected = clipping_ratio > 0
    high_true_peak = true_peak_dbfs > -1.0
    dense_source = crest_db < 9.0
    wide_dynamics = crest_db > 18.0
    low_lra = lra < 4.0
    lossy_source = compression_type == "lossy"

    if clipping_detected:
        issue_score += 3
        reasons.append("Clipping detected; stronger corrective mastering is recommended.")
    if high_true_peak:
        issue_score += 2
        reasons.append(f"True peak is high ({true_peak_dbfs:.2f} dBFS).")
    if "mono_incompatibility" in marker_types:
        issue_score += 2
        reasons.append("Mono-compatibility risk sections were found.")
    if "sibilance" in marker_types:
        issue_score += 1
        reasons.append("Sibilance hotspots were found.")
    if "harshness_band" in marker_types:
        issue_score += 1
        reasons.append("Harsh upper-mid/high frequency regions were found.")
    if "sub_bass_heavy" in marker_types:
        issue_score += 1
        reasons.append("Sub-bass dominance was detected in some sections.")
    if dense_source or wide_dynamics:
        issue_score += 1
        reasons.append(f"Crest factor is outside preferred range ({crest_db:.2f} dB).")
    if low_lra:
        issue_score += 1
        reasons.append("Low loudness range suggests over-compression.")
    if lossy_source:
        issue_score += 1
        reasons.append("Source appears lossy-compressed; prefer conservative restoration steps.")

    fragile_source = dense_source or low_lra or lossy_source or clipping_detected or high_true_peak

    if issue_score >= 5 and not fragile_source:
        mode = "v3"
        reasons.append("V3 selected for strongest corrective/stem-aware strategy on a source that can tolerate heavier correction.")
    elif issue_score >= 4 and not fragile_source:
        mode = "v2"
        reasons.append("V2 selected for optimizer-driven balancing across multiple issues.")
    else:
        mode = "v1"
        if fragile_source:
            reasons.append("V1 selected because the source already looks dense, peak-sensitive, or lossy, so transparent mastering is safer.")
        else:
            reasons.append("V1 selected for transparent, low-risk mastering.")

    sub_share = float(spectral.get("sub_20_60", 0.0) + spectral.get("bass_60_250", 0.0))
    mid_share = float(spectral.get("mid_1k_4k", 0.0))
    if lra >= 8.0 or (math.isfinite(integrated_lufs) and integrated_lufs <= -18.0):
        preset = "film"
        reasons.append("Film preset selected to preserve wider dynamics.")
    elif mid_share > 0.40 and sub_share < 0.26:
        preset = "voice"
        reasons.append("Voice preset selected due to mid-focused spectral profile.")
    elif ("sub_bass_heavy" in marker_types or sub_share > 0.42) and not fragile_source and crest_db >= 9.0:
        preset = "club"
        reasons.append("Club preset selected due to strong low-end energy.")
    else:
        preset = "streaming"
        if "sub_bass_heavy" in marker_types or sub_share > 0.42:
            reasons.append("Streaming preset kept instead of Club because the source is already dense or peak-sensitive.")
        else:
            reasons.append("Streaming preset selected as balanced default.")

    target_lufs_map = {
        "streaming": -14.0,
        "club": -9.5,
        "film": -18.0,
        "voice": -16.0,
    }
    true_peak_map = {
        "streaming": -1.0,
        "club": -0.8,
        "film": -2.0,
        "voice": -1.5,
    }
    target_lufs = float(target_lufs_map[preset])
    true_peak_target = float(true_peak_map[preset])
    if fragile_source:
        true_peak_target = min(true_peak_target, -1.2)
    if clipping_detected or true_peak_dbfs > -0.5:
        true_peak_target = min(true_peak_target, -1.2)

    if mode == "v1":
        optimizer_variants = 2
        recommended_refine_passes = 1 if fragile_source else 2
    elif mode == "v2":
        optimizer_variants = int(max(3, min(4, 2 + math.ceil(issue_score / 3))))
        recommended_refine_passes = 2
    else:
        optimizer_variants = int(max(4, min(5, 3 + math.ceil(issue_score / 4))))
        recommended_refine_passes = 2

    if issue_score >= 5 and not fragile_source:
        confidence = "high"
    elif issue_score >= 4:
        confidence = "medium"
    else:
        confidence = "medium"

    return {
        "recommended_mode": mode,
        "recommended_preset": preset,
        "recommended_backend": "internal",
        "recommended_refine_passes": recommended_refine_passes,
        "target_lufs": target_lufs,
        "true_peak_dbfs": true_peak_target,
        "optimizer_variants": optimizer_variants,
        "confidence": confidence,
        "issue_score": issue_score,
        "reasons": reasons,
        "fallback_modes": [
            {"mode": "v1", "when": "Safest default for dense, lossy, or already-loud material."},
            {
                "mode": "v2",
                "when": "Balanced optimization for cleaner sources that still need tonal or dynamic correction.",
            },
            {
                "mode": "v3",
                "when": "Most corrective option for difficult but still recoverable mixes; use only when stronger intervention is justified.",
            },
        ],
    }
