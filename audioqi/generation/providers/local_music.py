"""Model-specific controls and isolated local rendering jobs."""

import math
import os
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from audioqi.editor import projects
from audioqi.editor.projects import EditorError, ParamError
from audioqi.generation import local_runtimes as runtimes
from audioqi.generation.providers.acestep import SECTIONS
from audioqi.generation.providers.base import Output, RunContext
from audioqi.generation.schema import field
from audioqi.generation.worker_process import terminate

NAMES = {
    "stable_audio3": "Stable Audio 3",
    "heartmula": "HeartMuLa 3B",
    "minimax3": "MiniMax Music 3",
    "magenta_rt2": "Magenta RealTime 2",
    "diffrhythm": "DiffRhythm",
}


def choice(key, label, options, default, group="Rendering"):
    return field(
        key,
        "enum",
        group,
        label,
        options=[dict(value=o, label=o) for o in options],
        default=default,
    )


def number(key, label, low, high, default, step=1, **extra):
    return field(
        key,
        "int" if step == 1 else "float",
        "Rendering",
        label,
        min=low,
        max=high,
        default=default,
        step=step,
        **extra,
    )


class LocalMusicProvider:
    kind = "local"

    def __init__(self, key):
        self.id = key
        self.name = NAMES[key]

    def status(self):
        supported = runtimes.model_catalog.support(self.id)
        if not supported["supported"]:
            return {"ready": False, "message": supported["reason"]}
        ready = runtimes.active(self.id) is not None
        return {
            "ready": ready,
            "message": "Runtime installed. Generate to use the selected checkpoint."
            if ready
            else "Install this engine in Local model downloads.",
        }

    def describe(self):
        tasks = [dict(id="text2music", label="Generate music")]
        fields = [
            field(
                "caption",
                "text",
                "Music",
                "Style tags" if self.id == "heartmula" else "Music description",
                multiline=True,
                min=1,
                max=4000,
                required=True,
            )
        ]
        if self.id in ("heartmula", "minimax3", "diffrhythm"):
            timed = self.id == "diffrhythm"
            fields.append(
                field(
                    "lyrics",
                    "lyrics",
                    "Lyrics",
                    "Timed lyrics (LRC)" if timed else "Lyrics",
                    max=12000,
                    sections=[] if timed else SECTIONS,
                    format="lrc" if timed else "plain",
                    help="Use [mm:ss.xx] before each sung line."
                    if timed
                    else "Write lyrics or use the local lyrics writer.",
                )
            )
        times = {
            "diffrhythm": (95, 285, 95),
            "magenta_rt2": (2, 120, 4),
            "stable_audio3": (1, 380, 30),
            "heartmula": (1, 240, 120),
            "minimax3": (1, 300, 60),
        }
        if self.id == "diffrhythm":
            fields.append(choice("duration", "Duration (seconds)", ["95", "285"], "95"))
        else:
            fields.append(number("duration", "Duration", *times[self.id], unit="s"))
        if self.id == "stable_audio3":
            tasks += [
                dict(id=k, label=v, source=True)
                for k, v in [
                    ("restyle", "Restyle audio"),
                    ("inpaint", "Regenerate region"),
                    ("continue", "Continue audio"),
                ]
            ]
            fields += [
                choice(
                    "model",
                    "Checkpoint",
                    [
                        "medium",
                        "small-music",
                        "small-sfx",
                        "medium-base",
                        "small-music-base",
                        "small-sfx-base",
                    ],
                    runtimes.manifest(self.id).get("variant") or "medium",
                ),
                field("negative_prompt", "text", "Music", "Avoid", max=2000),
                number("steps", "Sampling steps", 1, 200, 8),
                number("cfg_scale", "Guidance", 0, 30, 1, 0.1),
                number("noise", "Source variation", 0, 1, 0.9, 0.01, tasks=["restyle"]),
                number("start", "Region start (seconds)", 0, 380, 0, 0.1, tasks=["inpaint"]),
                number("end", "Region end (seconds)", 0, 380, 4, 0.1, tasks=["inpaint"]),
                field("seed", "seed", "Rendering", "Seed", default=-1),
                field("chunked", "bool", "Rendering", "Decode in chunks", default=False),
                choice("device", "Device", ["auto", "cuda", "cpu", "mps"], "auto"),
                field("full_precision", "bool", "Rendering", "Use full precision", default=False),
                number("batch_size", "Versions", 1, 8, 1),
                field(
                    "loras",
                    "text",
                    "Adapters",
                    "LoRA checkpoint filenames",
                    multiline=True,
                    max=2000,
                    help=(
                        "One filename per line from this engine's adapters folder. No "
                        "folders or paths."
                    ),
                ),
                field(
                    "lora_strength",
                    "float",
                    "Adapters",
                    "LoRA strength",
                    min=0,
                    max=2,
                    step=0.05,
                    default=1.0,
                ),
                field(
                    "lora_index",
                    "int",
                    "Adapters",
                    "LoRA index (optional)",
                    min=0,
                    max=7,
                    auto=True,
                ),
                field(
                    "regions",
                    "text",
                    "Rendering",
                    "Additional inpaint regions (JSON)",
                    max=2000,
                    tasks=["inpaint"],
                    help=(
                        "Optional list of [start,end] seconds. Overrides the single region "
                        "controls."
                    ),
                ),
            ]
        if self.id == "heartmula":
            fields += [
                choice("version", "Model version", ["3B"], "3B"),
                field("seed", "seed", "Rendering", "Seed", default=-1),
                number("topk", "Top K", 1, 1024, 50),
                number("temperature", "Temperature", 0.01, 3, 1, 0.01),
                number("cfg_scale", "Guidance", 0, 15, 3, 0.1),
                field(
                    "lazy_load",
                    "bool",
                    "Rendering",
                    "Load song model and codec in sequence",
                    default=True,
                ),
            ]
            for part in ("mula", "codec"):
                fields += [
                    choice(
                        part + "_device",
                        part.capitalize() + " device",
                        ["cuda", "cuda:0", "cuda:1", "cpu", "mps"],
                        "cuda",
                    ),
                    choice(
                        part + "_dtype",
                        part.capitalize() + " precision",
                        ["float32", "float16", "bfloat16"],
                        "float32" if part == "codec" else "bfloat16",
                    ),
                ]
        if self.id == "diffrhythm":
            tasks += [
                dict(id="inpaint", label="Edit song regions", source=True),
                dict(id="reference", label="Generate in a reference style", source=True),
            ]
            fields += [
                field("seed", "seed", "Rendering", "Seed", default=-1),
                field("chunked", "bool", "Rendering", "Decode in chunks", default=True),
                number("batch", "Candidates per render", 1, 8, 1),
                field(
                    "edit_segments",
                    "text",
                    "Music",
                    "Edit regions (seconds)",
                    help=(
                        "JSON pairs, for example [[10,20],[40,50]]. The rest of the source "
                        "is retained."
                    ),
                    tasks=["inpaint"],
                    required_tasks=["inpaint"],
                    max=2000,
                ),
            ]
        if self.id == "magenta_rt2":
            tasks += [dict(id="reference", label="Generate from reference sound", source=True)]
            fields += [
                choice("model", "Checkpoint", ["mrt2_small", "mrt2_base"], "mrt2_small"),
                number("temperature", "Temperature", 0.01, 3, 1.3, 0.01),
                number("top_k", "Top K", 1, 1024, 40),
                number("cfg_musiccoca", "Style guidance", -1, 7, 3, 0.1),
                number("cfg_notes", "Note guidance", -1, 7, 1, 0.1),
                number("cfg_drums", "Drum guidance", -1, 7, 1, 0.1),
            ]
        if self.id == "minimax3":
            fields += [
                field("seed", "seed", "Rendering", "Seed", default=-1),
                choice("offload", "Memory use", ["auto-cpu", "layer", "gpu"], "auto-cpu"),
                choice("precision", "Precision", ["bfloat16", "float16", "float32"], "bfloat16"),
            ]
        return dict(
            tasks=tasks,
            groups=[
                g
                for g in ("Music", "Lyrics", "Rendering", "Adapters")
                if any(f["group"] == g for f in fields)
            ],
            fields=fields,
        )

    def generate(self, task, values, ctx: RunContext):
        import json

        defaults = {
            f["key"]: f["default"]
            for f in self.describe()["fields"]
            if "default" in f and task in f.get("tasks", [task])
        }
        values = {**defaults, **values}
        self.validate_params(task, values)
        folder = runtimes.active(self.id)
        if folder is None:
            raise EditorError(self.status()["message"], 409)
        installed = runtimes.manifest(self.id)
        variant = (
            values.get("model")
            if self.id in ("stable_audio3", "magenta_rt2")
            else str(values["duration"])
            if self.id == "diffrhythm"
            else runtimes.model_catalog.SOURCES[self.id]["default"]
        )
        if installed and variant not in installed.get("installed_variants", []):
            raise EditorError(
                "Review and download this checkpoint in Local model downloads before rendering.",
                409,
            )
        with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
            work = Path(tmp).resolve()
            request = {
                "nonce": uuid.uuid4().hex,
                "pid_file": str(work / "worker.pid"),
                "id": self.id,
                "task": task,
                "fields": values,
                "source": str(ctx.source.resolve()) if ctx.source else None,
                "runtime": str(folder),
                "checkpoint_root": installed.get("checkpoint_root", str(folder / "checkpoints")),
                "adapters": str(runtimes.home(self.id) / "adapters"),
                "apple": runtimes.APPLE,
                "revisions": {
                    item["repo"]: item["revision"] for item in installed.get("checkpoints", [])
                },
                "cache": str(runtimes.settings.root() / "checkpoints" / "hub"),
            }
            if (folder / "wsl.json").is_file():
                from audioqi.generation import wsl_runtime

                request = wsl_runtime.paths(request)
            (work / "request.json").write_text(json.dumps(request), encoding="utf-8")
            env = {
                **runtimes.environment(self.id, offline=True),
                "PYTHONPATH": str(folder / "source"),
                "HF_HUB_CACHE": request["cache"],
                "HF_HUB_OFFLINE": "1",
                "TRANSFORMERS_OFFLINE": "1",
                "PYTHONUTF8": "1",
                "PYTHONIOENCODING": "utf-8",
            }
            log = work / "worker.log"
            command = [
                str(runtimes.executable(folder, "python")),
                "-I",
                "-X",
                "utf8",
                str(Path(__file__).with_name("local_worker.py").resolve()),
                str(work),
            ]
            if (folder / "wsl.json").is_file():
                command = wsl_runtime.command(folder, *command, offline=True)
                env = wsl_runtime.process_environment(env)
            with log.open("wb") as sink:
                child = subprocess.Popen(
                    command,
                    cwd=folder / "source",
                    env=env,
                    stdout=sink,
                    stderr=sink,
                    stdin=subprocess.DEVNULL,
                    start_new_session=os.name != "nt",
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
                    if os.name == "nt"
                    else 0,
                )
                try:
                    started = time.monotonic()
                    ctx.progress(
                        15,
                        f"Rendering with {self.name} using the downloaded checkpoints.",
                    )
                    while child.poll() is None:
                        if ctx.cancelled() or time.monotonic() - started > 7200:
                            raise EditorError("Local render stopped.", 409)
                        time.sleep(0.5)
                finally:
                    if child.poll() is None:
                        terminate(child, runtime=folder, work=work)
            if child.returncode:
                with log.open("rb") as stream:
                    stream.seek(max(0, log.stat().st_size - 64000))
                    detail = stream.read().decode(errors="replace").strip().splitlines()
                (runtimes.home(self.id) / "render.log").write_text(
                    "\n".join(detail), encoding="utf-8"
                )
                raise EditorError(f"{self.name}: {detail[-1] if detail else 'Worker failed.'}", 502)
            files = sorted(work.glob("output_*.wav")) or [
                work / ("output.wav" if (work / "output.wav").is_file() else "output.mp3")
            ]
            outputs = []
            for audio in files:
                if (
                    not audio.is_file()
                    or not 0 < audio.stat().st_size <= projects.SETTINGS.max_upload_bytes
                ):
                    raise EditorError("The worker did not return a usable audio file.", 502)
                meta = {"model": self.name, "task": task}
                meta["checkpoints"] = [
                    {key: item.get(key) for key in ("repo", "revision", "license", "url")}
                    for item in installed.get("checkpoints", [])
                ]
                if ctx.source and self.id in ("stable_audio3", "diffrhythm"):
                    meta.update(preserve_source(audio, ctx.source, task, values))
                outputs.append(
                    Output(
                        data=audio.read_bytes(),
                        suffix=audio.suffix,
                        meta=meta,
                        normalize=ctx.source is None,
                    )
                )
            return outputs

    def validate_params(self, task, values):
        if self.id == "diffrhythm" and str(values.get("lyrics", "")).strip():
            import re

            previous = -1.0
            for line in str(values["lyrics"]).splitlines():
                if not line.strip():
                    continue
                match = re.fullmatch(r"\[(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)\].*", line.strip())
                if not match:
                    raise ParamError(
                        "DiffRhythm needs timed lyrics. Use Timestamp lyrics, then review "
                        "the line timings."
                    )
                moment = int(match[1]) * 60 + float(match[2])
                if not previous <= moment < float(values.get("duration", 95)):
                    raise ParamError(
                        "Lyric timestamps must be in order and inside the selected duration."
                    )
                previous = moment
        if self.id == "diffrhythm" and task == "inpaint":
            import json

            try:
                segments = json.loads(values.get("edit_segments", ""))
                limit = float(values.get("duration", 95))
                if not isinstance(segments, list) or not 1 <= len(segments) <= 16:
                    raise ValueError()
                for start, end in segments:
                    if not 0 <= float(start) < float(end) <= limit:
                        raise ValueError()
            except (ValueError, TypeError):
                raise ParamError("Enter up to 16 region pairs inside the song duration.") from None
        if self.id == "stable_audio3":
            model = values.get("model", "medium")
            limit = 120 if model.startswith("small") else 380
            if float(values.get("duration", 30)) > limit:
                raise ParamError(f"{model} supports at most {limit} seconds.")
            if (
                task == "inpaint"
                and not values.get("regions")
                and not 0
                <= float(values.get("start", 0))
                < float(values.get("end", 4))
                <= float(values.get("duration", 30))
            ):
                raise ParamError("Choose a region inside the requested duration.")
            names = [line.strip() for line in values.get("loras", "").splitlines() if line.strip()]
            if len(names) > 8 or any(
                Path(name).name != name or "/" in name or "\\" in name for name in names
            ):
                raise ParamError("Choose up to eight LoRA filenames, without folder paths.")
            if values.get("lora_index") is not None and (
                not names or values["lora_index"] >= len(names)
            ):
                raise ParamError("LoRA index must identify one of the selected checkpoints.")
            if values.get("regions"):
                import json

                try:
                    regions = json.loads(values["regions"])
                    if not isinstance(regions, list) or not 1 <= len(regions) <= 16:
                        raise ValueError()
                    for start, end in regions:
                        if not 0 <= float(start) < float(end) <= float(values.get("duration", 30)):
                            raise ValueError()
                except (ValueError, TypeError):
                    raise ParamError(
                        "Choose up to 16 inpaint regions inside the requested duration."
                    ) from None


def preserve_source(output: Path, source: Path, task: str, values: dict) -> dict:
    """Keep original samples outside edits; align the result to source rate and channels."""
    reference, rate = sf.read(source, dtype="float32", always_2d=True)
    rendered, rendered_rate = sf.read(output, dtype="float32", always_2d=True)
    if not rendered.size or not np.isfinite(rendered).all():
        raise EditorError("The model returned invalid audio.", 502)
    if rendered_rate != rate:
        divisor = math.gcd(int(rate), int(rendered_rate))
        rendered = resample_poly(rendered, rate // divisor, rendered_rate // divisor, axis=0)
    if rendered.shape[1] != reference.shape[1]:
        rendered = np.repeat(rendered.mean(axis=1, keepdims=True), reference.shape[1], axis=1)
    meta = {"source_seconds": len(reference) / rate}
    if task == "continue":
        if len(rendered) <= len(reference):
            raise EditorError("The model returned no continuation beyond the source.", 502)
        rendered[: len(reference)] = reference
        meta.update(extend_at="end", extended_seconds=(len(rendered) - len(reference)) / rate)
    elif task == "inpaint":
        import json

        regions = (
            json.loads(values.get("regions") or values.get("edit_segments"))
            if values.get("regions") or values.get("edit_segments")
            else [[values["start"], values["end"]]]
        )
        combined = reference.copy()
        for start, end in regions:
            start, end = round(float(start) * rate), round(float(end) * rate)
            if not 0 <= start < end <= len(reference) or len(rendered) < end:
                raise EditorError("The regenerated region is outside the source or result.", 422)
            combined[start:end] = rendered[start:end]
        rendered = combined
        meta["regions"] = regions
    sf.write(output, rendered, rate, subtype="FLOAT")
    return meta
