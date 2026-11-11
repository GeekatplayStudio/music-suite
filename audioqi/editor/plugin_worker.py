"""Isolated worker: load one plugin with Pedalboard and process one file.

Run as ``python -m audioqi.editor.plugin_worker request.json in.wav out.wav report.json``.
It lives in its own process because a misbehaving plugin can crash its host.
Error text written to the report never contains filesystem paths.

The request's ``mode`` picks the job:

* ``effect`` (default): run ``in.wav`` through an audio effect.
* ``instrument``: play the request's notes through an instrument plugin into ``out.wav``.
* ``editor``: open the plugin's own window; when it is closed, report its saved state.
"""

from __future__ import annotations

import base64
import binascii
import collections
import contextlib
import json
import math
import socket
import sys
import threading
import time
from pathlib import Path
from typing import Any

MAX_DESCRIBED_PARAMETERS = 512
#: Silence run through an instrument after its sound is restored. Some plugins (Surge XT)
#: load a restored sound on their next audio block, so without this the first render is
#: silent and the plugin's window shows the default sound.
PRIME_SECONDS = 0.25
#: While an instrument's window is open, audio is rendered in blocks of this many frames
#: into an output buffer twice that size.
PREVIEW_BLOCK_FRAMES = 1024
PREVIEW_BUFFER_FRAMES = 2048
#: Smaller blocks while notes are played live, so a key is heard quickly.
LIVE_BLOCK_FRAMES = 256
LIVE_BUFFER_FRAMES = 512
#: Live notes arrive as datagrams: a token, then 3-byte MIDI messages.
LIVE_TOKEN_BYTES = 16


def _load(path: str) -> Any:
    import pedalboard

    try:
        return pedalboard.load_plugin(path)
    except ValueError:
        # A bundle holding several plugins needs an explicit name; take the first.
        cls = pedalboard.AudioUnitPlugin if path.endswith(".component") else pedalboard.VST3Plugin
        names = cls.get_plugin_names_for_file(path)
        if not names:
            raise
        return pedalboard.load_plugin(path, plugin_name=names[0])


def _describe(plugin: Any) -> list[dict[str, Any]]:
    described: list[dict[str, Any]] = []
    for name, parameter in list(plugin.parameters.items())[:MAX_DESCRIBED_PARAMETERS]:
        low, high = getattr(parameter, "min_value", None), getattr(parameter, "max_value", None)
        if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
            continue
        if not (math.isfinite(low) and math.isfinite(high)) or high <= low:
            continue
        raw = getattr(parameter, "default_raw_value", 0.0)
        raw = float(raw) if isinstance(raw, (int, float)) and math.isfinite(raw) else 0.0
        default = float(low) + min(1.0, max(0.0, raw)) * (float(high) - float(low))
        described.append(
            {"name": str(name), "min": float(low), "max": float(high), "default": default}
        )
    return described


def _apply_parameters(plugin: Any, values: dict[str, float]) -> None:
    known = plugin.parameters
    for name, value in values.items():
        parameter = known.get(name)
        if parameter is None:
            raise ValueError(f"unknown parameter '{name[:64]}'")
        low, high = getattr(parameter, "min_value", None), getattr(parameter, "max_value", None)
        if isinstance(low, (int, float)) and isinstance(high, (int, float)):
            value = min(float(high), max(float(low), float(value)))
        if getattr(parameter, "type", None) is bool:
            value = bool(round(value))
        setattr(plugin, name, value)


def _restore(plugin: Any, state: Any) -> None:
    """Put back a sound saved from the plugin's own window."""
    if not state:
        return
    try:
        raw = base64.b64decode(str(state), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("the saved sound is damaged") from exc
    plugin.raw_state = raw
    if getattr(plugin, "is_instrument", False):
        plugin([], duration=PRIME_SECONDS, sample_rate=48000.0, num_channels=2, reset=True)


def midi_events(notes: list[dict[str, Any]]) -> list[tuple[bytes, float]]:
    """Note-on/off messages in time order; at the same moment, note-offs come first."""
    events: list[tuple[float, int, bytes]] = []
    for note in notes:
        pitch = int(note["p"])
        start = float(note["t"])
        end = start + float(note["d"])
        velocity = max(1, min(127, round(float(note.get("v", 0.8)) * 127)))
        events.append((start, 1, bytes([0x90, pitch, velocity])))
        events.append((end, 0, bytes([0x80, pitch, 0])))
    events.sort(key=lambda e: (e[0], e[1]))
    return [(message, time) for time, _, message in events]


def render_instrument(request: dict[str, Any], dst: Path) -> dict[str, Any]:
    import numpy as np
    import soundfile as sf

    try:
        plugin = _load(str(request["plugin"]))
    except Exception:
        return {"ok": False, "error": "the plugin could not be loaded"}
    if not getattr(plugin, "is_instrument", False):
        return {"ok": False, "error": "it is an audio effect, not an instrument"}
    try:
        _restore(plugin, request.get("state"))
        _apply_parameters(plugin, dict(request.get("parameters") or {}))
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception:
        return {"ok": False, "error": "the saved sound could not be loaded into the plugin"}
    sample_rate = int(request.get("sample_rate", 48000))
    try:
        out = plugin(
            midi_events(list(request.get("notes") or [])),
            duration=float(request["seconds"]),
            sample_rate=float(sample_rate),
            num_channels=2,
            reset=True,
        )
    except Exception:
        return {"ok": False, "error": "playing the notes failed inside the plugin"}
    out = np.asarray(out, dtype=np.float32)
    out = out[None] if out.ndim == 1 else out
    sf.write(str(dst), out.T, sample_rate, subtype="FLOAT")
    return {"ok": True, "is_instrument": True}


class LivePreview:
    """Loops a clip's notes in short blocks while a plugin's window is open."""

    #: Sent when the loop wraps or playing stops: all notes off, all sound off (channel 1).
    SILENCE = (bytes([0xB0, 123, 0]), bytes([0xB0, 120, 0]))

    def __init__(self, notes: list[dict[str, Any]], seconds: float) -> None:
        self.length = max(0.25, float(seconds))
        self.events = [(t, m) for m, t in midi_events(notes) if t < self.length]
        # Notes cut by the end of the loop are released there.
        self.events += [(self.length - 1e-6, bytes([0x80, int(n["p"]), 0])) for n in notes]
        self.events.sort(key=lambda e: e[0])
        self.playing = False
        self.position = 0.0
        self._stop_pending = False
        #: A sound the app asked for, applied by the audio thread before its next block.
        self.pending_state: bytes | None = None
        #: Notes played live, waiting for the next audio block: (message, time received).
        self.live: collections.deque[tuple[bytes, float]] = collections.deque(maxlen=4096)

    def play(self) -> None:
        self.playing, self.position = True, 0.0

    def stop(self) -> None:
        if self.playing:
            self.playing, self._stop_pending = False, True

    def block(self, duration: float) -> list[tuple[bytes, float]]:
        """MIDI messages for the next ``duration`` seconds, with times inside the block."""
        if self._stop_pending:
            self._stop_pending = False
            return [(message, 0.0) for message in self.SILENCE]
        if not self.playing or not self.events:
            return []
        out: list[tuple[bytes, float]] = []
        offset, remaining = 0.0, duration
        while remaining > 1e-9:
            end = min(self.length, self.position + remaining)
            for at, message in self.events:
                if self.position <= at < end:
                    out.append((message, offset + at - self.position))
            step = end - self.position
            offset, remaining = offset + step, remaining - step
            self.position = end
            if self.position >= self.length - 1e-9:
                self.position = 0.0
                out.extend((message, offset) for message in self.SILENCE)
        return out


def _listen_live(control: Path, token: bytes, close: threading.Event, preview: LivePreview) -> None:
    """Receive live notes on a loopback socket and queue them for the audio thread.

    The port is published in ``control/port``. A datagram without the session's token is
    ignored, so another program on this computer cannot play notes into the session.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.bind(("127.0.0.1", 0))
        sock.settimeout(0.25)
        staged = control / "port.part"
        staged.write_text(str(sock.getsockname()[1]), encoding="ascii")
        staged.replace(control / "port")
        while not close.is_set():
            try:
                data = sock.recv(4096)
            except TimeoutError:
                continue
            if data[:LIVE_TOKEN_BYTES] != token:
                continue
            now = time.monotonic()
            body = data[LIVE_TOKEN_BYTES:]
            for start in range(0, len(body) - 2, 3):
                preview.live.append((body[start : start + 3], now))
    except OSError:
        return
    finally:
        sock.close()


def _output_stream(buffer_frames: int = PREVIEW_BUFFER_FRAMES) -> Any:
    """The default speakers or headphones, or None when there is no output device."""
    try:
        from pedalboard.io import AudioStream

        name = AudioStream.default_output_device_name
        if not name:
            return None
        # A roomy buffer leaves time to render each block without gaps.
        return AudioStream(output_device_name=name, buffer_size=buffer_frames)
    except Exception:
        return None


def _pump(
    plugin: Any,
    close: threading.Event,
    preview: LivePreview,
    status: dict[str, Any],
    live: bool = False,
) -> None:
    """Keep the plugin's audio engine running, playing the preview through the speakers.

    Like a DAW does: some instruments (Surge XT) load a sound picked in their browser
    on the next audio block, so without this the pick would never take effect.
    """
    import numpy as np

    stream = _output_stream(LIVE_BUFFER_FRAMES) if live else _output_stream()
    status["preview"] = "speakers" if stream is not None else "no output device"
    rate = float(stream.sample_rate) if stream is not None else 48000.0
    frames = LIVE_BLOCK_FRAMES if live else PREVIEW_BLOCK_FRAMES
    seconds = frames / rate
    waits: list[float] = []
    resyncs = 0
    # Pedalboard's write() spins while its buffer is full, so stay at most one block
    # ahead of what the device has played and sleep the rest of the time.
    started, sent = time.monotonic(), 0
    try:
        if stream is not None:
            stream.__enter__()
        while not close.is_set():
            if preview.pending_state is not None:
                state, preview.pending_state = preview.pending_state, None
                with contextlib.suppress(Exception):
                    plugin.raw_state = state
            ahead = sent - (time.monotonic() - started) * rate
            if ahead > frames:
                time.sleep((ahead - frames) / rate)
            elif ahead < -frames:
                started, sent = time.monotonic(), 0  # Fell behind (system busy): resync.
                resyncs += 1
            messages = preview.block(seconds)
            now = time.monotonic()
            while preview.live:
                message, received = preview.live.popleft()
                messages.append((message, 0.0))
                waits.append(now - received)
            out = plugin(
                messages,
                duration=seconds,
                sample_rate=rate,
                num_channels=2,
                buffer_size=frames,
                reset=False,
            )
            sent += frames
            if stream is None:
                continue
            out = np.asarray(out, dtype=np.float32)[:, :frames]
            if out.shape[0] < stream.num_output_channels:
                out = np.repeat(out[:1], stream.num_output_channels, axis=0)
            stream.write(np.clip(out[: stream.num_output_channels], -1.0, 1.0), rate)
    except Exception as exc:
        status["preview"] = f"stopped: {type(exc).__name__}"
        return
    finally:
        if live:
            # How long live notes waited for an audio block, and what follows it on the way out.
            status["live"] = {
                "notes": len(waits),
                "wait_ms_avg": round(1000 * sum(waits) / len(waits), 2) if waits else 0.0,
                "wait_ms_max": round(1000 * max(waits), 2) if waits else 0.0,
                "block_ms": round(1000 * frames / rate, 2),
                "buffer_ms": round(1000 * LIVE_BUFFER_FRAMES / rate, 2),
                "resyncs": resyncs,
            }
        if stream is not None:
            with contextlib.suppress(Exception):
                stream.__exit__(None, None, None)


def _watch(control: Path, close: threading.Event, preview: LivePreview) -> None:
    """Follow the app's commands: files named close, play, stop or load appear in ``control``.

    ``load`` holds a saved sound (base64) to switch to.
    """
    while not close.is_set():
        load = control / "load"
        if load.exists():
            with contextlib.suppress(OSError, ValueError, binascii.Error):
                preview.pending_state = base64.b64decode(load.read_text("ascii"), validate=True)
            with contextlib.suppress(OSError):
                load.unlink()
        for command in ("play", "stop"):
            flag = control / command
            if flag.exists():
                with contextlib.suppress(OSError):
                    flag.unlink()
                preview.play() if command == "play" else preview.stop()
        if (control / "close").exists():
            close.set()
            return
        time.sleep(0.1)


def open_editor(request: dict[str, Any]) -> dict[str, Any]:
    try:
        plugin = _load(str(request["plugin"]))
    except Exception:
        return {"ok": False, "error": "the plugin could not be loaded"}
    try:
        _restore(plugin, request.get("state"))
    except Exception:
        return {"ok": False, "error": "the saved sound could not be loaded into the plugin"}
    close = threading.Event()
    preview = LivePreview(list(request.get("notes") or []), float(request.get("seconds") or 4.0))
    if request.get("play"):
        preview.play()
    control = request.get("control_dir")
    live = bool(request.get("live"))
    if control:
        threading.Thread(
            target=_watch, args=(Path(str(control)), close, preview), daemon=True
        ).start()
        token = str(request.get("token") or "").encode("ascii", "ignore")
        if live and len(token) == LIVE_TOKEN_BYTES:
            threading.Thread(
                target=_listen_live, args=(Path(str(control)), token, close, preview), daemon=True
            ).start()
    pump_thread = None
    status: dict[str, Any] = {}
    if getattr(plugin, "is_instrument", False):
        pump_thread = threading.Thread(
            target=_pump, args=(plugin, close, preview, status, live), daemon=True
        )
        pump_thread.start()
    try:
        if request.get("window", True):
            # Blocks until the window is closed, by the user or through ``close``.
            plugin.show_editor(close)
        else:
            # Listening only: no window, runs until the app sends close.
            while not close.wait(0.5):
                pass
    except KeyboardInterrupt:
        pass  # Interrupted: keep whatever sound the window holds.
    except Exception:
        return {"ok": False, "error": "the plugin's window could not be opened"}
    finally:
        close.set()
    if pump_thread is not None:
        pump_thread.join(timeout=5)
        # One more block so a sound picked just before closing is in the saved state.
        plugin([], duration=PRIME_SECONDS, sample_rate=48000.0, num_channels=2, reset=False)
    return {
        "ok": True,
        "state": base64.b64encode(bytes(plugin.raw_state)).decode("ascii"),
        "is_instrument": bool(getattr(plugin, "is_instrument", False)),
        **status,
    }


def run(request_path: Path, src: Path, dst: Path) -> dict[str, Any]:
    import numpy as np
    import soundfile as sf

    request = json.loads(request_path.read_text(encoding="utf-8"))
    mode = request.get("mode", "effect")
    if mode == "instrument":
        return render_instrument(request, dst)
    if mode == "editor":
        return open_editor(request)
    try:
        plugin = _load(str(request["plugin"]))
    except Exception:
        return {"ok": False, "error": "the plugin could not be loaded"}
    if getattr(plugin, "is_instrument", False):
        return {"ok": False, "error": "it is an instrument, not an audio effect"}
    try:
        _apply_parameters(plugin, dict(request.get("parameters") or {}))
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception:
        return {"ok": False, "error": "a parameter value was rejected"}
    audio, sample_rate = sf.read(str(src), dtype="float32", always_2d=True)
    try:
        out = plugin(np.ascontiguousarray(audio.T), float(sample_rate), reset=True)
    except Exception:
        return {"ok": False, "error": "processing failed inside the plugin"}
    out = np.asarray(out, dtype=np.float32)
    out = out[None] if out.ndim == 1 else out
    sf.write(str(dst), out.T, int(sample_rate), subtype="FLOAT")
    return {"ok": True, "parameters": _describe(plugin)}


def describe(request_path: Path) -> dict[str, Any]:
    request = json.loads(request_path.read_text(encoding="utf-8"))
    try:
        plugin = _load(str(request["plugin"]))
    except Exception:
        return {"ok": False, "error": "the plugin could not be loaded"}
    return {
        "ok": True,
        "parameters": _describe(plugin),
        "is_instrument": bool(getattr(plugin, "is_instrument", False)),
    }


def main(argv: list[str]) -> int:
    if len(argv) not in (2, 4):
        return 2
    paths = [Path(item) for item in argv]
    report = paths[-1]
    try:
        outcome = describe(paths[0]) if len(paths) == 2 else run(paths[0], paths[1], paths[2])
    except Exception:
        outcome = {"ok": False, "error": "the plugin worker failed"}
    report.write_text(json.dumps(outcome), encoding="utf-8")
    return 0 if outcome.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
