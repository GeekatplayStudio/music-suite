from __future__ import annotations

from pathlib import Path


def test_unified_install_and_startup_scripts_exist() -> None:
    assert Path("install.ps1").exists()
    assert Path("start.ps1").exists()
    assert Path("install.bat").exists()
    assert Path("start.bat").exists()
    assert Path("install.command").exists()
    assert Path("start.command").exists()

    install_scripts = list(Path(".").glob("*install*.ps1"))
    startup_scripts = list(Path(".").glob("*start*.ps1"))
    assert install_scripts == [Path("install.ps1")]
    assert startup_scripts == [Path("start.ps1")]


def test_startup_bootstraps_with_unified_installer() -> None:
    startup = Path("start.ps1").read_text(encoding="utf-8")
    assert "install.ps1" in startup
    assert "apps.api.main:app" in startup
    assert "apps\\web-next" in startup


def test_simple_launchers_delegate_to_one_unified_implementation() -> None:
    assert "install.ps1" in Path("install.bat").read_text(encoding="utf-8")
    assert "start.ps1" in Path("start.bat").read_text(encoding="utf-8")
    assert "apps/web-next" in Path("install.command").read_text(encoding="utf-8")
    assert "apps.api.main:app" in Path("start.command").read_text(encoding="utf-8")


def test_only_one_readme_exists() -> None:
    generated = {".venv", ".next", ".pytest_cache", ".obsolete-cache", "node_modules"}
    readmes = [
        path
        for path in Path(".").rglob("README.md")
        if not generated.intersection(path.parts)
    ]
    assert readmes == [Path("README.md")]
