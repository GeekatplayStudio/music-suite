from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import apps.api.main as api_main
from audioqi.io import metadata as metadata_module
from tests.fixtures import write_synthetic_fixture


def test_upload_filename_is_sanitized(tmp_path: Path) -> None:
    fixture = write_synthetic_fixture(tmp_path / "synthetic.wav")
    with TestClient(api_main.app) as client:
        with fixture.open("rb") as f:
            response = client.post(
                "/runs/upload?hide_from_history=true",
                files={"file": ("../../attack.wav", f, "audio/wav")},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["run"]["filename"] == "attack.wav"


def test_upload_rejects_unsupported_extension() -> None:
    with TestClient(api_main.app) as client:
        response = client.post(
            "/runs/upload?hide_from_history=true",
            files={"file": ("payload.exe", b"not audio", "application/octet-stream")},
        )
    assert response.status_code == 415


def test_upload_stream_enforces_size_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api_main, "SETTINGS", replace(api_main.SETTINGS, max_upload_bytes=8))
    with TestClient(api_main.app) as client:
        response = client.post(
            "/runs/upload?hide_from_history=true",
            files={"file": ("oversize.wav", b"0123456789", "audio/wav")},
        )
    assert response.status_code == 413


def test_upload_enforces_duration_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        api_main,
        "SETTINGS",
        replace(api_main.SETTINGS, max_audio_duration_seconds=10.0),
    )
    monkeypatch.setattr(
        metadata_module,
        "extract_metadata",
        lambda path: {
            "filename": path.name,
            "format": "wav",
            "codec": "pcm_s16le",
            "duration_seconds": 11.0,
        },
    )
    with TestClient(api_main.app) as client:
        response = client.post(
            "/runs/upload?hide_from_history=true",
            files={"file": ("long.wav", b"valid-enough-for-mocked-metadata", "audio/wav")},
        )
    assert response.status_code == 413


def test_api_rejects_untrusted_host() -> None:
    with TestClient(api_main.app) as client:
        response = client.get("/health", headers={"host": "evil.example"})
    assert response.status_code == 400


def test_cors_does_not_allow_unknown_origin() -> None:
    with TestClient(api_main.app) as client:
        response = client.options(
            "/health",
            headers={
                "origin": "https://evil.example",
                "access-control-request-method": "GET",
            },
        )
    assert "access-control-allow-origin" not in response.headers
