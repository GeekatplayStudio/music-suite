from __future__ import annotations

import pytest
import requests

from audioqi.core import music_style
from audioqi.core.music_style import (
    StyleAnalysisError,
    analyze_music_style,
    choose_model,
    describe_features,
    rule_based_report,
)

BEAT_FEATURES = {
    "tempo_bpm": 128.0,
    "key": "A Minor",
    "centroid_hz": 3100.0,
    "rolloff_hz": 9000.0,
    "flatness": 0.02,
    "zcr": 0.14,
    "rms": 0.12,
    "bands": {"low": 0.4, "mid": 0.45, "high": 0.15},
    "duration_seconds": 210.0,
}


def test_non_loopback_ollama_hosts_are_refused() -> None:
    """GUARDRAILS.md limits Ollama to loopback; a remote host must be rejected
    before any request is made, not merely discouraged."""
    for host in ("http://10.0.0.5:11434", "http://evil.example.com", "https://ollama.example.net"):
        with pytest.raises(StyleAnalysisError):
            music_style._require_loopback(host)

    for host in ("http://127.0.0.1:11434", "http://localhost:11434"):
        assert music_style._require_loopback(host).startswith("http://")


def test_model_selection_skips_models_that_cannot_describe_music() -> None:
    """A vision, embedding or code model will happily accept the prompt and
    return something useless."""
    available = [
        "nomic-embed-text:latest",
        "llava:latest",
        "qwen2.5-coder:32b",
        "llama3.1:8b",
    ]
    assert choose_model(available) == "llama3.1:8b"

    # With nothing suitable installed, say so rather than picking a vision model.
    assert choose_model(["llava:latest", "nomic-embed-text:latest"]) is None
    assert choose_model([]) is None


def test_an_explicit_model_request_matches_an_installed_tag() -> None:
    """Users type 'llama3'; Ollama reports 'llama3:latest'."""
    assert choose_model(["llama3:latest", "gemma3:12b"], "llama3") == "llama3:latest"
    assert choose_model(["llama3:latest", "gemma3:12b"], "gemma3:12b") == "gemma3:12b"
    # An uninstalled request falls back rather than failing.
    assert choose_model(["llama3:latest"], "mistral") == "llama3:latest"


def test_rule_based_report_states_what_was_measured() -> None:
    report = rule_based_report(BEAT_FEATURES)
    assert "128 BPM" in report
    assert "A Minor" in report
    assert "3100 Hz" in report
    # Long enough to be a description rather than a label.
    assert len(report) > 200


def test_rule_based_report_refuses_to_invent_a_tempo_or_key() -> None:
    """An unmeasurable tempo must read as unmeasured, not as a default value."""
    ambient = dict(BEAT_FEATURES, tempo_bpm=None, key=None)
    report = rule_based_report(ambient)

    assert "BPM" not in report
    assert "no steady pulse" in report.lower()
    assert "name a key" in report.lower()


def test_feature_descriptions_move_with_the_features() -> None:
    dark = describe_features(dict(BEAT_FEATURES, centroid_hz=500.0))
    bright = describe_features(dict(BEAT_FEATURES, centroid_hz=6000.0))
    assert dark["brightness"] != bright["brightness"]

    quiet = describe_features(dict(BEAT_FEATURES, rms=0.005))
    loud = describe_features(dict(BEAT_FEATURES, rms=0.3))
    assert quiet["dynamics"] != loud["dynamics"]

    assert "minor" in describe_features(BEAT_FEATURES)["tonality"]
    assert "major" in describe_features(dict(BEAT_FEATURES, key="C Major"))["tonality"]


def test_analysis_still_returns_a_description_when_ollama_is_absent(monkeypatch) -> None:
    """Ollama not running is a normal state. The measured description must
    still come back, and the call must not raise."""
    monkeypatch.setattr(music_style, "list_models", lambda *_args, **_kwargs: [])

    result = analyze_music_style(BEAT_FEATURES)
    assert result["ok"] is True
    assert result["engine"] == "rule_based"
    assert result["ollama_running"] is False
    assert "128 BPM" in result["text"]
    assert result["note"]


def test_a_model_failure_falls_back_instead_of_propagating(monkeypatch) -> None:
    monkeypatch.setattr(music_style, "list_models", lambda *_args, **_kwargs: ["llama3:latest"])

    def boom(*_args, **_kwargs):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr(music_style.requests, "post", boom)

    result = analyze_music_style(BEAT_FEATURES)
    assert result["engine"] == "rule_based"
    assert result["text"] == result["rule_based"]
    assert "did not answer" in result["note"]


def test_a_truncated_model_answer_is_rejected(monkeypatch) -> None:
    """A one-word reply is a failed generation, not a style description."""
    monkeypatch.setattr(music_style, "list_models", lambda *_args, **_kwargs: ["llama3:latest"])

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {"response": "rock"}

    monkeypatch.setattr(music_style.requests, "post", lambda *_a, **_k: Response())

    result = analyze_music_style(BEAT_FEATURES)
    assert result["engine"] == "rule_based"
    assert "too little text" in result["note"]


def test_a_good_model_answer_is_used_but_keeps_the_measured_reading(monkeypatch) -> None:
    """The measured description must survive alongside the generated one, so a
    reader can always tell which claims are derived from numbers."""
    monkeypatch.setattr(music_style, "list_models", lambda *_args, **_kwargs: ["llama3:latest"])

    generated = "Driving minor-key electronic music with a bright synthetic top end and a firm four-on-the-floor pulse."

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {"response": generated}

    captured = {}

    def post(url, json=None, timeout=None):  # noqa: A002 - mirrors requests' signature
        captured["url"] = url
        captured["json"] = json
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr(music_style.requests, "post", post)

    result = analyze_music_style(BEAT_FEATURES)
    assert result["engine"] == "ollama"
    assert result["model"] == "llama3:latest"
    assert result["text"] == generated
    assert "128 BPM" in result["rule_based"]

    # Budgets are mandated by GUARDRAILS.md, not optional.
    assert captured["timeout"] == music_style.GENERATE_TIMEOUT_SECONDS
    assert captured["json"]["options"]["num_predict"] == music_style.MAX_OUTPUT_TOKENS
    assert captured["url"].startswith("http://127.0.0.1")


def test_the_prompt_carries_the_measurements_and_forbids_invention(monkeypatch) -> None:
    """Without the guard the model cheerfully names a real song that happens to
    have a similar tempo."""
    monkeypatch.setattr(music_style, "list_models", lambda *_args, **_kwargs: ["llama3:latest"])
    captured = {}

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {"response": "A long enough answer to pass the length guard for this test case."}

    def post(url, json=None, timeout=None):  # noqa: A002
        captured["prompt"] = json["prompt"]
        return Response()

    monkeypatch.setattr(music_style.requests, "post", post)
    analyze_music_style(BEAT_FEATURES)

    prompt = captured["prompt"]
    assert "128.0 BPM" in prompt
    assert "A Minor" in prompt
    assert "Never name a real recording or performer" in prompt
