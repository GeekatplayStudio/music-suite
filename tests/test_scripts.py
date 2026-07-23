from __future__ import annotations

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
    assert "Test-MusicSuiteProcess" in shutdown
    assert "Get-ListenerProcessIds" in shutdown
    assert "Stop-Process -Id" in shutdown
    assert "unrecognized process IDs" in shutdown


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
