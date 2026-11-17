"""Writes an arrangement as notes: the suite's symbolic generator.

Every other provider returns audio. This one returns notes, which land in the Studio Editor
as instrument tracks that can be edited in the piano roll, read as sheet music, played
through a SoundFont or Surge XT, and written out as a MIDI file.

It loads no model and contacts nothing by default, so it is instant and always available. A
free-text idea is the one optional exception: when Ollama is running it is asked to choose a
style, key, tempo and form from the description, and the answer is checked against this
provider's own lists before it is used. Anything the user set themselves wins, and a failure
falls back to the plain defaults rather than stopping the job.
"""

from __future__ import annotations

import json
import random
from typing import Any

import requests

from audioqi.editor.projects import EditorError
from audioqi.generation import arranger, resources, settings
from audioqi.generation.providers.base import Output, RunContext
from audioqi.generation.schema import field

MAX_BARS = 200
OLLAMA_TIMEOUT_SECONDS = 60.0
MAX_OUTPUT_TOKENS = 200

#: What the local language model is allowed to answer with.
IDEA_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "style": {"type": "string", "enum": sorted(arranger.STYLES)},
        "key": {"type": "string", "enum": arranger.KEYS},
        "bpm": {"type": "integer"},
        "form": {"type": "string", "enum": sorted(arranger.FORMS)},
    },
    "required": ["style", "key", "bpm", "form"],
}

IDEA_PROMPT = """You are arranging an original instrumental piece. Choose settings only.

The idea:
{idea}

Answer with JSON:
- "style": one of {styles}
- "key": a key such as "A minor" or "F# major"
- "bpm": a whole number between 50 and 200 that suits the idea
- "form": one of {forms}"""


def plan_from_idea(idea: str, model: str) -> dict[str, Any]:
    """Ask the local model for a style, key, tempo and form. Returns {} if it cannot."""
    prompt = IDEA_PROMPT.format(
        idea=idea[:400],
        styles=", ".join(sorted(arranger.STYLES)),
        forms=", ".join(sorted(arranger.FORMS)),
    )
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "think": False,
        "format": IDEA_SCHEMA,
        "keep_alive": "2m",
        "options": {"temperature": 0.7, "num_predict": MAX_OUTPUT_TOKENS},
    }
    try:
        response = requests.post(
            f"{resources.OLLAMA}/api/generate", json=payload, timeout=OLLAMA_TIMEOUT_SECONDS
        )
        if response.status_code != 200:
            return {}
        raw = json.loads(response.json().get("response") or "")
    except (requests.RequestException, ValueError, TypeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    # The model is only ever trusted as far as this provider's own lists allow.
    chosen: dict[str, Any] = {}
    if raw.get("style") in arranger.STYLES:
        chosen["style"] = raw["style"]
    if raw.get("form") in arranger.FORMS:
        chosen["form"] = raw["form"]
    key = arranger.canonical_key(raw.get("key"))
    if key:
        chosen["key"] = key
    bpm = raw.get("bpm")
    if isinstance(bpm, (int, float)) and not isinstance(bpm, bool) and 40 <= bpm <= 240:
        chosen["bpm"] = round(bpm)
    return chosen


class ArrangerProvider:
    id = "arranger"
    name = "Arranger — writes notes on this computer"
    kind = "local"
    #: No model is loaded, so the memory guard has nothing to protect.
    needs_memory = False

    def status(self) -> dict[str, Any]:
        return {
            "ready": True,
            "message": (
                "Ready. Writes notes from music theory on this computer: no model is loaded, "
                "nothing is downloaded, and the same seed always gives the same arrangement."
            ),
            "output": "notes",
        }

    def describe(self) -> dict[str, Any]:
        styles = [
            {"value": key, "label": style.label} for key, style in sorted(arranger.STYLES.items())
        ]
        forms = [
            {"value": name, "label": " · ".join(role.capitalize() for role in roles)}
            for name, roles in arranger.FORMS.items()
        ]
        parts = [
            ("drums", "Drums"),
            ("bass", "Bass"),
            ("chords", "Chords"),
            ("melody", "Melody"),
            ("pad", "Pad"),
            ("arp", "Arpeggio"),
        ]
        return {
            # Notes, not audio: the editor makes instrument tracks out of the result.
            "output": "notes",
            "tasks": [{"id": "arrange", "label": "Write an arrangement", "source": False}],
            "groups": ["Song", "Metre", "Parts", "Variation"],
            "fields": [
                field(
                    "idea",
                    "text",
                    "Song",
                    "Describe it (optional)",
                    max=400,
                    multiline=True,
                    help=(
                        "A local language model picks the style, key, tempo and form from this "
                        "when Ollama is running. Anything you set below wins."
                    ),
                ),
                field("style", "enum", "Song", "Style", default="pop", options=styles),
                field("form", "enum", "Song", "Form", default="verse-chorus", options=forms),
                field(
                    "key",
                    "enum",
                    "Song",
                    "Key",
                    auto=True,
                    options=[{"value": key, "label": key} for key in arranger.KEYS],
                ),
                field(
                    "bpm", "int", "Song", "Tempo", min=40, max=240, step=1, unit="BPM", auto=True
                ),
                field(
                    "bars",
                    "int",
                    "Song",
                    "Length",
                    min=4,
                    max=MAX_BARS,
                    step=4,
                    unit="bars",
                    default=32,
                ),
                field(
                    "beats_per_bar",
                    "int",
                    "Metre",
                    "Beats in a bar",
                    min=2,
                    max=12,
                    step=1,
                    default=4,
                ),
                field(
                    "beat_unit",
                    "enum",
                    "Metre",
                    "A beat is",
                    default="4",
                    options=[
                        {"value": "4", "label": "a quarter note (4/4, 3/4)"},
                        {"value": "8", "label": "an eighth note (6/8, 12/8)"},
                    ],
                ),
                *[
                    field(f"part_{key}", "bool", "Parts", label, default=True)
                    for key, label in parts
                ],
                field("seed", "seed", "Variation", "Seed", auto=True),
                field(
                    "density",
                    "float",
                    "Variation",
                    "Busyness",
                    min=0.0,
                    max=1.0,
                    step=0.05,
                    default=0.5,
                ),
            ],
        }

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        del task  # Only "arrange" reaches here, and the schema has already checked it.
        chosen: dict[str, Any] = {}
        idea = str(values.get("idea") or "").strip()
        if idea:
            ctx.progress(20, "Reading the idea.")
            chosen = plan_from_idea(idea, str(settings.load()["writer_model"]))

        # Anything the user set themselves beats what the model suggested.
        style = str(values.get("style") or chosen.get("style") or "pop")
        form = str(values.get("form") or chosen.get("form") or "verse-chorus")
        key = str(values.get("key") or chosen.get("key") or "C major")
        bpm = values.get("bpm") or chosen.get("bpm")
        parts = {name for name in arranger.PARTS if values.get(f"part_{name}", True)}
        if not parts:
            parts = set(arranger.PARTS)
        seed = values.get("seed")
        if seed is None or int(seed) < 0:
            seed = random.SystemRandom().randrange(0, 2**32)

        ctx.progress(45, "Choosing the chords and writing the parts.")
        result = arranger.arrange(
            style=style,
            key=key,
            bpm=float(bpm) if bpm else None,
            beats_per_bar=int(values.get("beats_per_bar", 4)),
            beat_unit=int(values.get("beat_unit", "4")),
            form=form,
            bars=int(values.get("bars", 32)),
            parts=parts,
            seed=int(seed),
            density=float(values.get("density", 0.5)),
        )
        if not result["tracks"]:
            raise EditorError("That combination of parts wrote no notes. Switch a part on.")

        ctx.progress(85, f"Wrote {len(result['tracks'])} parts.")
        meta = {key: value for key, value in result.items() if key != "tracks"}
        meta["note_count"] = sum(len(track["notes"]) for track in result["tracks"])
        meta["from_idea"] = bool(idea and chosen)
        return [Output(tracks=result["tracks"], suffix=".mid", normalize=False, meta=meta)]
