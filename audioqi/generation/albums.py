"""Album batches: many songs written and generated one after another, unattended.

An album is a list of tracks generated into one project. Each track can carry full
settings, or just an idea that the lyrics writer turns into a song brief when its turn
comes. Tracks run strictly one at a time through the same memory guard as single songs,
and when memory is short the album waits instead of failing, so it can run overnight.
Albums left unfinished when the API stops are picked up again when it starts.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from audioqi.editor import projects
from audioqi.editor.projects import EditorError, NotFoundError, ParamError
from audioqi.generation import schema, service, settings, writer

logger = logging.getLogger(__name__)

MAX_TRACKS = 20
MAX_IDEA_CHARS = 500
MAX_CONCEPT_CHARS = 1000
#: How long a track waits for memory (or a busy generator) before it is given up.
WAIT_LIMIT_SECONDS = 2 * 60 * 60
WAIT_STEP_SECONDS = 60.0
ACTIVE = ("queued", "running")
BRIEF_FIELDS = (
    "caption",
    "lyrics",
    "bpm",
    "keyscale",
    "timesignature",
    "vocal_language",
    "duration",
)

_LOCK = threading.RLock()
_WAKE = threading.Event()
_RUNNER: threading.Thread | None = None
_STOP = threading.Event()
#: Overridable in tests.
sleep: Callable[[float], None] = time.sleep


def _dir() -> Path:
    path = settings.root() / "albums"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _path(album_id: str) -> Path:
    if not projects.is_canonical_uuid(album_id):
        raise NotFoundError("Album not found.")
    return _dir() / f"{album_id}.json"


def _load(album_id: str) -> dict[str, Any]:
    with _LOCK:
        record = projects.read_json_safe(_path(album_id))
    if record is None:
        raise NotFoundError("Album not found.")
    return record


def _save(record: dict[str, Any]) -> None:
    record["updated_at"] = projects.now_iso()
    with _LOCK:
        projects.write_json_atomic(_path(record["id"]), record)


def _update(album_id: str, change: Callable[[dict[str, Any]], None]) -> dict[str, Any]:
    with _LOCK:
        record = _load(album_id)
        change(record)
        _save(record)
        return record


def _text(value: Any, name: str, limit: int, *, minimum: int = 0) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ParamError(f"'{name}' must be text.")
    cleaned = " ".join("".join(ch for ch in value if ch.isprintable() or ch == "\n").split())
    if not minimum <= len(cleaned) <= limit:
        raise ParamError(f"'{name}' must be {minimum} to {limit} characters.")
    return cleaned


def public(record: dict[str, Any]) -> dict[str, Any]:
    tracks = record.get("tracks", [])
    done = sum(1 for t in tracks if t.get("status") == "done")
    return {**record, "done": done, "total": len(tracks)}


# --------------------------------------------------------------------------- creating


def create(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ParamError("The album request must be an object.")
    unknown = set(payload) - {"title", "provider", "concept", "fields", "tracks", "write_lyrics"}
    if unknown:
        raise ParamError("Unknown field(s) in the album request.")
    title = projects.clean_name(_text(payload.get("title"), "title", 120, minimum=1), limit=120)
    concept = _text(payload.get("concept"), "concept", MAX_CONCEPT_CHARS)
    write_lyrics = payload.get("write_lyrics", False)
    if not isinstance(write_lyrics, bool):
        raise ParamError("'write_lyrics' must be true or false.")
    chosen = service.provider(payload.get("provider"))
    if not settings.load()["providers"].get(chosen.id, False):
        raise EditorError("This provider is switched off in AI Song Studio > Settings.", 403)
    shared = payload.get("fields") or {}
    if not isinstance(shared, dict):
        raise ParamError("'fields' must be an object.")
    raw_tracks = payload.get("tracks")
    if not isinstance(raw_tracks, list) or not 1 <= len(raw_tracks) <= MAX_TRACKS:
        raise ParamError(f"An album has 1 to {MAX_TRACKS} tracks.")
    fields_spec = chosen.describe()["fields"]
    tracks = []
    for index, raw in enumerate(raw_tracks, start=1):
        if not isinstance(raw, dict) or set(raw) - {"title", "idea", "fields"}:
            raise ParamError(f"Track {index} is not valid.")
        idea = _text(raw.get("idea"), f"track {index} idea", MAX_IDEA_CHARS)
        own = raw.get("fields") or {}
        if not isinstance(own, dict):
            raise ParamError(f"Track {index}: 'fields' must be an object.")
        merged = {**shared, **own}
        # When the writer will fill in the brief, the idea stands in for the style for now.
        probe = dict(merged)
        if write_lyrics and idea and not probe.get("caption"):
            probe["caption"] = idea
        if not write_lyrics and idea:
            style = str(merged.get("caption") or "").strip()
            merged["caption"] = f"{style}, {idea}" if style else idea
            probe["caption"] = merged["caption"]
        try:
            schema.validate(fields_spec, "text2music", probe)
        except ParamError as exc:
            raise ParamError(f"Track {index}: {exc}") from exc
        track_title = projects.clean_name(
            raw.get("title") or idea[:60] or f"Track {index}", limit=80
        )
        tracks.append(
            {
                "index": index,
                "title": track_title,
                "idea": idea,
                "fields": merged,
                "status": "queued",
                "progress": 0.0,
                "detail": "Waiting its turn.",
                "error": None,
                "asset_ids": [],
                "placed": False,
            }
        )
    project = projects.create_project(title)
    stamp = projects.now_iso()
    record = {
        "id": projects.new_id(),
        "title": title,
        "concept": concept,
        "provider": chosen.id,
        "write_lyrics": write_lyrics,
        "project_id": project["id"],
        "status": "queued",
        "tracks": tracks,
        "created_at": stamp,
        "updated_at": stamp,
    }
    _save(record)
    start_runner()
    return public(record)


def list_albums() -> list[dict[str, Any]]:
    items = []
    for path in sorted(_dir().glob("*.json")):
        record = projects.read_json_safe(path)
        if isinstance(record, dict) and "id" in record:
            items.append(public(record))
    return sorted(items, key=lambda r: r.get("created_at", ""), reverse=True)


def get(album_id: str) -> dict[str, Any]:
    return public(_load(album_id))


def cancel(album_id: str) -> dict[str, Any]:
    def change(record: dict[str, Any]) -> None:
        if record["status"] not in ACTIVE:
            return
        record["status"] = "cancelled"
        for track in record["tracks"]:
            if track["status"] in ("queued", "writing", "generating"):
                if track["status"] == "generating":
                    service.cancel(_job_id(record, track))
                track["status"] = "cancelled"
                track["detail"] = "Cancelled."

    return public(_update(album_id, change))


def mark_placed(album_id: str, indexes: Any) -> dict[str, Any]:
    if not isinstance(indexes, list) or not all(isinstance(i, int) for i in indexes):
        raise ParamError("'indexes' must be a list of track numbers.")

    def change(record: dict[str, Any]) -> None:
        for track in record["tracks"]:
            if track["index"] in indexes and track["status"] == "done":
                track["placed"] = True

    return public(_update(album_id, change))


def delete(album_id: str) -> None:
    record = _load(album_id)
    if record["status"] in ACTIVE:
        raise EditorError("Cancel the album before removing it.", 409)
    with _LOCK:
        _path(album_id).unlink(missing_ok=True)


# --------------------------------------------------------------------------- running


def _job_id(record: dict[str, Any], track: dict[str, Any]) -> str:
    return f"album-{record['id']}-{track['index']}"


def _set_track(album_id: str, index: int, **changes: Any) -> dict[str, Any]:
    def change(record: dict[str, Any]) -> None:
        for track in record["tracks"]:
            if track["index"] == index:
                track.update(changes)

    return _update(album_id, change)


def _write_brief(record: dict[str, Any], track: dict[str, Any]) -> dict[str, Any]:
    total = len(record["tracks"])
    idea = f"Album: {record['title']}. {record['concept']}\nTrack {track['index']} of {total}: {track['idea']}"
    brief = writer.write(
        {
            "mode": "brief",
            "idea": idea[:1000],
            "instrumental": bool(track["fields"].get("instrumental")),
        }
    )["brief"]
    # What the user set wins over what the writer suggested.
    written = {key: brief[key] for key in BRIEF_FIELDS if key in brief}
    return {**written, **{k: v for k, v in track["fields"].items() if v not in (None, "")}}


def _waitable(exc: EditorError) -> bool:
    """Memory pressure or a busy generator: worth waiting for, not a failure."""
    return exc.status_code in (409, 503) and "cancelled" not in str(exc).lower()


def _run_track(record: dict[str, Any], track: dict[str, Any]) -> None:
    album_id, index = record["id"], track["index"]
    waited = 0.0
    while True:
        if _load(album_id)["status"] == "cancelled" or _STOP.is_set():
            return
        try:
            fields = dict(track["fields"])
            if record.get("write_lyrics") and track.get("idea"):
                _set_track(
                    album_id, index, status="writing", detail="Writing the lyrics and style."
                )
                fields = _write_brief(record, track)
            params = service.validate_request(
                {
                    "provider": record["provider"],
                    "task": "text2music",
                    "title": track["title"],
                    "fields": fields,
                }
            )
            _set_track(album_id, index, status="generating", detail="Generating.", fields=fields)

            def progress(percent: float, detail: str) -> None:
                _set_track(album_id, index, progress=round(percent, 1), detail=detail)

            created, _ = service.run(
                record["project_id"], _job_id(record, track), params, None, progress
            )
            _set_track(
                album_id,
                index,
                status="done",
                progress=100.0,
                detail="Done.",
                asset_ids=[asset["id"] for asset in created],
                error=None,
            )
            return
        except EditorError as exc:
            if _waitable(exc) and waited < WAIT_LIMIT_SECONDS:
                _set_track(album_id, index, status="queued", detail=f"Waiting: {exc}")
                sleep(WAIT_STEP_SECONDS)
                waited += WAIT_STEP_SECONDS
                continue
            status = "cancelled" if "cancelled" in str(exc).lower() else "failed"
            _set_track(album_id, index, status=status, detail="Stopped.", error=str(exc))
            return
        except Exception as exc:  # noqa: BLE001 - one bad track must not stop the album
            logger.exception("Album %s track %s failed", album_id, index)
            _set_track(
                album_id,
                index,
                status="failed",
                detail="Stopped.",
                error=f"The track failed unexpectedly ({type(exc).__name__}).",
            )
            return


def _set_status(album_id: str, status: str) -> None:
    def change(record: dict[str, Any]) -> None:
        record["status"] = status

    _update(album_id, change)


def _next_album() -> dict[str, Any] | None:
    for album in sorted(list_albums(), key=lambda r: r.get("created_at", "")):
        if album["status"] in ACTIVE:
            return _load(album["id"])
    return None


def run_pending() -> None:
    """Work through every unfinished album, oldest first. Returns when none is left."""
    while not _STOP.is_set():
        record = _next_album()
        if record is None:
            return
        _set_status(record["id"], "running")
        for track in record["tracks"]:
            if track["status"] != "queued":
                continue
            if _load(record["id"])["status"] == "cancelled":
                break
            _run_track(record, track)
        final = _load(record["id"])
        if final["status"] != "cancelled":
            states = {t["status"] for t in final["tracks"]}
            final_status = (
                "done" if states == {"done"} else "partial" if "done" in states else "failed"
            )
            _set_status(record["id"], final_status)


def _loop() -> None:
    global _RUNNER
    while not _STOP.is_set():
        try:
            run_pending()
        except Exception:  # noqa: BLE001
            logger.exception("Album runner error")
        _WAKE.wait(timeout=30.0)
        _WAKE.clear()
        with _LOCK:
            if _next_album() is None:
                _RUNNER = None
                return


def start_runner() -> None:
    """Start the background runner if it is not running (also resumes after a restart)."""
    global _RUNNER
    with _LOCK:
        _WAKE.set()
        if _RUNNER is not None and _RUNNER.is_alive():
            return
        _STOP.clear()
        _RUNNER = threading.Thread(target=_loop, name="album-runner", daemon=True)
        _RUNNER.start()


def resume_on_startup() -> None:
    """Albums cut off by a shutdown continue: an interrupted track is tried again."""
    _STOP.clear()  # A fresh start of the API (the previous one may have stopped the runner).
    found = False
    for album in list_albums():
        if album["status"] not in ACTIVE:
            continue
        found = True

        def change(record: dict[str, Any]) -> None:
            record["status"] = "queued"
            for track in record["tracks"]:
                if track["status"] in ("writing", "generating"):
                    track.update(status="queued", progress=0.0, detail="Resuming after a restart.")

        _update(album["id"], change)
    if found:
        start_runner()


def stop() -> None:
    _STOP.set()
    _WAKE.set()
