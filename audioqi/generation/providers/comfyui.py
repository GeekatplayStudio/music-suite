"""Short instrumental parts with MusicGen through a local ComfyUI (the original generator)."""

from __future__ import annotations

from typing import Any

from audioqi.editor import generation as comfy
from audioqi.generation.providers.base import Output, RunContext
from audioqi.generation.schema import field


class ComfyUiProvider:
    id = "comfyui_musicgen"
    name = "MusicGen through ComfyUI (on this computer)"
    kind = "local"

    def status(self) -> dict[str, Any]:
        current = comfy.status()
        ready = bool(current["available"] and current["node_installed"])
        if ready:
            message = "Ready. Uses the ComfyUI running on this computer."
        elif current["available"]:
            message = "ComfyUI is running, but the Sonic Holodeck nodes are not installed in it."
        else:
            message = "ComfyUI is not running."
        return {"ready": ready, "message": message, "models": {"musicgen": current["models"]}}

    def describe(self) -> dict[str, Any]:
        models = comfy.status()["models"] or [comfy.DEFAULT_MODEL]
        return {
            "tasks": [{"id": "text2music", "label": "Instrumental part"}],
            "groups": ["Part"],
            "fields": [
                field(
                    "prompt",
                    "text",
                    "Part",
                    "Describe the part",
                    required=True,
                    min=3,
                    max=400,
                    multiline=True,
                ),
                field(
                    "seconds",
                    "int",
                    "Part",
                    "Length",
                    min=2,
                    max=comfy.MAX_SECONDS,
                    step=1,
                    unit="s",
                    default=15,
                ),
                field(
                    "bpm", "int", "Part", "Tempo", min=60, max=200, step=1, unit="BPM", default=120
                ),
                field(
                    "model",
                    "model",
                    "Part",
                    "Model",
                    default=models[0],
                    options=[{"value": name, "label": name} for name in models],
                ),
            ],
        }

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        outcome = comfy.generate(
            ctx.project_id,
            prompt=values["prompt"],
            bpm=int(values.get("bpm", 120)),
            seconds=int(values.get("seconds", 15)),
            model=str(values.get("model", comfy.DEFAULT_MODEL)),
            parent_id=ctx.parent_id,
            progress=ctx.progress,
        )
        return [Output(asset=outcome["asset"], meta={"model": outcome["model"]})]
