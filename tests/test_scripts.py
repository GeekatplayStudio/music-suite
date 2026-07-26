from __future__ import annotations

import json
from pathlib import Path


def test_unified_install_and_startup_scripts_exist() -> None:
    assert Path("install.ps1").exists()
    assert Path("start.ps1").exists()
    assert Path("stop.ps1").exists()
    assert Path("install.bat").exists()
    assert Path("start.bat").exists()
    assert Path("stop.bat").exists()
    assert Path("install.command").exists()
    assert Path("start.command").exists()
    assert Path("stop.command").exists()

    install_scripts = list(Path(".").glob("*install*.ps1"))
    startup_scripts = list(Path(".").glob("*start*.ps1"))
    shutdown_scripts = list(Path(".").glob("*stop*.ps1"))
    assert install_scripts == [Path("install.ps1")]
    assert startup_scripts == [Path("start.ps1")]
    assert shutdown_scripts == [Path("stop.ps1")]


def test_startup_bootstraps_with_unified_installer() -> None:
    startup = Path("start.ps1").read_text(encoding="utf-8")
    assert "install.ps1" in startup
    assert "apps.api.main:app" in startup
    assert "apps\\web-next" in startup
    assert "next start" in startup
    assert "next dev" not in startup
    assert "next start -H 127.0.0.1" in startup
    assert ".next\\BUILD_ID" in startup
    assert "Find-AvailablePort" in startup
    assert "api_port" in startup
    assert "web_port" in startup
    assert "MUSIC_SUITE_API_URL" in startup


def test_startup_waits_long_enough_for_a_cold_dependency_import() -> None:
    """A cold start imports the whole audio stack, so a 10-second cap fails valid launches."""
    startup = Path("start.ps1").read_text(encoding="utf-8")
    assert "StartupTimeoutSeconds" in startup
    assert "$StartupTimeoutSeconds = 300" in startup
    assert "MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS" in startup
    assert "within 10 seconds" not in startup

    mac_startup = Path("start.command").read_text(encoding="utf-8")
    assert "STARTUP_TIMEOUT_SECONDS" in mac_startup
    assert "MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS:-300" in mac_startup
    # The readiness loop must fail loudly instead of falling through to a broken instance.
    assert "wait_for_url" in mac_startup
    assert 'wait_for_url "http://127.0.0.1:$API_PORT/health"' in mac_startup


def test_startup_records_service_logs_for_diagnosis() -> None:
    startup = Path("start.ps1").read_text(encoding="utf-8")
    assert "RedirectStandardOutput" in startup
    assert "RedirectStandardError" in startup
    assert "Get-LogTail" in startup

    mac_startup = Path("start.command").read_text(encoding="utf-8")
    assert 'LOG_DIR="$ROOT/logs"' in mac_startup
    assert 'tail -n 20 "$log_file"' in mac_startup

    assert "logs/" in Path(".gitignore").read_text(encoding="utf-8")


def test_port_scan_falls_back_to_an_os_assigned_port() -> None:
    startup = Path("start.ps1").read_text(encoding="utf-8")
    assert "Get-EphemeralPort" in startup
    # Exhausting the preferred window must not abort startup.
    assert "No available loopback port was found from" not in startup

    mac_startup = Path("start.command").read_text(encoding="utf-8")
    assert "free(0)" in mac_startup


def test_root_package_json_exposes_the_unified_launchers() -> None:
    """`npm run start` from the project root must work instead of failing with ENOENT."""
    manifest = json.loads(Path("package.json").read_text(encoding="utf-8"))
    scripts = manifest["scripts"]
    assert scripts["start"] == "node scripts/launch.mjs start"
    assert scripts["stop"] == "node scripts/launch.mjs stop"
    assert scripts["install:suite"] == "node scripts/launch.mjs install"

    launcher = Path("scripts/launch.mjs").read_text(encoding="utf-8")
    assert "start.ps1" not in launcher  # the action name is composed, not hard-coded per script
    assert "powershell.exe" in launcher
    assert "win32" in launcher
    assert ".command" in launcher


def test_simple_launchers_delegate_to_one_unified_implementation() -> None:
    assert "install.ps1" in Path("install.bat").read_text(encoding="utf-8")
    assert "start.ps1" in Path("start.bat").read_text(encoding="utf-8")
    assert "stop.ps1" in Path("stop.bat").read_text(encoding="utf-8")
    assert "apps/web-next" in Path("install.command").read_text(encoding="utf-8")
    assert "apps.api.main:app" in Path("start.command").read_text(encoding="utf-8")
    assert "next start" in Path("start.command").read_text(encoding="utf-8")
    assert "next dev" not in Path("start.command").read_text(encoding="utf-8")
    assert "next start -H 127.0.0.1" in Path("start.command").read_text(encoding="utf-8")
    assert ".music-suite-processes.json" in Path("stop.command").read_text(encoding="utf-8")


def test_shutdown_guardrails_verify_processes_and_ports() -> None:
    shutdown = Path("stop.ps1").read_text(encoding="utf-8")
    assert "Test-RecordedMusicSuiteProcess" in shutdown
    assert "recordedIds" in shutdown
    assert "Stop-Process -Id" in shutdown
    assert "No recorded Music Suite instance" in shutdown
    assert "3000" not in shutdown
    assert "8008" not in shutdown


def test_frontend_uses_runtime_same_origin_api_proxy() -> None:
    api_client = Path("apps/web-next/lib/api.ts").read_text(encoding="utf-8")
    proxy = Path("apps/web-next/app/suite-api/[...path]/route.ts").read_text(encoding="utf-8")
    assert 'const API_BASE = "/suite-api"' in api_client
    assert "MUSIC_SUITE_API_URL" in proxy
    assert 'duplex = "half"' in proxy
    assert "127.0.0.1" in proxy


def test_installers_create_production_frontend_build() -> None:
    assert "pnpm.cmd build" in Path("install.ps1").read_text(encoding="utf-8")
    assert "pnpm build" in Path("install.command").read_text(encoding="utf-8")


def test_only_one_readme_exists() -> None:
    generated = {".venv", ".next", ".pytest_cache", ".obsolete-cache", "node_modules"}
    readmes = [
        path
        for path in Path(".").rglob("README.md")
        if not generated.intersection(path.parts)
    ]
    assert readmes == [Path("README.md")]
