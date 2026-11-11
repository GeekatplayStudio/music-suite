"""Editor processing jobs: validation, persistence and execution.

Job records live in ``<project>/jobs/<job_id>.json``. Work runs on the shared
bounded worker pool (``audioqi.jobs.submit``).
"""

from __future__ import annotations

import logging
import math
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from audioqi import jobs as worker_pool
from audioqi.editor import (
    analysis,
    assets,
    composition,
    engines,
    generation,
    plugins,
    processing,
    projects,
    restoration,
    separation,
)
from audioqi.editor.projects import EditorError, NotFoundError, ParamError
from audioqi.generation import service as song_service

logger = logging.getLogger(__name__)

JOB_FIELDS = (
    "id",
    "op",
    "asset_id",
    "status",
    "progress",
    "stage",
    "detail",
    "error",
    "result_assets",
    "result",
    "created_at",
    "updated_at",
)
MAX_PLUGIN_PARAMETERS = 256
MAX_RENDER_NOTES = 20_000
_BASE64_RE = re.compile(r"^[A-Za-z0-9+/]*={0,2}$")
#: Jobs that can start from nothing, so they need no source asset.
ASSETLESS_OPS = frozenset({"generate_song", "render_instrument", "plugin_window"})


# --------------------------------------------------------------------------- validation


def _reject_unknown(params: dict[str, Any], allowed: set[str]) -> None:
    unknown = sorted(set(params) - allowed)
    if unknown:
        raise ParamError(f"Unknown parameter(s): {', '.join(str(key)[:40] for key in unknown)}.")


def _number(
    params: dict[str, Any],
    key: str,
    low: float,
    high: float,
    default: float | None,
    *,
    required: bool = False,
) -> float | None:
    value = params.get(key)
    if value is None:
        if required:
            raise ParamError(f"'{key}' is required.")
        return default
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ParamError(f"'{key}' must be a number.")
    if not low <= value <= high:
        raise ParamError(f"'{key}' must be between {low:g} and {high:g}.")
    return float(min(high, max(low, value)))


def _boolean(params: dict[str, Any], key: str, default: bool) -> bool:
    value = params.get(key, default)
    if not isinstance(value, bool):
        raise ParamError(f"'{key}' must be true or false.")
    return value


def _v_separate(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"stems", "drum_kit", "lead_backing", "part"})
    stems = params.get("stems", 4)
    if isinstance(stems, bool) or stems not in (2, 4, 6):
        raise ParamError("'stems' must be 2, 4 or 6.")
    part = params.get("part", "mix")
    if part not in separation.PARTS:
        raise ParamError("'part' must be mix, drums or vocals.")
    drum_kit = _boolean(params, "drum_kit", False)
    if drum_kit and stems == 2 and part == "mix":
        raise ParamError("Drum pieces need a 4- or 6-stem split.")
    return {
        "stems": int(stems),
        "drum_kit": drum_kit,
        "lead_backing": _boolean(params, "lead_backing", False),
        "part": part,
    }


def _v_stretch(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"rate"})
    return {"rate": _number(params, "rate", 0.25, 4.0, None, required=True)}


def _v_pitch(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"semitones"})
    return {"semitones": _number(params, "semitones", -24.0, 24.0, None, required=True)}


def _v_denoise(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"strength", "noise_start", "noise_end", "mode"})
    limit = projects.SETTINGS.max_audio_duration_seconds * 4.0
    start = _number(params, "noise_start", 0.0, limit, None)
    end = _number(params, "noise_end", 0.0, limit, None)
    if (start is None) != (end is None):
        raise ParamError("'noise_start' and 'noise_end' must be given together.")
    if start is not None and end is not None and end <= start:
        raise ParamError("'noise_end' must be greater than 'noise_start'.")
    mode = params.get("mode", "auto")
    if mode not in ("auto", "spectral", "fft"):
        raise ParamError("'mode' must be 'auto', 'spectral' or 'fft'.")
    return {
        "strength": _number(params, "strength", 0.0, 1.0, 0.6),
        "noise_start": start,
        "noise_end": end,
        "mode": mode,
    }


def _v_normalize(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"target_lufs", "true_peak_dbfs"})
    return {
        "target_lufs": _number(params, "target_lufs", -30.0, -6.0, -14.0),
        "true_peak_dbfs": _number(params, "true_peak_dbfs", -9.0, -0.5, -1.0),
    }


def _v_analyze(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, set())
    return {}


def _v_match(params: dict[str, Any]) -> dict[str, Any]:
    allowed = {"target_bpm", "target_key", "target_asset_id", "match_tempo", "match_key"}
    _reject_unknown(params, allowed | {"match_loudness_lufs"})
    target_key = params.get("target_key")
    if target_key is not None:
        if not isinstance(target_key, str) or len(target_key) > 16:
            raise ParamError("'target_key' must be a key such as 'A minor' or 'C major'.")
        parsed = analysis.parse_key(target_key)
        if parsed is None:
            raise ParamError("'target_key' must be a key such as 'A minor' or 'C major'.")
        target_key = analysis.key_label(*parsed)
    target_asset = params.get("target_asset_id")
    if target_asset is not None and not projects.is_canonical_uuid(target_asset):
        raise ParamError("'target_asset_id' must be a UUID.")
    cleaned = {
        "target_bpm": _number(params, "target_bpm", 40.0, 240.0, None),
        "target_key": target_key,
        "target_asset_id": target_asset,
        "match_tempo": _boolean(params, "match_tempo", True),
        "match_key": _boolean(params, "match_key", True),
        "match_loudness_lufs": _number(params, "match_loudness_lufs", -30.0, -6.0, None),
    }
    wants_tempo = cleaned["match_tempo"] and (cleaned["target_bpm"] or target_asset)
    wants_key = cleaned["match_key"] and (target_key or target_asset)
    if not (wants_tempo or wants_key or cleaned["match_loudness_lufs"] is not None):
        raise ParamError("Nothing to match: give a target tempo, key, asset or loudness.")
    return cleaned


def _v_warp(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"markers"})
    raw = params.get("markers")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 128:
        raise ParamError("'markers' must be a list of 1 to 128 [source, target] pairs.")
    limit = projects.SETTINGS.max_audio_duration_seconds * 4.0
    markers: list[list[float]] = []
    previous = (0.0, 0.0)
    minimum = processing.WARP_MIN_SEGMENT_SECONDS
    for item in raw:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            raise ParamError("Each marker must be a [source, target] pair of seconds.")
        pair = {"source": item[0], "target": item[1]}
        src = _number(pair, "source", 0.0, limit, None, required=True)
        dst = _number(pair, "target", 0.0, limit, None, required=True)
        assert src is not None and dst is not None
        if src - previous[0] < minimum or dst - previous[1] < minimum / 4.0:
            raise ParamError("Markers must be in order and at least 0.1 s apart.")
        rate = (src - previous[0]) / (dst - previous[1])
        if not 0.25 <= rate <= 4.0:
            raise ParamError("A marker was moved too far: each stretch must stay within 0.25x-4x.")
        markers.append([src, dst])
        previous = (src, dst)
    return {"markers": markers}


def _v_quantize(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"bpm"})
    return {"bpm": _number(params, "bpm", 40.0, 240.0, None, required=True)}


def _v_generate(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"prompt", "seconds", "bpm", "model"})
    prompt = params.get("prompt")
    if not isinstance(prompt, str):
        raise ParamError("'prompt' must describe the part to generate.")
    prompt = " ".join("".join(ch for ch in prompt if ch.isprintable()).split())
    if not 3 <= len(prompt) <= 400:
        raise ParamError("'prompt' must be between 3 and 400 characters.")
    model = params.get("model", generation.DEFAULT_MODEL)
    if not isinstance(model, str) or not 0 < len(model) <= 80 or not model.isprintable():
        raise ParamError("'model' must be a model name from the generator's list.")
    return {
        "prompt": prompt,
        "seconds": int(_number(params, "seconds", 2, generation.MAX_SECONDS, 15) or 15),
        "bpm": int(_number(params, "bpm", 60, 200, 120) or 120),
        "model": model,
    }


def _v_plugin(params: dict[str, Any]) -> dict[str, Any]:
    preview_keys = {"preview_start", "preview_seconds"}
    preview = {key: params[key] for key in preview_keys if key in params}
    params = {key: value for key, value in params.items() if key not in preview_keys}
    cleaned = _v_plugin_core(params)
    limit = projects.SETTINGS.max_audio_duration_seconds * 4.0
    cleaned["preview_start"] = _number(preview, "preview_start", 0.0, limit, None)
    cleaned["preview_seconds"] = _number(preview, "preview_seconds", 1.0, 30.0, None)
    return cleaned


def _v_plugin_core(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"plugin_id", "parameters"})
    plugin_id = params.get("plugin_id")
    if not isinstance(plugin_id, str) or not plugins.PLUGIN_ID_RE.match(plugin_id):
        raise ParamError("'plugin_id' must be an id from the plugin list.")
    raw = params.get("parameters", {})
    if not isinstance(raw, dict) or len(raw) > MAX_PLUGIN_PARAMETERS:
        raise ParamError("'parameters' must be an object of numbers.")
    values: dict[str, float] = {}
    for name, value in raw.items():
        if not isinstance(name, str) or not 0 < len(name) <= 128:
            raise ParamError("Plugin parameter names must be short strings.")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ParamError(f"Plugin parameter '{name}' must be a number.")
        if not math.isfinite(value) or abs(value) > 1e9:
            raise ParamError(f"Plugin parameter '{name}' is out of range.")
        values[name] = float(value)
    return {"plugin_id": plugin_id, "parameters": values}


def _plugin_state(params: dict[str, Any]) -> str | None:
    state = params.get("state")
    if state is None or state == "":
        return None
    if not isinstance(state, str) or len(state) > plugins.MAX_STATE_BYTES * 4 // 3 + 4:
        raise ParamError("'state' must be the sound saved from the plugin's window.")
    if len(state) % 4 or not _BASE64_RE.match(state):
        raise ParamError("'state' must be the sound saved from the plugin's window.")
    return state


def _plugin_id(params: dict[str, Any]) -> str:
    plugin_id = params.get("plugin_id")
    if not isinstance(plugin_id, str) or not plugins.PLUGIN_ID_RE.match(plugin_id):
        raise ParamError("'plugin_id' must be an id from the plugin list.")
    return plugin_id


def _v_render_instrument(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"plugin_id", "state", "notes", "seconds", "name", "sample_rate"})
    limit = projects.SETTINGS.max_audio_duration_seconds
    seconds = _number(params, "seconds", 0.1, limit, None, required=True)
    raw = params.get("notes")
    if not isinstance(raw, list) or not raw:
        raise ParamError("'notes' must be a non-empty list of notes.")
    if len(raw) > MAX_RENDER_NOTES:
        raise ParamError(f"A clip can hold at most {MAX_RENDER_NOTES} notes.")
    notes: list[dict[str, float]] = []
    for item in raw:
        if not isinstance(item, dict):
            raise ParamError("Each note must be an object with t, d, p and v.")
        _reject_unknown(item, {"t", "d", "p", "v"})
        start = _number(item, "t", 0.0, limit, None, required=True)
        length = _number(item, "d", 0.001, limit, None, required=True)
        pitch = item.get("p")
        if isinstance(pitch, bool) or not isinstance(pitch, int) or not 0 <= pitch <= 127:
            raise ParamError("Each note's 'p' must be a MIDI pitch from 0 to 127.")
        velocity = _number(item, "v", 0.0, 1.0, 0.8)
        assert start is not None and length is not None and velocity is not None
        if start < (seconds or 0.0):
            notes.append({"t": start, "d": length, "p": pitch, "v": velocity})
    if not notes:
        raise ParamError("Every note starts after the end of the render.")
    name = params.get("name", "Instrument")
    if not isinstance(name, str) or not name.strip() or len(name) > 120:
        raise ParamError("'name' must be a short label.")
    rate = params.get("sample_rate", projects.SETTINGS.sample_rate)
    if rate not in (44100, 48000, 88200, 96000):
        raise ParamError("'sample_rate' must be 44100, 48000, 88200 or 96000.")
    return {
        "plugin_id": _plugin_id(params),
        "state": _plugin_state(params),
        "notes": notes,
        "seconds": seconds,
        "name": name.strip(),
        "sample_rate": int(rate),
    }


def _v_plugin_window(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"plugin_id", "state"})
    return {"plugin_id": _plugin_id(params), "state": _plugin_state(params)}


def _v_declick(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"sensitivity"})
    return {"sensitivity": _number(params, "sensitivity", 0.0, 1.0, 0.5)}


def _v_dehum(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"frequency", "harmonics"})
    frequency = params.get("frequency")
    if frequency is not None and (isinstance(frequency, bool) or frequency not in (50, 60)):
        raise ParamError("'frequency' must be 50, 60 or null for automatic detection.")
    harmonics = _number(params, "harmonics", 1, 12, 6)
    return {
        "frequency": None if frequency is None else float(frequency),
        "harmonics": int(harmonics or 6),
    }


def _v_declip(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"threshold"})
    return {"threshold": _number(params, "threshold", 0.5, 1.0, 0.98)}


def _v_dereverb(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"strength"})
    return {"strength": _number(params, "strength", 0.0, 1.0, 0.5)}


def _v_spectral_repair(params: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(params, {"start", "end", "freq_low", "freq_high", "mode", "amount_db"})
    limit = projects.SETTINGS.max_audio_duration_seconds * 4.0
    start = _number(params, "start", 0.0, limit, None, required=True)
    end = _number(params, "end", 0.0, limit, None, required=True)
    low = _number(params, "freq_low", 0.0, 96_000.0, None, required=True)
    high = _number(params, "freq_high", 0.0, 96_000.0, None, required=True)
    if end is None or start is None or end <= start:
        raise ParamError("'end' must be greater than 'start'.")
    if high is None or low is None or high <= low:
        raise ParamError("'freq_high' must be greater than 'freq_low'.")
    mode = params.get("mode", "attenuate")
    if mode not in ("attenuate", "heal"):
        raise ParamError("'mode' must be 'attenuate' or 'heal'.")
    return {
        "start": start,
        "end": end,
        "freq_low": low,
        "freq_high": high,
        "mode": mode,
        "amount_db": _number(params, "amount_db", 1.0, 96.0, 24.0),
    }


_VALIDATORS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "declick": _v_declick,
    "dehum": _v_dehum,
    "declip": _v_declip,
    "dereverb": _v_dereverb,
    "spectral_repair": _v_spectral_repair,
    "generate": _v_generate,
    "generate_song": song_service.validate_request,
    "to_midi": _v_analyze,
    "structure": _v_analyze,
    "warp": _v_warp,
    "quantize": _v_quantize,
    "separate": _v_separate,
    "stretch": _v_stretch,
    "pitch": _v_pitch,
    "denoise": _v_denoise,
    "normalize": _v_normalize,
    "analyze": _v_analyze,
    "match": _v_match,
    "plugin": _v_plugin,
    "render_instrument": _v_render_instrument,
    "plugin_window": _v_plugin_window,
}
OPS = tuple(_VALIDATORS)


def validate_params(op: Any, params: Any) -> dict[str, Any]:
    if not isinstance(op, str) or op not in _VALIDATORS:
        raise ParamError(f"Unknown op. Supported: {', '.join(OPS)}.")
    if params is None:
        params = {}
    if not isinstance(params, dict):
        raise ParamError("'params' must be an object.")
    return _VALIDATORS[op](params)


# --------------------------------------------------------------------------- persistence


def _job_path(project_id: str, job_id: str) -> Path:
    if not projects.is_canonical_uuid(job_id):
        raise NotFoundError("Job not found.")
    return projects.require_project(project_id) / "jobs" / f"{job_id}.json"


def _public(record: dict[str, Any]) -> dict[str, Any]:
    return {key: record.get(key) for key in JOB_FIELDS}


def create_job(project_id: str, op: Any, asset_id: Any, params: Any) -> dict[str, Any]:
    cleaned = validate_params(op, params)
    if asset_id is None and op in ASSETLESS_OPS:
        if op == "generate_song" and song_service.needs_source(cleaned):
            raise ParamError("Select a clip first: this edits existing audio.")
    elif not projects.is_canonical_uuid(asset_id):
        raise ParamError("'asset_id' must be a UUID.")
    else:
        assets.get_asset(project_id, asset_id)
    target = cleaned.get("target_asset_id")
    if target:
        assets.get_asset(project_id, target)
    stamp = projects.now_iso()
    record = {
        "id": projects.new_id(),
        "op": op,
        "asset_id": asset_id,
        "params": cleaned,
        "status": "queued",
        "progress": 0.0,
        "stage": "queued",
        "detail": "Waiting for a free worker.",
        "error": None,
        "result_assets": [],
        "result": {},
        "created_at": stamp,
        "updated_at": stamp,
    }
    projects.write_json_atomic(_job_path(project_id, record["id"]), record)
    return _public(record)


def _load(project_id: str, job_id: str) -> dict[str, Any]:
    record = projects.read_json_safe(_job_path(project_id, job_id))
    if record is None:
        raise NotFoundError("Job not found.")
    return record


def _save(project_id: str, record: dict[str, Any], **changes: Any) -> None:
    record.update(changes)
    record["progress"] = float(max(0.0, min(float(record.get("progress") or 0.0), 100.0)))
    record["updated_at"] = projects.now_iso()
    path = _job_path(project_id, record["id"])
    if path.parent.is_dir():  # The project may have been deleted while the job ran.
        projects.write_json_atomic(path, record)


def get_job(project_id: str, job_id: str) -> dict[str, Any]:
    record = _load(project_id, job_id)
    if record.get("status") in ("queued", "running") and worker_pool.get_future(job_id) is None:
        # No worker owns it any more (the API restarted or the queue was reset).
        _save(
            project_id,
            record,
            status="failed",
            stage="failed",
            detail="Job was interrupted.",
            error="The job was interrupted before it finished. Please run it again.",
        )
    return _public(record)


# --------------------------------------------------------------------------- execution


@dataclass
class _Context:
    project_id: str
    record: dict[str, Any]
    asset: dict[str, Any]
    params: dict[str, Any]

    def progress(self, stage: str, percent: float, detail: str) -> None:
        _save(self.project_id, self.record, stage=stage, progress=percent, detail=detail)

    def span(self, stage: str, low: float, high: float, detail: str) -> Callable[[float], None]:
        """Progress callback mapping a 0..1 fraction onto ``low..high`` percent."""

        def report(fraction: float) -> None:
            self.progress(stage, low + (high - low) * max(0.0, min(1.0, fraction)), detail)

        return report

    def load(self) -> tuple[np.ndarray, int]:
        self.progress("load", 5, "Loading audio.")
        return assets.load_audio(self.project_id, self.asset["id"])

    def save(
        self, audio: np.ndarray, sr: int, suffix: str, *, source: str = "process", label=None
    ) -> dict[str, Any]:
        base = str(self.asset["name"])
        merged = f"{base} ({suffix})"
        chained = self.asset.get("source") == "process" and base.endswith(")") and " (" in base
        if chained and not label:
            # Keep one bracket of steps, newest last, instead of a growing tail of brackets.
            stem, _, steps = base[:-1].rpartition(" (")
            history = [*steps.split(", "), suffix][-4:]
            merged = f"{stem} ({', '.join(history)})"
        record = assets.save_audio_asset(
            self.project_id,
            audio,
            sr,
            name=merged,
            source=source,
            parent_id=self.asset["id"],
            label=label,
        )
        return assets.public(record)

    def analysis_for(self, asset_id: str, audio: np.ndarray | None = None) -> dict[str, Any]:
        """Cached analysis of an asset, computing and caching it when missing."""
        path = assets.analysis_path(self.project_id, asset_id)
        cached = projects.read_json_safe(path)
        if cached is not None and "bpm" in cached and "key" in cached:
            return cached
        if audio is None:
            audio, sr = assets.load_audio(self.project_id, asset_id)
        else:
            sr = int(self.asset["sample_rate"])
        result = analysis.analyze(audio, sr)
        self.store_analysis(asset_id, result)
        return result

    def store_analysis(self, asset_id: str, result: dict[str, Any]) -> None:
        path = assets.analysis_path(self.project_id, asset_id)
        if path.parent.is_dir():
            projects.write_json_atomic(path, result)


_Outcome = tuple[list[dict[str, Any]], dict[str, Any]]


def _op_separate(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    params = ctx.params
    count, part = params["stems"], params["part"]
    planned = engines.separation_engines()[0]
    if part == "drums":
        what = "Splitting the drums into kit pieces."
    elif part == "vocals":
        what = "Splitting lead and backing vocals."
    else:
        extra = [
            label
            for flag, label in (("drum_kit", "drum kit"), ("lead_backing", "lead/backing vocals"))
            if params[flag]
        ]
        added = " + " + " + ".join(extra) if extra else ""
        what = f"Separating {count} stems{added} with {planned}."
    report = ctx.span("process", 10, 85, what)
    report(0.0)
    stems, engine = separation.separate(
        audio,
        sr,
        count,
        report,
        drum_kit_pass=params["drum_kit"],
        lead_backing_pass=params["lead_backing"],
        part=part,
    )
    ctx.progress("write", 88, "Writing stems.")
    created = [ctx.save(stem, sr, name, source="stem", label=name) for name, stem in stems.items()]
    return created, {"engine": engine}


def _op_stretch(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    rate = ctx.params["rate"]
    ctx.progress("process", 20, f"Time-stretching to {rate:g}x with {_stretch_engine()}.")
    out, engine = processing.stretch_pitch(audio, sr, rate=rate)
    ctx.progress("write", 90, "Writing audio.")
    return [ctx.save(out, sr, f"{rate:g}x")], {"rate": rate, "engine": engine}


def _op_pitch(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    semitones = ctx.params["semitones"]
    ctx.progress("process", 20, f"Shifting pitch {semitones:+g} st with {_stretch_engine()}.")
    out, engine = processing.stretch_pitch(audio, sr, semitones=semitones)
    ctx.progress("write", 90, "Writing audio.")
    return [ctx.save(out, sr, f"{semitones:+g} st")], {"semitones": semitones, "engine": engine}


def _op_denoise(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    ctx.progress("process", 20, "Reducing noise.")
    out, engine, used_print = processing.denoise(audio, sr, **ctx.params)
    ctx.progress("write", 90, "Writing audio.")
    return [ctx.save(out, sr, "denoised")], {"engine": engine, "used_noise_print": used_print}


def _op_normalize(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    target = ctx.params["target_lufs"]
    ctx.progress("process", 30, f"Normalising to {target:g} LUFS.")
    out, result = processing.normalize(
        audio, sr, target_lufs=target, true_peak_ceiling_dbfs=ctx.params["true_peak_dbfs"]
    )
    ctx.progress("write", 90, "Writing audio.")
    return [ctx.save(out, sr, f"{result['output_lufs']:g} LUFS")], result


def _op_analyze(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    ctx.progress("process", 20, f"Detecting tempo, beats and key ({engines.beat_engine()}).")
    result = analysis.analyze(audio, sr)
    ctx.progress("write", 90, "Saving analysis.")
    ctx.store_analysis(ctx.asset["id"], result)
    return [], result


def _op_match(ctx: _Context) -> _Outcome:
    params = ctx.params
    audio, sr = ctx.load()
    ctx.progress("process", 10, "Analysing the source.")
    source = ctx.analysis_for(ctx.asset["id"], audio)
    target_bpm, target_key = params["target_bpm"], params["target_key"]
    if params["target_asset_id"]:
        ctx.progress("process", 25, "Analysing the target.")
        target = ctx.analysis_for(params["target_asset_id"])
        target_bpm = target.get("bpm") or target_bpm
        target_key = target.get("key_label") or target_key

    rate, semitones, key_note, tempo_note = 1.0, 0.0, None, None
    labels: list[str] = []
    if params["match_tempo"] and target_bpm:
        if not source.get("bpm"):
            raise EditorError("Could not detect the source tempo, so it cannot be tempo-matched.")
        rate = analysis.tempo_rate(float(source["bpm"]), float(target_bpm))
        if not 0.5 <= rate <= 2.0:
            raise EditorError(
                f"Tempo change too large: {source['bpm']:g} to {target_bpm:g} BPM needs a "
                f"{rate:.2f}x stretch (allowed 0.5x-2x)."
            )
        tempo_note = f"{source['bpm']:g} BPM to {target_bpm:g} BPM at {rate:.3f}x."
        labels.append(f"{target_bpm:g} BPM")
    if params["match_key"] and target_key:
        if not source.get("key_label"):
            raise EditorError("Could not detect the source key, so it cannot be key-matched.")
        src_key = analysis.parse_key(str(source["key_label"]))
        dst_key = analysis.parse_key(str(target_key))
        if src_key is None or dst_key is None:
            raise EditorError("The key could not be understood.")
        shift, key_note = analysis.key_shift(src_key, dst_key)
        semitones = float(shift)
        labels.append(analysis.key_label(*dst_key))

    ctx.progress("process", 40, f"Stretching {rate:.3f}x, shifting {semitones:+g} st.")
    out, engine = processing.stretch_pitch(audio, sr, rate=rate, semitones=semitones)
    result: dict[str, Any] = {}
    if params["match_loudness_lufs"] is not None:
        ctx.progress("process", 70, "Matching loudness.")
        out, loudness = processing.normalize(out, sr, target_lufs=params["match_loudness_lufs"])
        result["loudness"] = loudness
        labels.append(f"{loudness['output_lufs']:g} LUFS")
    ctx.progress("process", 78, "Analysing the result.")
    output_analysis = analysis.analyze(out, sr)
    ctx.progress("write", 92, "Writing audio.")
    created = ctx.save(out, sr, ", ".join(labels) or "matched")
    ctx.store_analysis(created["id"], output_analysis)
    result.update(
        rate=round(rate, 6),
        semitones=semitones,
        source=source,
        analysis=output_analysis,
        engine=engine,
        key_note=key_note,
        tempo_note=tempo_note,
    )
    return [created], result


def _op_plugin(ctx: _Context) -> _Outcome:
    if not engines.plugin_hosting_available():
        raise EditorError(plugins.UNAVAILABLE_MESSAGE)
    audio, sr = ctx.load()
    preview = ctx.params.get("preview_seconds")
    if preview:
        # An audition renders only a short excerpt, so it comes back in a moment.
        first = min(audio.shape[0] - 1, int((ctx.params.get("preview_start") or 0.0) * sr))
        audio = audio[first : first + int(preview * sr)]
        processing.require_min_length(audio)
    ctx.progress("process", 20, "Running the plugin in an isolated process.")
    out, name = plugins.apply_plugin(audio, sr, ctx.params["plugin_id"], ctx.params["parameters"])
    out = processing.fit_length(out, audio.shape[0])
    ctx.progress("write", 90, "Writing audio.")
    suffix = f"{name}, preview" if preview else name
    result = {"plugin": name, "engine": "pedalboard", "preview": bool(preview)}
    return [ctx.save(out, sr, suffix)], result


def _op_render_instrument(ctx: _Context) -> _Outcome:
    if not engines.plugin_hosting_available():
        raise EditorError(plugins.UNAVAILABLE_MESSAGE)
    params = ctx.params
    ctx.progress("process", 15, f"Playing {len(params['notes'])} notes through the instrument.")
    out, name = plugins.render_instrument(
        params["plugin_id"],
        params["notes"],
        params["seconds"],
        params["sample_rate"],
        params["state"],
    )
    ctx.progress("write", 90, "Writing audio.")
    record = assets.save_audio_asset(
        ctx.project_id,
        out,
        params["sample_rate"],
        name=f"{params['name']} ({name})",
        source="process",
    )
    peak = float(np.max(np.abs(out))) if out.size else 0.0
    result = {"plugin": name, "engine": "pedalboard", "silent": peak < 1e-5}
    return [assets.public(record)], result


def _op_plugin_window(ctx: _Context) -> _Outcome:
    if not engines.plugin_hosting_available():
        raise EditorError(plugins.UNAVAILABLE_MESSAGE)
    ctx.progress("process", 10, "The plugin's window is open. Close it to keep the sound.")
    outcome = plugins.open_plugin_window(
        ctx.params["plugin_id"], ctx.params["state"], str(ctx.record["id"])
    )
    return [], outcome


def _warp_outcome(ctx: _Context, audio: np.ndarray, sr: int, markers: list, suffix: str):
    pairs = [(float(src), float(dst)) for src, dst in markers]
    ctx.progress("process", 30, f"Warping {len(pairs) + 1} sections with {_stretch_engine()}.")
    out, engine = processing.warp(audio, sr, pairs)
    ctx.progress("write", 90, "Writing audio.")
    anchors = processing.warp_map(pairs, audio.shape[0] / sr)
    return [ctx.save(out, sr, suffix)], {"anchors": anchors, "engine": engine}


def _op_warp(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    duration = audio.shape[0] / sr
    markers = [m for m in ctx.params["markers"] if m[0] < duration]
    if not markers:
        raise EditorError("Every warp marker lies after the end of the audio.")
    if duration - markers[-1][0] < processing.WARP_MIN_SEGMENT_SECONDS:
        markers = markers[:-1] or markers
    return _warp_outcome(ctx, audio, sr, markers, "warped")


def _op_generate(ctx: _Context) -> _Outcome:
    params = ctx.params
    ctx.progress("process", 5, "Contacting ComfyUI.")
    outcome = generation.generate(
        ctx.project_id,
        prompt=params["prompt"],
        bpm=params["bpm"],
        seconds=params["seconds"],
        model=params["model"],
        parent_id=ctx.asset["id"],
        progress=lambda percent, detail: ctx.progress("process", percent, detail),
    )
    return [outcome["asset"]], {"model": outcome["model"], "prompt": params["prompt"]}


def _op_generate_song(ctx: _Context) -> _Outcome:
    return song_service.run(
        ctx.project_id,
        str(ctx.record["id"]),
        ctx.params,
        ctx.asset.get("id"),
        lambda percent, detail: ctx.progress("process", percent, detail),
    )


def _op_to_midi(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    engine = composition.transcription_engine()
    ctx.progress("process", 20, f"Transcribing notes ({engine}).")
    wav, _ = assets.asset_paths(ctx.project_id, ctx.asset["id"])
    notes, used = composition.to_midi(audio, sr, wav)
    if not notes:
        raise EditorError("No pitched notes were found in this audio.")
    return [], {"notes": notes, "engine": used, "polyphonic": used == "basic-pitch"}


def _op_structure(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    ctx.progress("process", 20, "Finding sections.")
    return [], {"sections": composition.structure(audio, sr)}


def _snap_to_onsets(audio: np.ndarray, sr: int, beats: list[float]) -> list[float]:
    """Move each tracked beat onto the nearest played attack.

    Beat trackers report a smoothed pulse; the notes a performer actually played sit
    a little either side of it, and those are what quantising has to move.
    """
    import librosa

    hop = 128
    strength = librosa.onset.onset_strength(y=audio.mean(axis=1), sr=sr, hop_length=hop)
    floor = float(strength.mean() + strength.std())
    gaps = np.diff(beats)
    reach = min(0.12, 0.45 * float(np.median(gaps))) if len(gaps) else 0.12
    snapped: list[float] = []
    for beat in beats:
        first = max(0, int((beat - reach) * sr / hop))
        window = strength[first : int((beat + reach) * sr / hop) + 1]
        if window.size and float(window.max()) > floor:
            beat = (first + int(window.argmax())) * hop / sr
        if not snapped or beat - snapped[-1] > 0.05:
            snapped.append(float(beat))
    return snapped


def _op_quantize(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    bpm = ctx.params["bpm"]
    ctx.progress("process", 10, f"Finding beats ({engines.beat_engine()}).")
    found = ctx.analysis_for(ctx.asset["id"], audio)
    beats = [float(b) for b in found.get("beats") or []]
    if len(beats) < 4 or not found.get("bpm"):
        raise EditorError("Not enough beats were detected to quantise this audio.")
    beats = _snap_to_onsets(audio, sr, beats)
    # Half- and double-time readings of the same groove count as the same tempo.
    source_bpm = float(found["bpm"])
    step = (60.0 / source_bpm) / analysis.tempo_rate(source_bpm, bpm)
    stride = max(1, math.ceil(len(beats) / 120))
    markers: list[list[float]] = []
    previous = (0.0, 0.0)
    for index in range(0, len(beats), stride):
        src = beats[index]
        dst = beats[0] + index * step
        gap_src, gap_dst = src - previous[0], dst - previous[1]
        if gap_src < processing.WARP_MIN_SEGMENT_SECONDS or gap_dst <= 0:
            continue
        if not 0.5 <= gap_src / gap_dst <= 2.0:
            raise EditorError(
                f"The detected tempo ({found['bpm']:g} BPM) is too far from {bpm:g} BPM "
                "to quantise."
            )
        markers.append([src, dst])
        previous = (src, dst)
    if not markers:
        raise EditorError("Not enough beats were detected to quantise this audio.")
    created, result = _warp_outcome(ctx, audio, sr, markers, f"{bpm:g} BPM grid")
    result.update(bpm=bpm, source_bpm=found["bpm"], beats=len(markers))
    return created, result


def _op_declick(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    ctx.progress("process", 20, "Finding and repairing clicks.")
    out, repaired = restoration.declick(audio, sr, ctx.params["sensitivity"])
    ctx.progress("write", 90, "Writing audio.")
    return [ctx.save(out, sr, "declicked")], {"repaired": repaired}


def _op_dehum(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    ctx.progress("process", 20, "Removing mains hum and its harmonics.")
    out, frequency = restoration.dehum(audio, sr, ctx.params["frequency"], ctx.params["harmonics"])
    ctx.progress("write", 90, "Writing audio.")
    return [ctx.save(out, sr, "dehummed")], {"frequency": frequency}


def _op_declip(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    ctx.progress("process", 20, "Rebuilding clipped peaks.")
    out, info = restoration.declip(audio, sr, ctx.params["threshold"])
    ctx.progress("write", 90, "Writing audio.")
    return [ctx.save(out, sr, "declipped")], info


def _op_dereverb(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    ctx.progress("process", 20, "Reducing reverberation.")
    out = restoration.dereverb(audio, sr, ctx.params["strength"])
    ctx.progress("write", 90, "Writing audio.")
    return [ctx.save(out, sr, "dereverbed")], {"strength": ctx.params["strength"]}


def _op_spectral_repair(ctx: _Context) -> _Outcome:
    audio, sr = ctx.load()
    params = ctx.params
    if params["start"] >= audio.shape[0] / sr:
        raise EditorError("The selection starts after the end of the audio.")
    ctx.progress("process", 20, "Repairing the selected frequencies.")
    out = restoration.spectral_repair(audio, sr, **params)
    ctx.progress("write", 90, "Writing audio.")
    return [ctx.save(out, sr, "repaired")], {"mode": params["mode"]}


def _stretch_engine() -> str:
    return engines.stretch_engines()[0]


_HANDLERS: dict[str, Callable[[_Context], _Outcome]] = {
    "declick": _op_declick,
    "dehum": _op_dehum,
    "declip": _op_declip,
    "dereverb": _op_dereverb,
    "spectral_repair": _op_spectral_repair,
    "generate": _op_generate,
    "generate_song": _op_generate_song,
    "to_midi": _op_to_midi,
    "structure": _op_structure,
    "warp": _op_warp,
    "quantize": _op_quantize,
    "separate": _op_separate,
    "stretch": _op_stretch,
    "pitch": _op_pitch,
    "denoise": _op_denoise,
    "normalize": _op_normalize,
    "analyze": _op_analyze,
    "match": _op_match,
    "plugin": _op_plugin,
    "render_instrument": _op_render_instrument,
    "plugin_window": _op_plugin_window,
}


def run_job(project_id: str, job_id: str) -> None:
    """Execute a queued job. Never raises; failures are recorded on the job."""
    try:
        record = _load(project_id, job_id)
    except EditorError:
        return
    op = str(record.get("op"))
    try:
        _save(project_id, record, status="running", stage="load", detail="Starting.", progress=1)
        asset_id = record.get("asset_id")
        asset = assets.get_asset(project_id, str(asset_id)) if asset_id else {}
        ctx = _Context(project_id, record, asset, dict(record.get("params") or {}))
        created, result = _HANDLERS[op](ctx)
        _save(
            project_id,
            record,
            status="completed",
            stage="done",
            detail="Done.",
            progress=100,
            result_assets=created,
            result=result,
        )
    except EditorError as exc:
        _fail(project_id, record, str(exc))
    except MemoryError:
        _fail(project_id, record, "Not enough memory to process this audio.")
    except Exception as exc:
        logger.exception("Editor job %s (%s) failed", job_id, op)
        _fail(project_id, record, f"The {op} job failed unexpectedly ({type(exc).__name__}).")


def cancel_job(project_id: str, job_id: str) -> dict[str, Any]:
    """Ask a running generation to stop. Other job types cannot be cancelled."""
    record = _load(project_id, job_id)
    if record.get("op") == "generate_song" and record.get("status") in ("queued", "running"):
        song_service.cancel(job_id)
    return _public(record)


def close_window(project_id: str, job_id: str) -> dict[str, Any]:
    """Close the plugin window a ``plugin_window`` job opened, keeping its sound."""
    record = _load(project_id, job_id)
    if record.get("op") != "plugin_window":
        raise ParamError("This job did not open a plugin window.")
    if record.get("status") in ("queued", "running"):
        plugins.close_plugin_window(job_id)
    return _public(record)


def _fail(project_id: str, record: dict[str, Any], message: str) -> None:
    try:
        _save(project_id, record, status="failed", stage="failed", detail="Failed.", error=message)
    except Exception:
        logger.exception("Could not record editor job failure")
