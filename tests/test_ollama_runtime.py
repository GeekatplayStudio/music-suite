"""Music Suite's own Ollama: where it lives, how it starts, and how it is installed.

No real Ollama, download or network is used: files, processes and HTTP calls are faked.
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from audioqi.core import ollama_runtime as rt
from audioqi.generation import setup, writer


@pytest.fixture
def suite(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A Music Suite folder of its own: .tools, data and a home folder with no models."""
    monkeypatch.setattr(rt, "TOOLS", tmp_path / ".tools" / "ollama")
    monkeypatch.setattr(rt, "LOG", tmp_path / "logs" / "ollama.log")
    monkeypatch.setenv("AUDIOQI_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("OLLAMA_MODELS", raising=False)
    monkeypatch.delenv("OLLAMA_HOST", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "appdata"))  # No Ollama app settings.
    monkeypatch.setattr(rt.Path, "home", classmethod(lambda _cls: tmp_path / "home"))
    return tmp_path


def test_only_an_ollama_on_this_computer_is_ever_used(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OLLAMA_HOST", "127.0.0.1:11535")
    assert rt.base_url() == "http://127.0.0.1:11535"
    monkeypatch.setenv("OLLAMA_HOST", "http://localhost:11600")
    assert rt.base_url() == "http://127.0.0.1:11600"
    for remote in ("10.0.0.5:11434", "http://evil.example.com", "0.0.0.0"):
        monkeypatch.setenv("OLLAMA_HOST", remote)
        assert rt.base_url() == "http://127.0.0.1:11434"  # GUARDRAILS.md: loopback only.


def test_models_go_in_the_data_folder_unless_some_are_already_downloaded(suite: Path) -> None:
    assert rt.models_dir() == suite / "data" / "ollama" / "models"
    usual = suite / "home" / ".ollama" / "models" / "manifests" / "registry.ollama.ai"
    usual.mkdir(parents=True)
    assert rt.models_dir() == suite / "home" / ".ollama" / "models"  # Not downloaded twice.


def test_models_from_the_ollama_app_are_used_where_it_keeps_them(
    suite: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import sqlite3

    chosen = suite / "D" / "llama"
    (chosen / "manifests").mkdir(parents=True)
    (suite / "appdata" / "Ollama").mkdir(parents=True)
    with sqlite3.connect(suite / "appdata" / "Ollama" / "db.sqlite") as connection:
        connection.execute("CREATE TABLE settings (id INTEGER, models TEXT)")
        connection.execute("INSERT INTO settings VALUES (1, ?)", (str(chosen),))
    monkeypatch.setattr(rt.sys, "platform", "win32")
    monkeypatch.setenv("LOCALAPPDATA", str(suite / "appdata"))
    assert rt.models_dir() == chosen
    chosen.joinpath("manifests").rmdir()  # A folder without models is not a reason to use it.
    assert rt.models_dir() == suite / "data" / "ollama" / "models"


def test_an_explicit_models_folder_always_wins(
    suite: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OLLAMA_MODELS", str(suite / "elsewhere"))
    assert rt.models_dir() == suite / "elsewhere"


def test_the_private_copy_keeps_its_key_and_models_in_the_suite(suite: Path) -> None:
    env = rt.server_env(own=True)
    assert env["OLLAMA_MODELS"] == str(suite / "data" / "ollama" / "models")
    # Ollama keeps an identity key in ~/.ollama: for the private copy that is data/ollama.
    assert env["USERPROFILE"] == env["HOME"] == str(suite / "data" / "ollama")
    assert env["OLLAMA_HOST"] == "127.0.0.1:11434"


def test_an_ollama_on_the_computer_runs_as_the_user_set_it_up(
    suite: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("USERPROFILE", "C:/Users/someone")
    env = rt.server_env(own=False)
    assert env["USERPROFILE"] == "C:/Users/someone" and "OLLAMA_MODELS" not in env


def test_the_private_copy_comes_first(suite: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rt.sys, "platform", "win32")
    monkeypatch.setattr(rt, "system_executable", lambda: "C:/Ollama/ollama.exe")
    assert rt.executable() == ("C:/Ollama/ollama.exe", False)
    rt.TOOLS.mkdir(parents=True)
    (rt.TOOLS / "ollama.exe").write_bytes(b"")
    assert rt.executable() == (str(rt.TOOLS / "ollama.exe"), True)


def test_nothing_is_started_when_autostart_is_off(
    suite: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(rt, "reachable", lambda *_: False)
    monkeypatch.setattr(rt.subprocess, "Popen", lambda *_a, **_k: pytest.fail("started Ollama"))
    monkeypatch.setenv("MUSIC_SUITE_OLLAMA_AUTOSTART", "0")
    assert rt.ensure_running() is False


def test_an_installed_ollama_is_started_with_its_environment(
    suite: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    started: list[dict[str, Any]] = []
    up = {"value": False}

    class Process:
        pid = 4242

        def poll(self) -> None:
            return None

    def popen(command: list[str], **kwargs: Any) -> Process:
        started.append({"command": command, **kwargs})
        up["value"] = True
        return Process()

    monkeypatch.setenv("MUSIC_SUITE_OLLAMA_AUTOSTART", "1")
    monkeypatch.setattr(rt, "reachable", lambda *_: up["value"])
    monkeypatch.setattr(rt, "executable", lambda: ("C:/suite/.tools/ollama/ollama.exe", True))
    monkeypatch.setattr(rt.subprocess, "Popen", popen)
    monkeypatch.setattr(rt, "_process", None)
    monkeypatch.setattr(rt, "_failed_at", 0.0)
    assert rt.ensure_running(wait=2) is True
    assert started[0]["command"] == ["C:/suite/.tools/ollama/ollama.exe", "serve"]
    assert started[0]["env"]["OLLAMA_MODELS"] == str(suite / "data" / "ollama" / "models")
    assert rt.ensure_running() is True and len(started) == 1  # Already answering.
    monkeypatch.setattr(rt, "_process", None)


def _fake_release(monkeypatch: pytest.MonkeyPatch, files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as bundle:
        for name, data in files.items():
            bundle.writestr(name, data)
    archive = buffer.getvalue()
    monkeypatch.setattr(rt.sys, "platform", "win32")
    monkeypatch.setattr(rt, "_arch", lambda: "amd64")

    def download(_url: str, target: Path, _size: int, _progress: Any) -> None:
        target.write_bytes(archive)

    monkeypatch.setattr(rt, "_download", download)
    return archive


def test_the_download_is_checked_before_it_is_unpacked(
    suite: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    archive = _fake_release(monkeypatch, {"ollama.exe": b"MZ", "lib/ollama/ggml-base.dll": b"x"})
    digest = hashlib.sha256(archive).hexdigest()
    monkeypatch.setitem(rt.PACKAGES, "amd64", ("ollama-windows-amd64.zip", len(archive), "0" * 64))
    with pytest.raises(rt.OllamaError, match="fingerprint"):
        rt.install(lambda *_: None)
    assert not rt.TOOLS.exists() and not list(rt.TOOLS.parent.glob("*.zip"))

    monkeypatch.setitem(rt.PACKAGES, "amd64", ("ollama-windows-amd64.zip", len(archive), digest))
    shown: list[float] = []
    rt.install(lambda share, _text: shown.append(share))
    assert (rt.TOOLS / "ollama.exe").read_bytes() == b"MZ"
    assert (rt.TOOLS / "lib" / "ollama" / "ggml-base.dll").is_file()
    assert rt.own_version() == rt.VERSION and shown[-1] == 1.0
    assert not list(rt.TOOLS.parent.glob("*.zip"))  # The archive is not kept.


def test_it_is_only_installed_where_a_release_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rt.sys, "platform", "darwin")
    assert rt.can_install() is False
    with pytest.raises(rt.OllamaError, match=r"ollama\.com"):
        rt.install(lambda *_: None)


def test_the_pinned_release_is_the_one_that_was_checked() -> None:
    assert rt.VERSION == "0.40.16"
    amd64, arm64 = rt.PACKAGES["amd64"][2], rt.PACKAGES["arm64"][2]
    assert amd64 == "50fcf5ad54277f2fa5d173ebfc93bcb017adbc0c9ef2314daabc96ca9e6aa64e"
    assert arm64 == "86d2b329cae3125684ff29b506623710b68e1393f679594f1c6aa267beac31c2"


class _Stream:
    def __init__(self, lines: list[dict[str, Any]]) -> None:
        self.lines = [json.dumps(line).encode() for line in lines]

    def __enter__(self) -> _Stream:
        return self

    def __exit__(self, *_: Any) -> None:
        return None

    def raise_for_status(self) -> None:
        return None

    def iter_lines(self) -> list[bytes]:
        return self.lines


def test_a_model_download_reports_its_progress(monkeypatch: pytest.MonkeyPatch) -> None:
    lines = [
        {"status": "pulling manifest"},
        {"status": "pulling a1", "digest": "a1", "total": 800, "completed": 400},
        {"status": "pulling b2", "digest": "b2", "total": 200, "completed": 200},
        {"status": "success"},
    ]
    monkeypatch.setattr(rt.requests, "post", lambda *_a, **_k: _Stream(lines))
    monkeypatch.setattr(rt.time, "monotonic", iter(range(0, 1000, 10)).__next__)
    shown: list[tuple[float, str]] = []
    rt.pull("tiny:1b", lambda share, text: shown.append((share, text)))
    # Bytes of every part together, at most twice a second.
    assert [share for share, _ in shown] == [0.6, 1.0]
    assert shown[-1] == (1.0, "tiny:1b is downloaded.")


def test_a_failed_model_download_says_why(monkeypatch: pytest.MonkeyPatch) -> None:
    failed = _Stream([{"error": "file does not exist"}])
    monkeypatch.setattr(rt.requests, "post", lambda *_a, **_k: failed)
    with pytest.raises(rt.OllamaError, match="file does not exist"):
        rt.pull("nope:1b", lambda *_: None)


def test_the_lyrics_writer_setup_adds_ollama_when_there_is_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    found: dict[str, Any] = {"value": None}

    def install(_progress: Any) -> Path:
        calls.append("install")
        found["value"] = ("C:/suite/.tools/ollama/ollama.exe", True)
        return Path()

    monkeypatch.setattr(rt, "executable", lambda: found["value"])
    monkeypatch.setattr(rt, "can_install", lambda: True)
    monkeypatch.setattr(rt, "install", install)
    monkeypatch.setattr(rt, "ensure_running", lambda *_a, **_k: calls.append("start") or True)
    monkeypatch.setattr(rt, "has_model", lambda _m: False)
    monkeypatch.setattr(rt, "pull", lambda model, _progress: calls.append(f"pull {model}"))
    steps: list[tuple[str, float, str]] = []
    setup.install_writer(lambda step, percent, detail: steps.append((step, percent, detail)))
    assert calls == ["install", "start", f"pull {setup.settings.load()['writer_model']}"]
    assert steps[-1] == ("done", 100, "The lyrics writer is ready.")


def test_the_lyrics_writer_setup_explains_where_ollama_cannot_be_added(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(rt, "executable", lambda: None)
    monkeypatch.setattr(rt, "can_install", lambda: False)
    with pytest.raises(setup.SetupError, match=r"ollama\.com"):
        setup.install_writer(lambda *_: None)


def test_ollama_that_does_not_start_is_explained(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rt, "executable", lambda: ("C:/Ollama/ollama.exe", False))
    monkeypatch.setattr(rt, "ensure_running", lambda *_a, **_k: False)
    with pytest.raises(setup.SetupError, match=r"logs/ollama\.log"):
        setup.pull_writer_model(lambda *_: None)


def test_the_writer_status_starts_an_installed_ollama(monkeypatch: pytest.MonkeyPatch) -> None:
    up = {"value": False}

    class Tags:
        def json(self) -> dict[str, Any]:
            return {"models": [{"name": "gemma4:12b"}]}

    def get(*_a: Any, **_k: Any) -> Tags:
        if not up["value"]:
            raise writer.requests.ConnectionError
        return Tags()

    monkeypatch.setattr(writer.requests, "get", get)
    monkeypatch.setattr(rt, "info", lambda: {"installed": True, "own": True, "can_install": False})
    monkeypatch.setattr(rt, "ensure_running", lambda *_a, **_k: up.update(value=True) or True)
    monkeypatch.setattr(writer.settings, "load", lambda: {"writer_model": "gemma4:12b"})
    status = writer.status()
    assert status["available"] and status["model_installed"] and status["ollama"]["own"]


def test_the_app_can_set_up_only_the_lyrics_writer(monkeypatch: pytest.MonkeyPatch) -> None:
    asked: list[dict[str, bool]] = []
    monkeypatch.setattr(
        setup, "start_background", lambda **kwargs: asked.append(kwargs) or {"running": True}
    )
    response = TestClient(app).post("/generation/setup", json={"writer_only": True})
    assert response.status_code == 200
    assert asked == [{"writer": False, "editing": False, "quality": False, "writer_only": True}]
