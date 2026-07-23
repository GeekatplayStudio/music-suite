from __future__ import annotations

import re
import subprocess
import threading
from pathlib import Path
from typing import Any

import requests

from audioqi import __version__

REPOSITORY = "GeekatplayStudio/music-suite"
REPOSITORY_URL = f"https://github.com/{REPOSITORY}"
UPDATE_BRANCH = "main"
GITHUB_COMMIT_API = f"https://api.github.com/repos/{REPOSITORY}/commits/{UPDATE_BRANCH}"
ALLOWED_REMOTES = {
    f"https://github.com/{REPOSITORY}.git",
    f"https://github.com/{REPOSITORY}",
    f"git@github.com:{REPOSITORY}.git",
    f"ssh://git@github.com/{REPOSITORY}.git",
}
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
_UPDATE_LOCK = threading.Lock()


class UpdateError(RuntimeError):
    """Raised when a guarded update cannot be completed safely."""


def _run_git(project_root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["git", *args],
            cwd=project_root,
            check=check,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except FileNotFoundError as exc:
        raise UpdateError("Git is required for in-app updates but was not found on PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        raise UpdateError("Git update check timed out.") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "Git command failed.").strip()
        raise UpdateError(detail[:500]) from exc


def _local_commit(project_root: Path) -> str | None:
    if not (project_root / ".git").exists():
        return None
    result = _run_git(project_root, "rev-parse", "HEAD", check=False)
    commit = result.stdout.strip().lower()
    return commit if result.returncode == 0 and SHA_PATTERN.fullmatch(commit) else None


def _working_tree_dirty(project_root: Path) -> bool:
    if not (project_root / ".git").exists():
        return False
    result = _run_git(project_root, "status", "--porcelain", "--untracked-files=normal")
    return bool(result.stdout.strip())


def _remote_commit(timeout_seconds: float = 10.0) -> str:
    try:
        response = requests.get(
            GITHUB_COMMIT_API,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": f"Geekatplay-Music-Suite/{__version__}",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=(3.05, timeout_seconds),
            allow_redirects=False,
        )
        response.raise_for_status()
        if len(response.content) > 256 * 1024:
            raise UpdateError("GitHub update response exceeded the safety limit.")
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise UpdateError(f"Could not check GitHub for updates: {exc}") from exc
    commit = str(payload.get("sha", "")).strip().lower() if isinstance(payload, dict) else ""
    if not SHA_PATTERN.fullmatch(commit):
        raise UpdateError("GitHub returned an invalid update revision.")
    return commit


def get_update_status(project_root: Path) -> dict[str, Any]:
    current = _local_commit(project_root)
    remote = _remote_commit()
    supported = current is not None
    return {
        "product": "Geekatplay Studio Music Suite",
        "author": "Vladimir Chopine",
        "version": __version__,
        "repository": REPOSITORY_URL,
        "branch": UPDATE_BRANCH,
        "current_commit": current,
        "remote_commit": remote,
        "update_available": current != remote if supported else False,
        "update_supported": supported,
        "working_tree_dirty": _working_tree_dirty(project_root),
        "message": (
            "Update status checked successfully."
            if supported
            else "In-app updates require a Git clone. ZIP installations can be updated manually."
        ),
    }


def apply_update(project_root: Path) -> dict[str, Any]:
    if not _UPDATE_LOCK.acquire(blocking=False):
        raise UpdateError("An update is already in progress.")
    try:
        current = _local_commit(project_root)
        if current is None:
            raise UpdateError("In-app updates require an installation created with Git clone.")
        if _working_tree_dirty(project_root):
            raise UpdateError("Update refused because the working tree contains local changes.")

        branch_result = _run_git(project_root, "symbolic-ref", "--short", "HEAD", check=False)
        if branch_result.returncode != 0 or branch_result.stdout.strip() != UPDATE_BRANCH:
            raise UpdateError(f"Updates require the checked-out {UPDATE_BRANCH!r} branch.")

        remote_result = _run_git(project_root, "remote", "get-url", "origin", check=False)
        remote_url = remote_result.stdout.strip()
        if remote_result.returncode != 0 or remote_url not in ALLOWED_REMOTES:
            raise UpdateError(f"Origin must be the official repository: {REPOSITORY_URL}")

        _run_git(project_root, "fetch", "--no-tags", "origin", UPDATE_BRANCH)
        fetched = _run_git(project_root, "rev-parse", "FETCH_HEAD").stdout.strip().lower()
        if not SHA_PATTERN.fullmatch(fetched):
            raise UpdateError("Git returned an invalid fetched revision.")
        if fetched == current:
            return {
                "updated": False,
                "previous_commit": current,
                "current_commit": current,
                "restart_required": False,
                "message": "Music Suite is already up to date.",
            }

        ancestry = _run_git(project_root, "merge-base", "--is-ancestor", current, fetched, check=False)
        if ancestry.returncode != 0:
            raise UpdateError("Update refused because the local and official histories have diverged.")
        _run_git(project_root, "merge", "--ff-only", fetched)
        return {
            "updated": True,
            "previous_commit": current,
            "current_commit": fetched,
            "restart_required": True,
            "message": "Update installed. Restart Music Suite; dependencies will sync automatically.",
        }
    finally:
        _UPDATE_LOCK.release()
