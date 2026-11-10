"""Local song generation with acestep.cpp (ACE-Step 1.5, MIT)."""

from __future__ import annotations

import email
import io
import json
import math
import tempfile
import time
from pathlib import Path
from typing import Any

import numpy as np
import requests
import soundfile as sf

from audioqi.editor import processing, projects
from audioqi.editor.projects import EditorError, ParamError
from audioqi.generation import engine
from audioqi.generation.providers.base import Output, RunContext
from audioqi.generation.schema import field

KEYS = [
    f"{note} {mode}"
    for note in ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
    for mode in ("major", "minor")
]
LANGUAGES = [
    ("en", "English"),
    ("es", "Spanish"),
    ("fr", "French"),
    ("de", "German"),
    ("it", "Italian"),
    ("pt", "Portuguese"),
    ("ru", "Russian"),
    ("uk", "Ukrainian"),
    ("pl", "Polish"),
    ("nl", "Dutch"),
    ("sv", "Swedish"),
    ("tr", "Turkish"),
    ("ar", "Arabic"),
    ("he", "Hebrew"),
    ("hi", "Hindi"),
    ("id", "Indonesian"),
    ("vi", "Vietnamese"),
    ("th", "Thai"),
    ("zh", "Chinese"),
    ("ja", "Japanese"),
    ("ko", "Korean"),
    ("unknown", "No specific language"),
]
SECTIONS = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Instrumental", "Outro"]
INSTRUMENTAL = "[Instrumental]"
TRACKS = [
    ("vocals", "Vocals"),
    ("backing_vocals", "Backing vocals"),
    ("drums", "Drums"),
    ("bass", "Bass"),
    ("guitar", "Guitar"),
    ("keyboard", "Keyboard"),
    ("percussion", "Percussion"),
    ("strings", "Strings"),
    ("synth", "Synth"),
    ("fx", "Effects"),
    ("brass", "Brass"),
    ("woodwinds", "Woodwinds"),
]
#: Tasks that change existing audio. "base" tasks need the base music model (not turbo).
EDIT_TASKS: dict[str, dict[str, Any]] = {
    "repaint": {"label": "Regenerate a section", "engine_task": "repaint", "model": "turbo"},
    "extend": {"label": "Extend", "engine_task": "repaint", "model": "turbo"},
    "cover": {"label": "Restyle", "engine_task": "cover", "model": "turbo"},
    "extract": {"label": "Extract an instrument", "engine_task": "extract", "model": "base"},
    "add_layer": {"label": "Add a part", "engine_task": "lego", "model": "base"},
    "complete": {
        "label": "Build a full song around it",
        "engine_task": "complete",
        "model": "base",
    },
}
SOURCE_TASKS = tuple(EDIT_TASKS)
#: Where a single generated part starts, relative to the mix it belongs to.
PART_BELOW_MIX_LU = 6.0
#: The engine's latent buffer holds at most 600 s (15,000 frames at 25 Hz).
MAX_CANVAS_SECONDS = 600.0
_WITH_LYRICS = ["text2music", "repaint", "extend", "cover"]
# Fields passed to the engine unchanged.
_PASSTHROUGH = (
    "caption",
    "bpm",
    "duration",
    "keyscale",
    "timesignature",
    "vocal_language",
    "seed",
    "lm_temperature",
    "lm_cfg_scale",
    "lm_top_p",
    "lm_top_k",
    "lm_negative_prompt",
    "use_cot_caption",
    "inference_steps",
    "guidance_scale",
    "shift",
    "solver",
    "adapter_scale",
)


def _options(names: list[str]) -> list[dict[str, str]]:
    return [{"value": name, "label": name.removesuffix(".gguf")} for name in names]


class AceStepProvider:
    id = "acestep_local"
    name = "ACE-Step 1.5 (on this computer)"
    kind = "local"

    def describe(self) -> dict[str, Any]:
        models = engine.list_models()
        adapters = engine.list_adapters()
        fields = [
            field(
                "caption",
                "text",
                "Song",
                "Style description",
                required_tasks=[
                    "text2music",
                    "repaint",
                    "extend",
                    "cover",
                    "add_layer",
                    "complete",
                ],
                min=3,
                max=1500,
                multiline=True,
                help="Genre, mood, instruments, voice and production, in plain words.",
            ),
            field(
                "instrumental",
                "bool",
                "Song",
                "Instrumental (no vocals)",
                default=False,
                tasks=_WITH_LYRICS,
            ),
            field(
                "duration",
                "float",
                "Song",
                "Length",
                min=10,
                max=600,
                step=5,
                unit="s",
                auto=True,
                help="Leave on Auto to let the model choose.",
                tasks=["text2music"],
            ),
            field(
                "lyrics",
                "lyrics",
                "Lyrics",
                "Lyrics",
                max=6000,
                sections=SECTIONS,
                help="Use tags such as [Verse] and [Chorus]. Leave empty to let the model write them.",
                tasks=_WITH_LYRICS,
            ),
            field(
                "vocal_language",
                "enum",
                "Lyrics",
                "Language",
                auto=True,
                options=[{"value": code, "label": label} for code, label in LANGUAGES],
            ),
            field("bpm", "int", "Music", "Tempo", min=30, max=300, step=1, unit="BPM", auto=True),
            field("keyscale", "enum", "Music", "Key", auto=True, options=KEYS),
            field(
                "timesignature",
                "enum",
                "Music",
                "Time signature",
                auto=True,
                options=[
                    {"value": "4", "label": "4/4"},
                    {"value": "3", "label": "3/4"},
                    {"value": "2", "label": "2/4"},
                    {"value": "6", "label": "6/8"},
                ],
            ),
            field(
                "variations",
                "int",
                "Variations",
                "Versions to make",
                min=1,
                max=4,
                step=1,
                default=1,
                help="Each version uses the next seed and takes extra time.",
            ),
            field(
                "seed",
                "seed",
                "Variations",
                "Seed",
                default=-1,
                help="-1 picks a random seed. Reuse a seed to get the same result again.",
            ),
            field(
                "use_lm",
                "bool",
                "Advanced",
                "Plan the song first",
                default=True,
                advanced=True,
                help="The planner model sketches the song before audio is made. Adds about 15 seconds.",
                tasks=["text2music"],
            ),
            field(
                "use_cot_caption",
                "bool",
                "Advanced",
                "Let the planner rewrite the style",
                default=False,
                advanced=True,
                tasks=["text2music"],
            ),
            field(
                "lm_temperature",
                "float",
                "Advanced",
                "Planner temperature",
                min=0.0,
                max=2.0,
                step=0.05,
                default=0.85,
                advanced=True,
            ),
            field(
                "lm_cfg_scale",
                "float",
                "Advanced",
                "Planner guidance",
                min=1.0,
                max=10.0,
                step=0.1,
                default=2.0,
                advanced=True,
            ),
            field(
                "lm_top_p",
                "float",
                "Advanced",
                "Planner top-p",
                min=0.05,
                max=1.0,
                step=0.05,
                default=0.9,
                advanced=True,
            ),
            field(
                "lm_top_k",
                "int",
                "Advanced",
                "Planner top-k",
                min=0,
                max=500,
                step=1,
                default=0,
                advanced=True,
                help="0 switches top-k off.",
            ),
            field(
                "lm_negative_prompt", "text", "Advanced", "Styles to avoid", max=400, advanced=True
            ),
            field(
                "inference_steps",
                "int",
                "Advanced",
                "Diffusion steps",
                min=1,
                max=100,
                step=1,
                auto=True,
                advanced=True,
                help="Auto uses 8 for turbo models and 50 for base models.",
            ),
            field(
                "guidance_scale",
                "float",
                "Advanced",
                "Diffusion guidance",
                min=1.0,
                max=15.0,
                step=0.1,
                auto=True,
                advanced=True,
                help="Turbo models always use 1.",
            ),
            field(
                "shift",
                "float",
                "Advanced",
                "Schedule shift",
                min=0.1,
                max=10.0,
                step=0.1,
                auto=True,
                advanced=True,
            ),
            field(
                "solver",
                "enum",
                "Advanced",
                "Solver",
                default="euler",
                advanced=True,
                options=[
                    {"value": "euler", "label": "Euler"},
                    {"value": "sde", "label": "SDE ancestral"},
                    {"value": "dpm3m", "label": "DPM++ 3M"},
                    {"value": "stork4", "label": "STORK 4"},
                ],
            ),
            field(
                "synth_model",
                "model",
                "Advanced",
                "Music model",
                auto=True,
                advanced=True,
                options=_options(models["dit"]),
            ),
            field(
                "lm_model",
                "model",
                "Advanced",
                "Planner model",
                auto=True,
                advanced=True,
                options=_options(models["lm"]),
            ),
        ]
        if adapters:
            fields += [
                field(
                    "adapter",
                    "model",
                    "Advanced",
                    "LoRA adapter",
                    auto=True,
                    advanced=True,
                    options=[{"value": name, "label": name} for name in adapters],
                ),
                field(
                    "adapter_scale",
                    "float",
                    "Advanced",
                    "Adapter strength",
                    min=0.0,
                    max=2.0,
                    step=0.05,
                    default=1.0,
                    advanced=True,
                ),
            ]
        fields += self._edit_fields()
        has_base = bool(self._model_for("base", models["dit"]))
        tasks: list[dict[str, Any]] = [{"id": "text2music", "label": "New song"}]
        for task_id, spec in EDIT_TASKS.items():
            entry: dict[str, Any] = {"id": task_id, "label": spec["label"], "source": True}
            if spec["model"] == "base" and not has_base:
                entry["available"] = False
                entry["reason"] = (
                    "Needs the editing model (2.4 GB). Download it from AI Song Studio > Settings."
                )
            tasks.append(entry)
        return {
            "tasks": tasks,
            "groups": ["Song", "Edit", "Lyrics", "Music", "Variations", "Advanced"],
            "fields": fields,
        }

    @staticmethod
    def _edit_fields() -> list[dict[str, Any]]:
        """Controls for editing existing audio. Region values come from the editor selection."""
        return [
            field(
                "region_start",
                "float",
                "Edit",
                "Section start",
                min=0,
                max=MAX_CANVAS_SECONDS,
                step=0.01,
                unit="s",
                editor=True,
                tasks=["repaint", "add_layer"],
                required_tasks=["repaint"],
            ),
            field(
                "region_end",
                "float",
                "Edit",
                "Section end",
                min=0,
                max=MAX_CANVAS_SECONDS,
                step=0.01,
                unit="s",
                editor=True,
                tasks=["repaint", "add_layer"],
                required_tasks=["repaint"],
            ),
            field(
                "extend_seconds",
                "float",
                "Edit",
                "Add",
                min=5,
                max=120,
                step=5,
                unit="s",
                default=20,
                tasks=["extend"],
            ),
            field(
                "extend_at",
                "enum",
                "Edit",
                "Where",
                default="end",
                tasks=["extend"],
                options=[
                    {"value": "end", "label": "After the end"},
                    {"value": "start", "label": "Before the start"},
                ],
            ),
            field(
                "strength",
                "float",
                "Edit",
                "How much of the original to keep",
                min=0.05,
                max=1.0,
                step=0.05,
                default=0.5,
                tasks=["cover"],
                help="Low values follow your new style; high values stay closer to the original.",
            ),
            field(
                "faithful",
                "bool",
                "Edit",
                "Stay close to the original (remix)",
                default=False,
                tasks=["cover"],
                help="Keeps the melody, timing and timbre; changes the production.",
            ),
            field(
                "track",
                "enum",
                "Edit",
                "Instrument",
                tasks=["extract", "add_layer", "complete"],
                required_tasks=["extract", "add_layer", "complete"],
                options=[{"value": value, "label": label} for value, label in TRACKS],
            ),
        ]

    @staticmethod
    def _model_for(kind: str, dits: list[str]) -> str | None:
        """The DiT file for a task: "base" for layer tasks, otherwise turbo."""
        if kind == "base":
            return next((name for name in dits if "-base" in name), None)
        return next((name for name in dits if "turbo" in name), dits[0] if dits else None)

    def status(self) -> dict[str, Any]:
        installed = engine.install_status()
        if installed["installed"]:
            message = "Ready. Runs on this computer; nothing is sent anywhere."
        elif installed["built"]:
            message = "The engine is built but its models are missing."
        else:
            message = "Not installed yet."
        return {
            "ready": installed["installed"],
            "message": message,
            "running": engine.SUPERVISOR.running(),
            "models": installed["models"],
        }

    # -- generation

    def _request(self, values: dict[str, Any]) -> dict[str, Any]:
        body: dict[str, Any] = {key: values[key] for key in _PASSTHROUGH if key in values}
        body["lyrics"] = INSTRUMENTAL if values.get("instrumental") else values.get("lyrics", "")
        body["use_cot_caption"] = bool(values.get("use_cot_caption", False))
        body["synth_batch_size"] = int(values.get("variations", 1))
        body["task_type"] = "text2music"
        body["output_format"] = "wav24"
        for key in ("synth_model", "lm_model", "adapter"):
            if values.get(key):
                body[key] = values[key]
        if "synth_model" not in body:
            # The engine otherwise loads the first model alphabetically, which is the slow
            # base model once the editing model is installed.
            chosen = self._model_for("turbo", engine.list_models()["dit"])
            if chosen:
                body["synth_model"] = chosen
        return body

    def _job(
        self,
        base: str,
        path: str,
        body: dict[str, Any],
        ctx: RunContext,
        low: float,
        high: float,
        expected: float,
        detail: str,
        files: dict[str, Path] | None = None,
    ) -> requests.Response:
        try:
            if files:
                parts: dict[str, Any] = {"request": (None, json.dumps(body), "application/json")}
                handles = {name: path.open("rb") for name, path in files.items()}
                try:
                    for name, handle in handles.items():
                        parts[name] = (f"{name}.wav", handle, "audio/wav")
                    submitted = requests.post(f"{base}{path}", files=parts, timeout=120.0)
                finally:
                    for handle in handles.values():
                        handle.close()
            else:
                submitted = requests.post(f"{base}{path}", json=body, timeout=30.0)
            job_id: Any = submitted.json().get("id") if submitted.status_code == 200 else None
        except (requests.RequestException, ValueError) as exc:
            raise EditorError("The AI engine did not accept the request.", 502) from exc
        if not isinstance(job_id, str) or not (0 < len(job_id) <= 64 and job_id.isalnum()):
            raise EditorError("The AI engine rejected the request.", 502)
        started = time.monotonic()
        failures = 0
        while True:
            if ctx.cancelled():
                try:
                    requests.post(f"{base}/job", params={"id": job_id, "cancel": "1"}, timeout=10.0)
                except requests.RequestException:
                    pass
                raise EditorError("Generation was cancelled.", 409)
            elapsed = time.monotonic() - started
            # No percentage comes back, so progress follows the time we measured for this size.
            # The curve keeps moving when a job runs longer than expected (a cold engine, a slow
            # machine) instead of stopping at the estimate.
            fraction = min(0.98, 1.0 - math.exp(-1.2 * elapsed / max(1.0, expected)))
            ctx.progress(low + (high - low) * fraction, detail)
            try:
                status = (
                    requests.get(f"{base}/job", params={"id": job_id}, timeout=10.0)
                    .json()
                    .get("status")
                )
                failures = 0
            except (requests.RequestException, ValueError):
                failures += 1
                if failures > 5 or not engine.SUPERVISOR.running():
                    raise EditorError("The AI engine stopped while generating.", 502) from None
                status = "running"
            if status == "done":
                break
            if status in ("failed", "cancelled"):
                raise EditorError("The AI engine could not generate this request.", 502)
            time.sleep(0.5)
        try:
            result = requests.get(
                f"{base}/job", params={"id": job_id, "result": "1"}, timeout=300.0
            )
        except requests.RequestException as exc:
            raise EditorError("The result could not be fetched from the AI engine.", 502) from exc
        if result.status_code != 200:
            raise EditorError("The AI engine returned no result.", 502)
        return result

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        if task in EDIT_TASKS:
            return self._edit(task, values, ctx)
        body = self._request(values)
        seconds = float(values.get("duration") or 120.0)
        versions = int(body["synth_batch_size"])
        with engine.SUPERVISOR.session() as base:
            lm_end = 12.0
            if values.get("use_lm", True):
                lm_end = 35.0
                planned = self._job(
                    base, "/lm", body, ctx, 12.0, lm_end, 10.0 + seconds / 8.0, "Planning the song."
                )
                try:
                    plans = planned.json()
                    plan = plans[0] if isinstance(plans, list) and plans else None
                except ValueError:
                    plan = None
                if not isinstance(plan, dict):
                    raise EditorError("The planner returned nothing usable.", 502)
                # The plan carries the filled-in tempo, key, lyrics and audio codes.
                body = {
                    **plan,
                    **{k: body[k] for k in ("synth_batch_size", "output_format", "task_type")},
                }
                for key in ("synth_model", "adapter", "adapter_scale"):
                    if key in values:
                        body[key] = values[key]
                seconds = float(body.get("duration") or seconds)
            expected = (10.0 + seconds * 0.3) * (1.0 + 0.9 * (versions - 1))
            result = self._job(
                base, "/synth", body, ctx, lm_end, 88.0, expected, "Generating audio."
            )
        seed = body.get("seed")
        outputs: list[Output] = []
        for data, content_type in _audio_parts(result):
            meta = {
                key: body.get(key)
                for key in (
                    "caption",
                    "lyrics",
                    "bpm",
                    "keyscale",
                    "timesignature",
                    "vocal_language",
                    "duration",
                )
            }
            if isinstance(seed, int) and seed >= 0:
                meta["seed"] = seed + len(outputs)
            suffix = ".mp3" if content_type == "audio/mpeg" else ".wav"
            outputs.append(Output(data=data, suffix=suffix, meta=meta))
        if not outputs:
            raise EditorError("The AI engine finished but produced no audio.", 502)
        return outputs

    # -- editing existing audio

    def edit_request(
        self, task: str, values: dict[str, Any], source_seconds: float
    ) -> dict[str, Any]:
        """The engine request for an edit task, with the region resolved against the source."""
        spec = EDIT_TASKS[task]
        dits = engine.list_models()["dit"]
        model = values.get("synth_model") or self._model_for(spec["model"], dits)
        if spec["model"] == "base" and (not model or "-base" not in str(model)):
            raise EditorError(
                "This needs the editing model. Download it from AI Song Studio > Settings.", 409
            )
        lyrics = str(values.get("lyrics", "")).strip()
        body: dict[str, Any] = {
            "task_type": spec["engine_task"],
            "caption": values.get("caption") or f"{values.get('track', 'music')}",
            "lyrics": INSTRUMENTAL if values.get("instrumental") or not lyrics else lyrics,
            "synth_batch_size": int(values.get("variations", 1)),
            "output_format": "wav24",
        }
        if model:
            body["synth_model"] = model
        for key in (
            "seed",
            "bpm",
            "keyscale",
            "timesignature",
            "vocal_language",
            "inference_steps",
            "guidance_scale",
            "shift",
            "solver",
            "adapter",
            "adapter_scale",
        ):
            if key in values:
                body[key] = values[key]
        if task == "repaint" or (task == "add_layer" and "region_start" in values):
            start = float(values.get("region_start", 0.0))
            end = float(values.get("region_end", source_seconds))
            end = min(end, source_seconds)
            if end - start < 1.0:
                raise ParamError("Select at least one second of the clip to regenerate.")
            body["repainting_start"], body["repainting_end"] = start, end
        elif task == "extend":
            added = float(values.get("extend_seconds", 20))
            if source_seconds + added > MAX_CANVAS_SECONDS:
                raise ParamError(
                    f"The clip and the extension together must stay under {MAX_CANVAS_SECONDS:.0f} seconds."
                )
            if values.get("extend_at", "end") == "start":
                body["repainting_start"], body["repainting_end"] = -added, 0.0
            else:
                body["repainting_start"] = source_seconds
                body["repainting_end"] = source_seconds + added
        elif task == "cover":
            if values.get("faithful"):
                body["task_type"] = "cover-nofsq"
            body["audio_cover_strength"] = float(values.get("strength", 0.5))
        if task in ("extract", "add_layer", "complete"):
            body["track"] = values["track"]
        return body

    def _edit(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        if ctx.source is None or not ctx.source.is_file():
            raise EditorError("Select a clip first: this edits existing audio.", 422)
        source, rate = sf.read(str(ctx.source), dtype="float32", always_2d=True)
        seconds = len(source) / float(rate)
        if seconds > MAX_CANVAS_SECONDS:
            raise EditorError(
                f"The clip's audio is longer than {MAX_CANVAS_SECONDS:.0f} seconds. "
                "Split it and edit a part.",
                422,
            )
        body = self.edit_request(task, values, seconds)
        versions = int(body["synth_batch_size"])
        base_model = "-base" in str(body.get("synth_model", ""))
        per_second = 1.2 if base_model else 0.35
        expected = (10.0 + seconds * per_second) * (1.0 + 0.9 * (versions - 1))
        with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
            staged = Path(tmp) / "source.wav"
            # Clips are stored as 32-bit float; the engine reads integer WAV most reliably.
            sf.write(str(staged), np.clip(source, -1.0, 1.0), rate, subtype="PCM_24")
            files = {"audio": staged}
            if body["task_type"] == "cover-nofsq":
                files["ref_audio"] = staged  # The engine's advice for faithful remixes.
            with engine.SUPERVISOR.session() as base:
                result = self._job(
                    base,
                    "/synth",
                    body,
                    ctx,
                    12.0,
                    88.0,
                    expected,
                    f"{EDIT_TASKS[task]['label']}.",
                    files=files,
                )
        outputs: list[Output] = []
        for data, _content_type in _audio_parts(result):
            audio, out_rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
            audio, level = _match_level(task, body, source, int(rate), audio, int(out_rate))
            buffer = io.BytesIO()
            sf.write(buffer, audio, int(out_rate), format="WAV", subtype="FLOAT")
            meta: dict[str, Any] = {
                "task": task,
                "caption": body.get("caption"),
                "track": body.get("track"),
                "source_seconds": round(seconds, 3),
                "result_seconds": round(len(audio) / float(out_rate), 3),
                **level,
            }
            if task == "extend":
                meta["extend_at"] = values.get("extend_at", "end")
                meta["extended_seconds"] = float(values.get("extend_seconds", 20))
            if "repainting_start" in body:
                meta["region"] = [body["repainting_start"], body["repainting_end"]]
            seed = body.get("seed")
            if isinstance(seed, int) and seed >= 0:
                meta["seed"] = seed + len(outputs)
            outputs.append(
                Output(data=buffer.getvalue(), suffix=".wav", meta=meta, normalize=False)
            )
        if not outputs:
            raise EditorError("The AI engine finished but produced no audio.", 502)
        return outputs

    def inspire(self, idea: str) -> dict[str, Any]:
        """Draft a song brief with the engine's own planner (no audio)."""
        ctx = RunContext("", None, lambda *_: None, lambda: False)
        with engine.SUPERVISOR.session() as base:
            result = self._job(
                base, "/lm", {"caption": idea, "lm_mode": "inspire"}, ctx, 0, 100, 20, ""
            )
        try:
            plan = result.json()[0]
        except (ValueError, IndexError, KeyError, TypeError) as exc:
            raise EditorError("The planner returned nothing usable.", 502) from exc
        return plan if isinstance(plan, dict) else {}


def _audio_parts(result: requests.Response) -> list[tuple[bytes, str]]:
    """The audio parts of the engine's multipart answer, in order."""
    header = b"Content-Type: " + result.headers.get("Content-Type", "").encode() + b"\r\n\r\n"
    message = email.message_from_bytes(header + result.content)
    parts: list[tuple[bytes, str]] = []
    for part in message.walk():
        if not part.get_content_type().startswith("audio/"):
            continue
        data = part.get_payload(decode=True)
        if isinstance(data, bytes) and data:
            parts.append((data, part.get_content_type()))
    return parts


def _rms(audio: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(audio, dtype=np.float64)))) if audio.size else 0.0


def _match_level(
    task: str,
    body: dict[str, Any],
    source: np.ndarray,
    source_rate: int,
    result: np.ndarray,
    result_rate: int,
) -> tuple[np.ndarray, dict[str, Any]]:
    """Put an edited result back at the source's level.

    The engine scales every result to full scale. Repaint and extend keep the original
    audio around the new part, so the gain that makes that untouched audio match the
    source exactly is applied to the whole result. Other edits produce new audio, which is
    brought to the source's loudness instead; a single part (an extracted or added
    instrument) is placed 6 LU below it as a starting point, since the engine generates it
    rather than separating it and so its true level in the mix cannot be measured.
    """
    if task in ("repaint", "extend") and source_rate == result_rate:
        offset = (
            int(round(-float(body["repainting_start"]) * result_rate))
            if body["repainting_start"] < 0
            else 0
        )
        start = int(round(max(0.0, float(body["repainting_start"])) * source_rate))
        end = (
            int(round(float(body["repainting_end"]) * source_rate))
            if body["repainting_start"] >= 0
            else 0
        )
        keep = np.ones(len(source), dtype=bool)
        keep[start:end] = False
        reference = source[keep]
        candidate = result[offset : offset + len(source)][keep[: max(0, len(result) - offset)]]
        n = min(len(reference), len(candidate))
        if n > source_rate:  # At least a second of untouched audio to compare.
            ratio = _rms(reference[:n]) / max(_rms(candidate[:n]), 1e-9)
            if 0.25 < ratio < 4.0:
                gain = float(ratio)
                return (result * np.float32(gain)), {
                    "level_match_db": round(20 * math.log10(gain), 2)
                }
        return result, {}
    try:
        target = processing.integrated_lufs(source, source_rate)
        if target is None:
            return result, {}
        target -= PART_BELOW_MIX_LU if task in ("extract", "add_layer") else 0.0
        levelled, info = processing.normalize(result, result_rate, target_lufs=float(target))
        return levelled, {"matched_lufs": round(float(target), 2), **info}
    except EditorError:
        return result, {}
