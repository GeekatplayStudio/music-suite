from __future__ import annotations

import ipaddress
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from uuid import UUID

import requests
from mcp.server.fastmcp import FastMCP

DEFAULT_API_URL = "http://127.0.0.1:8008"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_FILE = PROJECT_ROOT / ".music-suite-processes.json"
MAX_HTTP_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_CONTEXT_RESPONSE_BYTES = 256 * 1024
MAX_COLLECTION_ITEMS = 100
MAX_STRING_CHARS = 4_000
SENSITIVE_KEYS = {
    "canonical_wav_path",
    "ffprobe",
    "input_path",
    "path",
    "report_html_path",
    "report_pdf_path",
    "run_dir",
    "source_file",
}

mcp = FastMCP(
    "Music Suite",
    instructions=(
        "Local, guarded access to Music Suite analysis runs. Read operations are enabled by "
        "default. Queueing analysis requires MUSIC_SUITE_MCP_ALLOW_MUTATIONS=1. No delete, "
        "filesystem, shell, or arbitrary network tools are exposed."
    ),
    json_response=True,
)


def _api_base_url() -> str:
    configured = os.getenv("MUSIC_SUITE_MCP_API_URL", "").strip()
    runtime_url = ""
    if not configured and RUNTIME_FILE.exists() and RUNTIME_FILE.stat().st_size <= 64 * 1024:
        try:
            runtime_state = json.loads(RUNTIME_FILE.read_text(encoding="utf-8-sig"))
            runtime_port = runtime_state.get("api_port") if isinstance(runtime_state, dict) else None
            if isinstance(runtime_port, int) and 1 <= runtime_port <= 65535:
                runtime_url = f"http://127.0.0.1:{runtime_port}"
        except (OSError, ValueError, json.JSONDecodeError):
            runtime_url = ""
    raw = (configured or runtime_url or DEFAULT_API_URL).rstrip("/")
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("MUSIC_SUITE_MCP_API_URL must be a valid HTTP URL.")
    try:
        is_loopback = ipaddress.ip_address(parsed.hostname).is_loopback
    except ValueError:
        is_loopback = parsed.hostname.lower() == "localhost"
    if not is_loopback:
        raise ValueError("MCP may connect only to a loopback Music Suite API.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("MCP API URL must not contain credentials, query parameters, or fragments.")
    return raw


def _validate_run_id(run_id: str) -> str:
    try:
        normalized = str(UUID(run_id))
    except (ValueError, AttributeError) as exc:
        raise ValueError("run_id must be a canonical UUID.") from exc
    if normalized != run_id.lower():
        raise ValueError("run_id must be a canonical UUID.")
    return normalized


def _mutations_enabled() -> bool:
    return os.getenv("MUSIC_SUITE_MCP_ALLOW_MUTATIONS", "0").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def _request_json(method: str, path: str, *, params: dict[str, Any] | None = None) -> Any:
    base_url = f"{_api_base_url()}/"
    url = urljoin(base_url, path.lstrip("/"))
    if not url.startswith(base_url):
        raise ValueError("MCP request escaped the configured API base URL.")

    try:
        response = requests.request(
            method,
            url,
            params=params,
            timeout=(2.0, 30.0),
            allow_redirects=False,
            stream=True,
        )
        response.raise_for_status()
        chunks: list[bytes] = []
        size = 0
        for chunk in response.iter_content(chunk_size=64 * 1024):
            size += len(chunk)
            if size > MAX_HTTP_RESPONSE_BYTES:
                raise ValueError("Music Suite API response exceeded the MCP safety limit.")
            chunks.append(chunk)
    except requests.RequestException as exc:
        raise RuntimeError(f"Music Suite API request failed: {exc}") from exc

    try:
        return json.loads(b"".join(chunks))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Music Suite API returned invalid JSON.") from exc


def _sanitize_for_context(value: Any, *, depth: int = 0) -> Any:
    if depth > 8:
        return "[maximum depth reached]"
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= MAX_COLLECTION_ITEMS:
                result["_truncated"] = True
                break
            normalized_key = str(key).lower()
            if normalized_key in SENSITIVE_KEYS or normalized_key.endswith("_path"):
                continue
            result[str(key)] = _sanitize_for_context(item, depth=depth + 1)
        return result
    if isinstance(value, list):
        items: list[Any] = [
            _sanitize_for_context(item, depth=depth + 1)
            for item in value[:MAX_COLLECTION_ITEMS]
        ]
        if len(value) > MAX_COLLECTION_ITEMS:
            items.append({"_truncated_items": len(value) - MAX_COLLECTION_ITEMS})
        return items
    if isinstance(value, str) and len(value) > MAX_STRING_CHARS:
        return f"{value[:MAX_STRING_CHARS]}…[truncated]"
    return value


def _bounded_payload(payload: Any) -> Any:
    sanitized = _sanitize_for_context(payload)
    encoded = json.dumps(sanitized, default=str, separators=(",", ":")).encode("utf-8")
    if len(encoded) <= MAX_CONTEXT_RESPONSE_BYTES:
        return sanitized
    if isinstance(sanitized, dict):
        essential_keys = {
            "id",
            "filename",
            "status",
            "progress",
            "stage",
            "stage_detail",
            "error_message",
            "chart_names",
            "markers",
        }
        compact = {key: value for key, value in sanitized.items() if key in essential_keys}
        compact["response_truncated"] = True
        compact["reason"] = "Analysis exceeded the 256 KiB MCP context budget."
        return compact
    return {"response_truncated": True, "reason": "Response exceeded the MCP context budget."}


@mcp.tool()
def music_suite_status() -> dict[str, Any]:
    """Check loopback API health and report MCP guardrail state."""
    try:
        health = _request_json("GET", "/health")
        connected = bool(isinstance(health, dict) and health.get("ok"))
        error = None
    except (RuntimeError, ValueError) as exc:
        connected = False
        error = str(exc)
    return {
        "connected": connected,
        "api_url": _api_base_url(),
        "mutations_enabled": _mutations_enabled(),
        "transport": "stdio",
        "error": error,
    }


@mcp.tool()
def list_analysis_runs(limit: int = 20) -> list[dict[str, Any]]:
    """List recent visible Music Suite analysis runs without filesystem paths."""
    safe_limit = max(1, min(int(limit), 50))
    payload = _request_json("GET", "/runs", params={"limit": safe_limit})
    if not isinstance(payload, list):
        raise RuntimeError("Music Suite returned an invalid run list.")
    return _bounded_payload(payload)


@mcp.tool()
def get_analysis_result(run_id: str) -> dict[str, Any]:
    """Get bounded metrics, markers, metadata, and output state for one analysis run."""
    normalized = _validate_run_id(run_id)
    payload = _request_json("GET", f"/runs/{normalized}")
    if not isinstance(payload, dict):
        raise RuntimeError("Music Suite returned an invalid analysis result.")
    return _bounded_payload(payload)


@mcp.tool()
def get_mastering_advice(run_id: str) -> dict[str, Any]:
    """Get local Ollama advice or Music Suite's deterministic mastering fallback."""
    normalized = _validate_run_id(run_id)
    payload = _request_json("GET", f"/runs/{normalized}/ai_advice")
    if not isinstance(payload, dict):
        raise RuntimeError("Music Suite returned invalid mastering advice.")
    return _bounded_payload(payload)


@mcp.tool()
def queue_analysis(run_id: str, use_gpu: bool = False) -> dict[str, Any]:
    """Queue an already-uploaded run for analysis when MCP mutations are explicitly enabled."""
    if not _mutations_enabled():
        raise PermissionError(
            "MCP mutations are disabled. Set MUSIC_SUITE_MCP_ALLOW_MUTATIONS=1 to enable queueing."
        )
    normalized = _validate_run_id(run_id)
    payload = _request_json(
        "POST",
        f"/runs/{normalized}/analyze",
        params={"use_gpu": str(bool(use_gpu)).lower()},
    )
    if not isinstance(payload, dict):
        raise RuntimeError("Music Suite returned an invalid queue response.")
    return _bounded_payload(payload)


@mcp.resource("music-suite://guardrails")
def guardrails_resource() -> str:
    """Describe the enforced MCP security boundary."""
    return (
        "Music Suite MCP uses stdio and may contact only a loopback API. It exposes no delete, "
        "shell, arbitrary filesystem, upload, or arbitrary URL tools. Read operations are enabled "
        "by default; queue_analysis requires MUSIC_SUITE_MCP_ALLOW_MUTATIONS=1. Run identifiers "
        "must be canonical UUIDs. Filesystem paths and raw ffprobe payloads are removed, collections "
        "are bounded, and tool responses have a 256 KiB context budget."
    )


def main() -> None:
    """Run the local MCP server over stdio."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
