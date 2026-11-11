"""One-click install of free, open-source instrument plugins for the editor.

Every download is a fixed release file checked by size and SHA-256 before anything
is unpacked. Only the plugin bundle and its sound library are extracted, into the
current user's own folders, so no administrator rights are needed. Nothing is
loaded or run here: the plugin is first loaded when the user plays notes through
it, and then only inside the isolated plugin worker.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import stat
import sys
import tarfile
import tempfile
import threading
import time
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

import requests

from audioqi.editor import plugins

Report = Callable[[float, str], None]


class InstallError(Exception):
    """A failure whose message is safe and useful to show to the user."""


@dataclass(frozen=True)
class Download:
    url: str
    size: int
    sha256: str


@dataclass(frozen=True)
class Instrument:
    id: str
    name: str
    version: str
    license: str
    homepage: str
    summary: str
    bundle: str
    #: Plugin-only archive per platform (``sys.platform``).
    plugin: dict[str, Download]
    #: Factory sounds, wavetables and skins, shared by every platform.
    content: Download | None


_SURGE = "https://github.com/surge-synthesizer/releases-xt/releases/download/1.3.4/"
CATALOG: dict[str, Instrument] = {
    "surge-xt": Instrument(
        id="surge-xt",
        name="Surge XT",
        version="1.3.4",
        license="GPL-3.0",
        homepage="https://surge-synthesizer.github.io/",
        summary=(
            "Hybrid synthesizer: 3 oscillators with 12 synthesis types, 2 filters, "
            "12 LFOs, a deep modulation matrix and 2,000+ factory sounds."
        ),
        bundle="Surge XT.vst3",
        plugin={
            "darwin": Download(
                _SURGE + "surge-xt-macos-1.3.4-pluginsonly.zip",
                186958216,
                "37d8d809693adc86587b7bc75a2384fc4e905f259aa9b9a21777749d36fbf8aa",
            ),
            "win32": Download(
                _SURGE + "surge-xt-win64-1.3.4-pluginsonly.zip",
                49093875,
                "564e162c560af07ad4ed47fe1bfcd827cf97a575de30d06c48249aad2e7c35e6",
            ),
        },
        content=Download(
            _SURGE + "surge-xt-portable-content-1.3.4.tar.gz",
            252763750,
            "7ed24822eab69f73101d8558222979b1bceb4882a780292bb7087309b7b101bd",
        ),
    ),
}
#: Room needed beyond the downloads themselves for the unpacked files.
UNPACK_BYTES = 700 * 1024**2


# --------------------------------------------------------------------------- locations


def user_vst3_dir() -> Path | None:
    """The current user's VST3 folder, which the plugin scanner also searches."""
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Audio" / "Plug-Ins" / "VST3"
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA")
        return Path(local) / "Programs" / "Common" / "VST3" if local else None
    return None


def content_dir(item: Instrument) -> Path | None:
    """Where the plugin looks for its sound library (from Surge XT's own search order)."""
    if item.id != "surge-xt":
        return None
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Surge XT"
    vst3 = user_vst3_dir()
    # On Windows Surge XT first looks for a "SurgeXTData" folder above its own file.
    return None if vst3 is None else vst3 / "SurgeXTData"


def _installed_bundle(item: Instrument) -> Path | None:
    for directory, _, fmt in plugins.plugin_dirs():
        if fmt == "vst3" and (directory / item.bundle).is_dir():
            return directory / item.bundle
    return None


def supported(item: Instrument) -> bool:
    return sys.platform in item.plugin and user_vst3_dir() is not None


# --------------------------------------------------------------------------- state

_LOCK = threading.Lock()
_STATE: dict[str, dict[str, Any]] = {}


def _status(item: Instrument) -> dict[str, Any]:
    with _LOCK:
        job = dict(_STATE.get(item.id) or {})
    plugin = item.plugin.get(sys.platform)
    download = (plugin.size if plugin else 0) + (item.content.size if item.content else 0)
    return {
        "id": item.id,
        "name": item.name,
        "version": item.version,
        "license": item.license,
        "homepage": item.homepage,
        "summary": item.summary,
        "supported": supported(item),
        "installed": _installed_bundle(item) is not None,
        "download_bytes": download,
        "running": bool(job.get("running")),
        "percent": float(job.get("percent") or 0.0),
        "detail": str(job.get("detail") or ""),
        "error": job.get("error"),
    }


def list_instruments() -> list[dict[str, Any]]:
    return [_status(item) for item in CATALOG.values()]


def _set(instrument_id: str, **changes: Any) -> None:
    with _LOCK:
        _STATE.setdefault(instrument_id, {}).update(changes)


# --------------------------------------------------------------------------- steps


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _fetch(spec: Download, dest: Path, report: Report, span: tuple[float, float]) -> None:
    """Download ``spec`` to ``dest`` (resuming once cut off) and check it."""
    low, high = span
    for _ in range(3):
        have = dest.stat().st_size if dest.is_file() else 0
        if have > spec.size:
            dest.unlink()
            have = 0
        try:
            if have < spec.size:
                headers = {"Range": f"bytes={have}-"} if have else {}
                with requests.get(spec.url, headers=headers, stream=True, timeout=60) as res:
                    if res.status_code not in (200, 206):
                        raise InstallError(f"The download failed ({res.status_code}).")
                    if res.status_code == 200:
                        have = 0
                    with dest.open("ab" if have else "wb") as handle:
                        for chunk in res.iter_content(1024 * 1024):
                            handle.write(chunk)
                            have += len(chunk)
                            if have > spec.size:
                                break
                            report(
                                low + (high - low) * have / spec.size,
                                f"Downloading: {have / 1024**2:.0f} of "
                                f"{spec.size / 1024**2:.0f} MB.",
                            )
            report(high, "Checking the download.")
            if dest.stat().st_size == spec.size and _sha256(dest) == spec.sha256:
                return
            dest.unlink(missing_ok=True)  # Wrong or damaged file: fetch it again.
        except requests.RequestException:
            time.sleep(3.0)
    raise InstallError("The download did not complete or did not match. Try again later.")


def _safe_parts(name: str) -> tuple[str, ...] | None:
    """Path parts of an archive member, or None if it could land outside the target."""
    path = PurePosixPath(name.replace("\\", "/"))
    parts = tuple(part for part in path.parts if part != ".")
    if path.is_absolute() or not parts or ".." in parts or ":" in parts[0]:
        return None
    return parts


def _extract_bundle(archive: Path, bundle: str, into: Path) -> Path:
    """Unpack just ``bundle`` (a folder anywhere in the zip) into ``into``."""
    with zipfile.ZipFile(archive) as zf:
        members: list[tuple[zipfile.ZipInfo, tuple[str, ...]]] = []
        for info in zf.infolist():
            parts = _safe_parts(info.filename)
            if parts is None or bundle not in parts:
                continue
            mode = info.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise InstallError("The plugin archive holds an unexpected link.")
            members.append((info, parts[parts.index(bundle) :]))
        if not members:
            raise InstallError("The plugin archive does not hold the plugin.")
        for info, parts in members:
            target = into.joinpath(*parts)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
            mode = (info.external_attr >> 16) & 0o777
            if mode:
                target.chmod((mode & 0o755) | 0o600)
    return into / bundle


def _extract_content(archive: Path, folder: str, into: Path) -> Path:
    """Unpack the contents of the archive's ``folder`` (e.g. SurgeXTData) into ``into``."""
    with tarfile.open(archive, "r:gz") as tf:
        chosen = []
        for member in tf.getmembers():
            parts = _safe_parts(member.name)
            if parts is None or folder not in parts:
                continue
            if not (member.isfile() or member.isdir()):
                continue
            member.name = "/".join(parts[parts.index(folder) :])
            chosen.append(member)
        if not chosen:
            raise InstallError("The sound library archive is not the expected one.")
        tf.extractall(into, members=chosen, filter="data")
    return into / folder


def _replace(staged: Path, final: Path) -> None:
    final.parent.mkdir(parents=True, exist_ok=True)
    old = final.with_name(final.name + ".old")
    if old.exists():
        shutil.rmtree(old, ignore_errors=True)
    if final.exists():
        final.rename(old)
    shutil.move(str(staged), str(final))
    shutil.rmtree(old, ignore_errors=True)


def install(instrument_id: str, report: Report) -> None:
    item = CATALOG.get(instrument_id)
    if item is None:
        raise InstallError("Unknown instrument.")
    if not supported(item):
        raise InstallError(f"{item.name} can be installed here only on macOS and Windows.")
    plugin_spec = item.plugin[sys.platform]
    vst3 = user_vst3_dir()
    data = content_dir(item)
    assert vst3 is not None
    vst3.mkdir(parents=True, exist_ok=True)
    need = plugin_spec.size + (item.content.size if item.content else 0) + UNPACK_BYTES
    if shutil.disk_usage(vst3).free < need:
        raise InstallError(
            f"Not enough free disk space: {item.name} needs about {need / 1024**3:.1f} GB."
        )
    # Stage next to the destination so the final move is a rename on the same disk.
    with tempfile.TemporaryDirectory(dir=vst3, prefix=".install-") as tmp:
        stage = Path(tmp)
        content_span = (5.0, 70.0) if item.content else (0.0, 0.0)
        if item.content is not None and data is not None:
            archive = stage / "content.tar.gz"
            _fetch(item.content, archive, report, content_span)
            report(72.0, "Unpacking the sound library.")
            unpacked = _extract_content(archive, "SurgeXTData", stage / "content")
            archive.unlink()
            _replace(unpacked, data)
        archive = stage / "plugin.zip"
        _fetch(plugin_spec, archive, report, (content_span[1] or 5.0, 95.0))
        report(96.0, "Installing the plugin.")
        bundle = _extract_bundle(archive, item.bundle, stage / "plugin")
        _replace(bundle, vst3 / item.bundle)
    plugins.reset_cache()
    report(100.0, f"{item.name} is installed.")


def start_background(instrument_id: str) -> dict[str, Any]:
    item = CATALOG.get(instrument_id)
    if item is None:
        raise InstallError("Unknown instrument.")
    with _LOCK:
        running = bool((_STATE.get(item.id) or {}).get("running"))
        if not running:
            _STATE[item.id] = {
                "running": True,
                "percent": 0.0,
                "detail": "Starting.",
                "error": None,
            }
    if running:
        return _status(item)

    def work() -> None:
        def report(percent: float, detail: str) -> None:
            _set(item.id, percent=round(percent, 1), detail=detail)

        try:
            install(item.id, report)
            _set(item.id, running=False, detail=f"{item.name} is installed.")
        except InstallError as exc:
            _set(item.id, running=False, error=str(exc), detail="Install failed.")
        except Exception as exc:
            _set(
                item.id,
                running=False,
                error=f"Install failed ({type(exc).__name__}).",
                detail="Install failed.",
            )

    threading.Thread(target=work, name=f"install-{item.id}", daemon=True).start()
    return _status(item)


# --------------------------------------------------------------------------- command line


def main(argv: list[str] | None = None) -> int:
    """``python -m audioqi.editor.instruments list`` or ``install surge-xt``."""
    import argparse

    parser = argparse.ArgumentParser(
        prog="python -m audioqi.editor.instruments",
        description="Install free instrument plugins for the Studio Editor.",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="show the instruments and whether each is installed")
    add = sub.add_parser("install", help="download and install an instrument")
    add.add_argument("instrument", choices=sorted(CATALOG))
    args = parser.parse_args(argv)

    if args.command == "list":
        for item in list_instruments():
            size = item["download_bytes"] / 1024**2
            print(
                f"[{'x' if item['installed'] else ' '}] {item['id']}: {item['name']} "
                f"{item['version']} ({item['license']}, {size:.0f} MB)"
            )
        return 0

    item = CATALOG[args.instrument]
    if _installed_bundle(item) is not None:
        print(f"{item.name} is already installed.")
        return 0
    last = [-10.0]

    def report(percent: float, detail: str) -> None:
        if percent - last[0] >= 5.0 or percent >= 100.0:
            last[0] = percent
            print(f"  {percent:5.1f}%  {detail}", flush=True)

    try:
        install(item.id, report)
    except InstallError as exc:
        print(f"{item.name} was not installed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
