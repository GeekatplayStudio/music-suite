from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient

import apps.api.main as api_main
import audioqi.geometry_mapper.service as mapper_service
from tests.fixtures import write_synthetic_fixture


def test_geometry_mapper_api_routes(monkeypatch) -> None:
    expected = {"ok": True, "cached": False, "payload": {"frames": []}}
    monkeypatch.setattr(api_main, "analyze_mapper_upload", lambda *args, **kwargs: expected)
    monkeypatch.setattr(
        api_main,
        "clear_mapper_cache",
        lambda: {"ok": True, "removed_files": 2, "removed_dirs": 1},
    )

    with TestClient(api_main.app) as client:
        analyze = client.post(
            "/song-mapper/api/voice/analyze",
            files={"audio": ("song.wav", b"fake-wave", "audio/wav")},
            data={"separate": "none"},
        )
        assert analyze.status_code == 200
        assert analyze.json() == expected

        cleared = client.post(
            "/song-mapper/api/voice/cache/clear",
            json={"mode": "all", "cache_dir": "C:/must/not/be/used"},
        )
        assert cleared.status_code == 200
        assert cleared.json() == {"ok": True, "removed_files": 2, "removed_dirs": 1}


def test_geometry_mapper_analysis_and_cache(tmp_path: Path, monkeypatch) -> None:
    data_dir = tmp_path / "data"
    monkeypatch.setattr(
        mapper_service,
        "SETTINGS",
        replace(
            mapper_service.SETTINGS,
            data_dir=data_dir,
            uploads_dir=data_dir / "uploads",
            runs_dir=data_dir / "runs",
            db_path=data_dir / "audioqi.db",
        ),
    )
    fixture = write_synthetic_fixture(tmp_path / "mapper.wav")

    with fixture.open("rb") as stream:
        first = mapper_service.analyze_mapper_upload(stream, fixture.name, separate="none")
    assert first["ok"] is True
    assert first["cached"] is False
    assert len(first["payload"]["frames"]) > 10

    with fixture.open("rb") as stream:
        second = mapper_service.analyze_mapper_upload(stream, fixture.name, separate="none")
    assert second["ok"] is True
    assert second["cached"] is True
    assert second["payload"]["track"]["name"] == fixture.name
