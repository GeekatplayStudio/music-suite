"""Google Lyria through the Gemini API (Interactions API), with the user's own key.

Off until a Gemini API key is saved. What is sent: the style text, lyrics and settings
as one prompt, to ``generativelanguage.googleapis.com`` only. Every song Google returns
carries an inaudible SynthID watermark. The request and response shapes follow Google's
music-generation guide (API revision 2026-05-20); the guide shows no complete raw
response, so the audio is looked up defensively.
"""

from __future__ import annotations

import base64
import binascii
import json
from typing import Any

import requests

from audioqi.editor import projects
from audioqi.editor.projects import EditorError, ParamError
from audioqi.generation.providers.acestep import KEYS, SECTIONS
from audioqi.generation.providers.base import Output, RunContext
from audioqi.generation.providers.cloud import PRICES_AS_OF, _CloudProvider, refuse
from audioqi.generation.schema import field

GEMINI_HOST = "generativelanguage.googleapis.com"
INTERACTIONS_URL = f"https://{GEMINI_HOST}/v1beta/interactions"
API_REVISION = "2026-05-20"
#: Model id -> label, price per song (Google's pricing page, 2026-11) and WAV support.
MODELS: dict[str, dict[str, Any]] = {
    "lyria-3.5": {"label": "Lyria 3.5 (full song)", "usd": 0.08, "wav": True},
    "lyria-3-clip-preview": {
        "label": "Lyria 3 Clip (30 seconds, preview)",
        "usd": 0.04,
        "wav": False,
    },
}
DEFAULT_MODEL = "lyria-3.5"
MAX_PROMPT_CHARS = 8000


def build_prompt(values: dict[str, Any]) -> str:
    """Lyria takes structure, length, vocals and lyrics in the prompt itself."""
    lines = [str(values.get("caption", "")).strip()]
    facts = []
    if values.get("bpm"):
        facts.append(f"{values['bpm']} BPM")
    if values.get("keyscale"):
        facts.append(f"in {values['keyscale']}")
    if facts:
        lines.append("Tempo and key: " + ", ".join(facts) + ".")
    if values.get("duration") and values.get("model", DEFAULT_MODEL) == DEFAULT_MODEL:
        lines.append(f"Length: about {int(values['duration'])} seconds.")
    lyrics = str(values.get("lyrics", "")).strip()
    if values.get("instrumental") or not lyrics:
        if values.get("instrumental"):
            lines.append("Instrumental only, no vocals.")
    else:
        lines.append("Lyrics:\n" + lyrics)
    prompt = "\n\n".join(line for line in lines if line)
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ParamError(
            f"Style and lyrics together must stay under {MAX_PROMPT_CHARS} characters."
        )
    return prompt


def find_audio(body: Any) -> tuple[bytes, str]:
    """The first audio block and any text (lyrics) in an Interactions response."""
    audio: bytes | None = None
    texts: list[str] = []
    stack = [body]
    while stack:
        node = stack.pop(0)
        if isinstance(node, dict):
            kind = node.get("type")
            if kind == "audio" and isinstance(node.get("data"), str) and audio is None:
                try:
                    audio = base64.b64decode(node["data"], validate=True)
                except (binascii.Error, ValueError):
                    audio = None
            elif kind == "text" and isinstance(node.get("text"), str):
                texts.append(node["text"])
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    if not audio:
        raise EditorError("Lyria finished but returned no audio.", 502)
    return audio, "\n".join(texts)[:6000]


def _suffix(data: bytes) -> str:
    if data[:4] == b"RIFF":
        return ".wav"
    return ".mp3"


class LyriaProvider(_CloudProvider):
    id = "lyria"
    name = "Google Lyria (online service)"
    short = "Google"
    terms_url = "https://ai.google.dev/gemini-api/terms"
    pricing_url = "https://ai.google.dev/gemini-api/docs/pricing"

    def describe(self) -> dict[str, Any]:
        return {
            "tasks": [{"id": "text2music", "label": "New song"}],
            "groups": ["Song", "Lyrics", "Music", "Advanced"],
            "fields": [
                field(
                    "model",
                    "enum",
                    "Song",
                    "Model",
                    default=DEFAULT_MODEL,
                    options=[{"value": m, "label": meta["label"]} for m, meta in MODELS.items()],
                ),
                field(
                    "caption",
                    "text",
                    "Song",
                    "Style description",
                    required=True,
                    min=3,
                    max=1500,
                    multiline=True,
                    help="Genre, mood, instruments and voice. Lyria cannot imitate named artists.",
                ),
                field("instrumental", "bool", "Song", "Instrumental (no vocals)", default=False),
                field(
                    "duration",
                    "float",
                    "Song",
                    "Length (a request, not exact)",
                    min=30,
                    max=300,
                    step=10,
                    unit="s",
                    auto=True,
                    help="Lyria 3.5 aims for this length; the clip model is always 30 seconds.",
                ),
                field(
                    "lyrics",
                    "lyrics",
                    "Lyrics",
                    "Lyrics",
                    max=3500,
                    sections=SECTIONS,
                    help="Use tags such as [Verse] and [Chorus]. Leave empty to let Lyria write them.",
                ),
                field(
                    "bpm", "int", "Music", "Tempo", min=30, max=300, step=1, unit="BPM", auto=True
                ),
                field("keyscale", "enum", "Music", "Key", auto=True, options=KEYS),
                field(
                    "wav",
                    "bool",
                    "Advanced",
                    "Download as WAV",
                    default=True,
                    advanced=True,
                    help="Lossless WAV from Lyria 3.5; otherwise MP3.",
                ),
            ],
        }

    def status(self) -> dict[str, Any]:
        base = super().status()
        if base["ready"]:
            base["message"] += " Every Lyria song carries Google's inaudible SynthID watermark."
        return {
            **base,
            "pricing": {
                "usd_per_song": {m: v["usd"] for m, v in MODELS.items()},
                "as_of": PRICES_AS_OF,
                "url": self.pricing_url,
            },
        }

    def payload(self, values: dict[str, Any]) -> dict[str, Any]:
        model = values.get("model", DEFAULT_MODEL)
        body: dict[str, Any] = {"model": model, "input": build_prompt(values)}
        if values.get("wav", True) and MODELS[model]["wav"]:
            body["response_format"] = {"type": "audio"}
        return body

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        body = self.payload(values)
        headers = {
            "x-goog-api-key": self._key(),
            "Api-Revision": API_REVISION,
            "Content-Type": "application/json",
        }
        if ctx.cancelled():
            raise EditorError("Generation was cancelled.", 409)
        ctx.progress(20.0, "Lyria is composing. This cannot be cancelled once sent.")
        try:
            response = requests.post(
                INTERACTIONS_URL,
                json=body,
                headers=headers,
                timeout=float(projects.SETTINGS.ffmpeg_timeout_seconds or 900),
                stream=True,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            raise EditorError("Google could not be reached. Check the connection.", 502) from exc
        if response.status_code != 200:
            raise refuse("Google", response)
        # Base64 audio inside JSON is about a third larger than the audio itself.
        limit = int(projects.SETTINGS.max_upload_bytes * 1.4) + 1_000_000
        raw = bytearray()
        for chunk in response.iter_content(1024 * 1024):
            raw.extend(chunk)
            if len(raw) > limit:
                response.close()
                raise EditorError("The generated song is larger than the upload limit.", 502)
        try:
            parsed = json.loads(bytes(raw))
        except ValueError as exc:
            raise EditorError("Google returned an unreadable answer.", 502) from exc
        ctx.progress(86.0, "Receiving the song.")
        audio, lyrics = find_audio(parsed)
        meta = {
            "model": MODELS[body["model"]]["label"],
            "caption": values.get("caption"),
            "lyrics": lyrics or values.get("lyrics", ""),
            "bpm": values.get("bpm"),
            "keyscale": values.get("keyscale"),
            "watermark": "SynthID",
        }
        return [Output(data=audio, suffix=_suffix(audio), meta=meta)]

    def estimate(
        self, task: str, values: dict[str, Any], source_seconds: float | None, stored: bool
    ) -> dict[str, Any]:
        model = values.get("model", DEFAULT_MODEL)
        usd = float(MODELS.get(model, MODELS[DEFAULT_MODEL])["usd"])
        return {
            "usd": usd,
            "summary": f"About ${usd:.2f} on your Google account (one {MODELS[model]['label']} song).",
            "as_of": PRICES_AS_OF,
            "url": self.pricing_url,
        }
