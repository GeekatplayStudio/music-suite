"""Local song generation with acestep.cpp (ACE-Step 1.5, MIT)."""

from __future__ import annotations

import email
import time
from typing import Any

import requests

from audioqi.editor.projects import EditorError
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
                required=True,
                min=3,
                max=1500,
                multiline=True,
                help="Genre, mood, instruments, voice and production, in plain words.",
            ),
            field("instrumental", "bool", "Song", "Instrumental (no vocals)", default=False),
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
            ),
            field(
                "lyrics",
                "lyrics",
                "Lyrics",
                "Lyrics",
                max=6000,
                sections=SECTIONS,
                help="Use tags such as [Verse] and [Chorus]. Leave empty to let the model write them.",
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
            ),
            field(
                "use_cot_caption",
                "bool",
                "Advanced",
                "Let the planner rewrite the style",
                default=False,
                advanced=True,
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
        return {
            "tasks": [{"id": "text2music", "label": "New song"}],
            "groups": ["Song", "Lyrics", "Music", "Variations", "Advanced"],
            "fields": fields,
        }

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
    ) -> requests.Response:
        try:
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
            fraction = min(0.97, elapsed / max(1.0, expected))
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
            result = requests.get(f"{base}/job", params={"id": job_id, "result": "1"}, timeout=300.0)
        except requests.RequestException as exc:
            raise EditorError("The result could not be fetched from the AI engine.", 502) from exc
        if result.status_code != 200:
            raise EditorError("The AI engine returned no result.", 502)
        return result

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
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
        header = b"Content-Type: " + result.headers.get("Content-Type", "").encode() + b"\r\n\r\n"
        message = email.message_from_bytes(header + result.content)
        seed = body.get("seed")
        outputs: list[Output] = []
        for part in message.walk():
            if not part.get_content_type().startswith("audio/"):
                continue
            data = part.get_payload(decode=True)
            if not isinstance(data, bytes) or not data:
                continue
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
            suffix = ".mp3" if part.get_content_type() == "audio/mpeg" else ".wav"
            outputs.append(Output(data=data, suffix=suffix, meta=meta))
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
