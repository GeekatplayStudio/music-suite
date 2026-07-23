from __future__ import annotations

import json
import logging
from typing import Any

import requests

logger = logging.getLogger("audioqi.ollama")

OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/generate"
DEFAULT_MODEL = "llama3"


def ollama_available() -> bool:
    try:
        resp = requests.get("http://127.0.0.1:11434/", timeout=2.0)
        return resp.status_code == 200
    except requests.RequestException:
        return False


def get_ai_mastering_advice(metrics: dict[str, Any], model: str = DEFAULT_MODEL) -> dict[str, Any] | None:
    if not ollama_available():
        logger.info("Ollama is not running locally. Skipping AI advice generation.")
        return None

    technical = metrics.get("technical", {})
    loudness = metrics.get("loudness", {})
    dynamics = metrics.get("dynamics", {})
    spectral = metrics.get("spectral_balance", {})

    prompt = f"""
    You are an expert Audio Mastering Engineer. Review the following audio analysis metrics and provide a concise, structured mastering advice.

    AUDIO METRICS:
    - Duration: {technical.get('duration_seconds', 0):.2f} seconds
    - Channels: {technical.get('channels', 2)}
    - Integrated Loudness: {loudness.get('integrated_lufs', 0):.2f} LUFS
    - Loudness Range (LRA): {loudness.get('lra_approx', 0):.2f} LU
    - True Peak Estimate: {dynamics.get('true_peak_dbfs', 0):.2f} dBFS
    - Crest Factor: {dynamics.get('crest_factor_db', 0):.2f} dB
    - Noise Floor: {metrics.get('noise_floor_dbfs', 0):.2f} dBFS
    - Sub-bass (20-60Hz) Energy Ratio: {spectral.get('sub_20_60', 0):.4f}
    - Sibilance (6k-10kHz) Energy Ratio: {spectral.get('sibilance_6k_10k', 0):.4f}
    - Air (10k-20kHz) Energy Ratio: {spectral.get('air_10k_20k', 0):.4f}

    OUTPUT FORMAT:
    Provide your advice as a structured JSON object with exactly the following keys:
    1. "summary": A brief 1-2 sentence overview of the audio's quality.
    2. "eq_advice": Specific EQ recommendations based on the spectral ratios.
    3. "dynamics_advice": Compression or limiting advice based on Crest Factor, LRA, and True Peak.

    Return ONLY the raw JSON string. Do not include markdown code block syntax.
    """

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "num_predict": 400,
            "temperature": 0.3,
        }
    }

    try:
        resp = requests.post(OLLAMA_ENDPOINT, json=payload, timeout=10.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        response_text = data.get("response", "").strip()
        return json.loads(response_text)
    except (requests.RequestException, json.JSONDecodeError) as exc:
        logger.error(f"Error calling Ollama or parsing response: {exc}")
        return None
