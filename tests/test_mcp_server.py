from __future__ import annotations

import asyncio
import json
import os
import sys
from uuid import uuid4

import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from apps.mcp import server


def test_mcp_api_url_rejects_non_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MUSIC_SUITE_MCP_API_URL", "https://example.com")
    with pytest.raises(ValueError, match="loopback"):
        server._api_base_url()


def test_mcp_discovers_recorded_dynamic_api_port(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    runtime_file = tmp_path / ".music-suite-processes.json"
    runtime_file.write_text(json.dumps({"api_port": 8123}), encoding="utf-8")
    monkeypatch.delenv("MUSIC_SUITE_MCP_API_URL", raising=False)
    monkeypatch.setattr(server, "RUNTIME_FILE", runtime_file)
    assert server._api_base_url() == "http://127.0.0.1:8123"


def test_mcp_run_id_requires_canonical_uuid() -> None:
    with pytest.raises(ValueError, match="canonical UUID"):
        server._validate_run_id("../../runs")
    run_id = str(uuid4())
    assert server._validate_run_id(run_id) == run_id


def test_mcp_context_sanitizer_removes_paths_and_bounds_values() -> None:
    payload = {
        "id": str(uuid4()),
        "path": "D:/private/audio.wav",
        "metadata": {"ffprobe": {"large": True}, "title": "Safe"},
        "metrics": {"samples": list(range(200)), "note": "x" * 5_000},
    }
    sanitized = server._bounded_payload(payload)
    assert "path" not in sanitized
    assert "ffprobe" not in sanitized["metadata"]
    assert len(sanitized["metrics"]["samples"]) == 101
    assert sanitized["metrics"]["note"].endswith("[truncated]")


def test_mcp_queue_is_read_only_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MUSIC_SUITE_MCP_ALLOW_MUTATIONS", raising=False)
    with pytest.raises(PermissionError, match="mutations are disabled"):
        server.queue_analysis(str(uuid4()))


def test_mcp_list_runs_clamps_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_request(method: str, path: str, *, params=None):
        captured.update({"method": method, "path": path, "params": params})
        return [{"id": str(uuid4()), "status": "completed", "path": "hidden"}]

    monkeypatch.setattr(server, "_request_json", fake_request)
    result = server.list_analysis_runs(999)
    assert captured["params"] == {"limit": 50}
    assert "path" not in result[0]


def test_mcp_stdio_handshake_lists_guarded_tools() -> None:
    async def run() -> set[str]:
        params = StdioServerParameters(
            command=sys.executable,
            args=["-m", "apps.mcp.server"],
            env={**os.environ, "MUSIC_SUITE_MCP_ALLOW_MUTATIONS": "0"},
        )
        async with (
            stdio_client(params) as (read, write),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            result = await session.list_tools()
            return {tool.name for tool in result.tools}

    tools = asyncio.run(run())
    assert tools == {
        "get_analysis_result",
        "get_mastering_advice",
        "list_analysis_runs",
        "music_suite_status",
        "queue_analysis",
    }
