"""Music style analysis for the Song Geometry Mapper.

Turns the descriptors the mapper already extracts into a readable description
of what a track sounds like. Two engines, in order of preference:

1. A local Ollama model, if one is running on loopback. It gets the measured
   features and writes the prose.
2. A rule-based description derived directly from the same features.

The rule-based path is not a stub. It always runs, its output is always
returned as ``rule_based``, and the LLM text is presented alongside it rather
than instead of it - so the user can always see which claims come from
measurement and which from a language model. If Ollama is absent, slow, or
returns nonsense, the feature-derived description is still there.

Ported from the Geekatplay MusicMapper ComfyUI node; the descriptor thresholds
and the prompt shape come from that implementation.

Network policy: loopback only, with explicit connect/read timeouts and an
output-token budget, per GUARDRAILS.md.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

import requests

logger = logging.getLogger("audioqi.music_style")

DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]"}

# Models we would rather use, best first. Anything vision- or embedding-only is
# useless here, so those are excluded outright rather than ranked low.
PREFERRED_MODELS = (
    "llama3.1",
    "llama3",
    "qwen2.5",
    "gemma3",
    "mistral",
    "phi3",
)
UNSUITABLE_MODEL_MARKERS = ("embed", "llava", "vision", "coder", "-base")

# Budgets. A style sentence is short; there is no reason to let a 30B model
# stream for a minute while the user waits on a spinner.
STATUS_TIMEOUT_SECONDS = 2.5
GENERATE_TIMEOUT_SECONDS = 45.0
MAX_OUTPUT_TOKENS = 320


class StyleAnalysisError(RuntimeError):
    """Raised when a request is refused for policy reasons, not for failure."""


def _require_loopback(url: str) -> str:
    """Rejects any non-loopback Ollama endpoint. See GUARDRAILS.md."""
    parsed = urlparse(url if "://" in url else f"http://{url}")
    host = (parsed.hostname or "").lower()
    if host not in LOOPBACK_HOSTS:
        raise StyleAnalysisError(
            f"Ollama host {host!r} is not loopback. Music Suite only talks to a local model."
        )
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def list_models(base_url: str = DEFAULT_OLLAMA_URL) -> list[str]:
    """Model names currently installed, or an empty list if Ollama is not up."""
    root = _require_loopback(base_url)
    try:
        response = requests.get(f"{root}/api/tags", timeout=STATUS_TIMEOUT_SECONDS)
        if response.status_code != 200:
            return []
        payload = response.json()
    except (requests.RequestException, ValueError):
        return []

    models = payload.get("models")
    if not isinstance(models, list):
        return []
    return [str(entry.get("name")) for entry in models if isinstance(entry, dict) and entry.get("name")]


def choose_model(available: list[str], requested: str = "") -> str | None:
    """
    Picks a model to use.

    An explicit request wins if it is installed, including the common case
    where the user typed ``llama3`` and the tag is ``llama3:latest``. Otherwise
    the first preferred family present is used, and failing that any model that
    is not obviously unsuitable - a vision, embedding or code model will not
    write a useful description of music.
    """
    if not available:
        return None

    if requested:
        wanted = requested.strip()
        for name in available:
            if name == wanted or name.split(":", 1)[0] == wanted.split(":", 1)[0]:
                return name

    def usable(name: str) -> bool:
        lowered = name.lower()
        return not any(marker in lowered for marker in UNSUITABLE_MODEL_MARKERS)

    for family in PREFERRED_MODELS:
        for name in available:
            if usable(name) and name.lower().startswith(family):
                return name

    for name in available:
        if usable(name):
            return name
    return None


def ollama_status(base_url: str = DEFAULT_OLLAMA_URL, requested_model: str = "") -> dict[str, Any]:
    """Whether a local model is reachable, and which one would be used."""
    try:
        root = _require_loopback(base_url)
    except StyleAnalysisError as exc:
        return {"running": False, "models": [], "model": None, "url": base_url, "error": str(exc)}

    models = list_models(root)
    if not models:
        return {
            "running": False,
            "models": [],
            "model": None,
            "url": root,
            "error": "No response from Ollama on loopback.",
        }

    return {
        "running": True,
        "models": models,
        "model": choose_model(models, requested_model),
        "url": root,
        "error": None,
    }


def _describe(value: float, bands: tuple[tuple[float, str], ...], default: str) -> str:
    for threshold, text in bands:
        if value < threshold:
            return text
    return default


def describe_features(features: dict[str, Any]) -> dict[str, str]:
    """Plain-language reading of each measured feature."""
    tempo = float(features.get("tempo_bpm") or 0.0)
    centroid = float(features.get("centroid_hz") or 0.0)
    zcr = float(features.get("zcr") or 0.0)
    rms = float(features.get("rms") or 0.0)
    flatness = float(features.get("flatness") or 0.0)
    key = str(features.get("key") or "")

    tempo_text = _describe(
        tempo,
        (
            (75, "slow and lingering, with long sustained gestures"),
            (100, "relaxed and steady, with a laid-back groove"),
            (120, "a walking mid-tempo with an active pulse"),
            (140, "upbeat and driving, with prominent metric accents"),
        ),
        "fast-paced, with dense rhythmic activity",
    )
    brightness_text = _describe(
        centroid,
        (
            (1200, "dark and bass-weighted, with muted upper harmonics"),
            (2400, "balanced through the mid-range, with a natural spectral tilt"),
        ),
        "bright and treble-forward, with crisp high-frequency detail",
    )
    texture_text = _describe(
        zcr,
        (
            (0.04, "smooth and tonal, dominated by sustained melodic lines"),
            (0.12, "a mix of tonal and percussive material, with defined transients"),
        ),
        "highly percussive or noisy, with sharp attacks and dense transient content",
    )
    dynamics_text = _describe(
        rms,
        (
            (0.015, "quiet and intimate, with a delicate dynamic profile"),
            (0.08, "moderate and controlled, with usable headroom"),
        ),
        "loud and heavily compressed, with a wall-of-sound density",
    )
    noise_text = _describe(
        flatness,
        (
            (0.05, "strongly pitched, with clear harmonic structure"),
            (0.2, "mostly pitched, with some noise content"),
        ),
        "noise-dominated, with little stable pitch",
    )

    if "minor" in key.lower():
        tonality_text = "an introspective, minor-key harmonic centre"
    elif key:
        tonality_text = "a bright, major-key harmonic centre"
    else:
        tonality_text = "no clearly established tonal centre"

    return {
        "tempo": tempo_text,
        "brightness": brightness_text,
        "texture": texture_text,
        "dynamics": dynamics_text,
        "noise": noise_text,
        "tonality": tonality_text,
    }


def rule_based_report(features: dict[str, Any]) -> str:
    """
    A description built only from measured values.

    Every clause traces to a number, and anything that was not measured
    confidently is simply omitted rather than filled in with a plausible guess.
    """
    described = describe_features(features)
    tempo = features.get("tempo_bpm")
    key = features.get("key")
    centroid = float(features.get("centroid_hz") or 0.0)
    rms = float(features.get("rms") or 0.0)

    parts: list[str] = []

    if tempo:
        parts.append(f"The track runs at about {float(tempo):.0f} BPM - {described['tempo']}.")
    else:
        parts.append("No steady pulse could be measured, so the material is either free-time or rhythmically ambiguous.")

    if key:
        parts.append(f"It centres on {key}, giving it {described['tonality']}.")
    else:
        parts.append("No pitch class stands out enough to name a key, so it has " + described["tonality"] + ".")

    parts.append(
        f"Spectrally the centroid averages {centroid:.0f} Hz, making it {described['brightness']}."
    )
    parts.append(f"Texturally it is {described['texture']}, and {described['noise']}.")
    parts.append(f"At a mean RMS of {rms:.4f} the level is {described['dynamics']}.")

    bands = features.get("bands") or {}
    low = float(bands.get("low") or 0.0)
    mid = float(bands.get("mid") or 0.0)
    high = float(bands.get("high") or 0.0)
    if low or mid or high:
        dominant = max((low, "low"), (mid, "mid"), (high, "high"))[1]
        parts.append(
            f"Energy splits roughly {low * 100:.0f}% low / {mid * 100:.0f}% mid / "
            f"{high * 100:.0f}% high, so the {dominant} band carries the mix."
        )

    return " ".join(parts)


def _build_prompt(features: dict[str, Any], style: str, extra_context: str) -> str:
    described = describe_features(features)
    tempo = features.get("tempo_bpm")
    key = features.get("key") or "not clearly established"
    bands = features.get("bands") or {}

    measured = "\n".join(
        [
            f"- Tempo: {f'{float(tempo):.1f} BPM' if tempo else 'no steady pulse detected'}",
            f"- Key: {key}",
            f"- Spectral centroid: {float(features.get('centroid_hz') or 0):.0f} Hz ({described['brightness']})",
            f"- Spectral rolloff (85%): {float(features.get('rolloff_hz') or 0):.0f} Hz",
            f"- Spectral flatness: {float(features.get('flatness') or 0):.4f} ({described['noise']})",
            f"- Zero crossing rate: {float(features.get('zcr') or 0):.4f} ({described['texture']})",
            f"- Mean RMS: {float(features.get('rms') or 0):.4f} ({described['dynamics']})",
            f"- Band energy: low {float(bands.get('low') or 0):.2f}, "
            f"mid {float(bands.get('mid') or 0):.2f}, high {float(bands.get('high') or 0):.2f}",
            f"- Duration: {float(features.get('duration_seconds') or 0):.1f} s",
        ]
    )

    if style == "tags":
        instruction = (
            "Write a single comma-separated list of music style tags: genre, sub-genre, "
            "instrumentation, mood, production character, tempo and key. No preamble, no "
            "headings, no bullet points, no explanation. Output only the tags."
        )
    else:
        instruction = (
            "Write two short paragraphs describing what this piece most likely sounds like: "
            "probable genre and sub-genre, likely instrumentation, mood, and production "
            "character. No headings and no bullet points."
        )

    guard = (
        "These are DSP measurements of one audio file, not metadata. Base every claim on "
        "them. Where they are ambiguous, say the style is uncertain rather than inventing "
        "an artist, title, year, or lyric. Never name a real recording or performer."
    )

    context = f"\nAdditional context from the user: {extra_context.strip()}" if extra_context.strip() else ""

    return (
        f"You are a music analyst. {guard}\n\n"
        f"Measured features:\n{measured}{context}\n\n{instruction}"
    )


def analyze_music_style(
    features: dict[str, Any],
    *,
    base_url: str = DEFAULT_OLLAMA_URL,
    model: str = "",
    style: str = "prose",
    extra_context: str = "",
) -> dict[str, Any]:
    """
    Describes a track's style.

    Always returns the rule-based description. Adds an LLM description when a
    local model answers in time. Never raises for an unavailable model - an
    absent Ollama is an expected state, not an error.
    """
    baseline = rule_based_report(features)
    status = ollama_status(base_url, model)

    result: dict[str, Any] = {
        "ok": True,
        "engine": "rule_based",
        "model": None,
        "text": baseline,
        "rule_based": baseline,
        "ollama_running": bool(status.get("running")),
        "available_models": status.get("models", []),
        "note": None,
    }

    if not status.get("running"):
        result["note"] = "Ollama is not running on loopback; showing the measured description only."
        return result

    chosen = status.get("model")
    if not chosen:
        result["note"] = "Ollama is running but has no model suited to text description installed."
        return result

    prompt = _build_prompt(features, style, extra_context)
    try:
        response = requests.post(
            f"{status['url']}/api/generate",
            json={
                "model": chosen,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.6, "num_predict": MAX_OUTPUT_TOKENS},
            },
            timeout=GENERATE_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.info("Ollama style request failed: %s", exc)
        result["note"] = f"Ollama did not answer ({exc.__class__.__name__}); showing the measured description."
        return result

    if response.status_code != 200:
        result["note"] = f"Ollama returned HTTP {response.status_code}; showing the measured description."
        return result

    try:
        payload = response.json()
    except ValueError:
        result["note"] = "Ollama returned a malformed response; showing the measured description."
        return result

    text = str(payload.get("response") or "").strip()
    if not text and isinstance(payload.get("message"), dict):
        text = str(payload["message"].get("content") or "").strip()

    # A one-word answer is a failed generation, not a style description.
    if len(text) < 24:
        result["note"] = "The model returned too little text to be useful; showing the measured description."
        return result

    result["engine"] = "ollama"
    result["model"] = chosen
    result["text"] = text
    return result
