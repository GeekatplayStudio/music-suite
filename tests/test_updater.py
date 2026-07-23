from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api import main as api_main
from audioqi import updater

SHA_A = "a" * 40
SHA_B = "b" * 40


def test_update_status_is_pinned_and_reports_available(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(updater, "_local_commit", lambda _root: SHA_A)
    monkeypatch.setattr(updater, "_remote_commit", lambda: SHA_B)
    monkeypatch.setattr(updater, "_working_tree_dirty", lambda _root: False)

    result = updater.get_update_status(Path("."))

    assert result["repository"] == "https://github.com/GeekatplayStudio/music-suite"
    assert result["author"] == "Vladimir Chopine"
    assert result["update_available"] is True
    assert result["update_supported"] is True


def test_apply_update_refuses_dirty_working_tree(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(updater, "_local_commit", lambda _root: SHA_A)
    monkeypatch.setattr(updater, "_working_tree_dirty", lambda _root: True)

    with pytest.raises(updater.UpdateError, match="local changes"):
        updater.apply_update(Path("."))


def test_apply_update_refuses_unofficial_remote(monkeypatch: pytest.MonkeyPatch) -> None:
    class Result:
        returncode = 0
        stdout = "main\n"

    class RemoteResult:
        returncode = 0
        stdout = "https://example.com/untrusted/repository.git\n"

    monkeypatch.setattr(updater, "_local_commit", lambda _root: SHA_A)
    monkeypatch.setattr(updater, "_working_tree_dirty", lambda _root: False)
    results = iter((Result(), RemoteResult()))
    monkeypatch.setattr(updater, "_run_git", lambda *_args, **_kwargs: next(results))

    with pytest.raises(updater.UpdateError, match="official repository"):
        updater.apply_update(Path("."))


def test_update_api_requires_confirmation_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api_main, "apply_update", lambda _root: {"updated": False})
    with TestClient(api_main.app) as client:
        rejected = client.post("/system/update")
        accepted = client.post("/system/update", headers={"X-Music-Suite-Action": "update"})

    assert rejected.status_code == 400
    assert accepted.status_code == 200
    assert accepted.json() == {"updated": False}
