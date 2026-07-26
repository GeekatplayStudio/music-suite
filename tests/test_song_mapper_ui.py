from __future__ import annotations

import re
from pathlib import Path

MAPPER = Path("apps/web-next/public/song-mapper")
INDEX = MAPPER / "index.html"
STYLES = MAPPER / "styles.css"
TOOLTIPS_CSS = MAPPER / "tooltips.css"
HELP_CONTENT = MAPPER / "app" / "help-content.js"
TOOLTIPS_JS = MAPPER / "app" / "tooltips.js"
APP_JS = MAPPER / "app.js"
RENDER_JS = MAPPER / "app" / "render-module.js"

# Controls that carry no user-facing setting, so they need no help entry.
HELP_EXEMPT = {
    "voice-cache-clear",
    "voice-analysis-cache-clear",
    "custom-preset-save",
    "playback-speed-value",
    "freq-spread-value",
    "palette-saturation-value",
    "offset-x",
    "offset-y",
    "offset-z",
    "val-offset-x",
    "val-offset-y",
    "val-offset-z",
}


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _strip_css_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def test_playback_speed_control_exists_and_is_wired() -> None:
    """Slow observation of a song needs a real transport rate, not just a UI slider."""
    index = _read(INDEX)
    assert 'id="playback-speed"' in index
    assert 'id="preserve-pitch"' in index
    for speed in ("0.1", "0.25", "0.5", "1", "2"):
        assert f'data-speed="{speed}"' in index

    app = _read(APP_JS)
    assert "player.playbackRate = next" in app
    assert "preservesPitch" in app
    # Bracket keys step the rate without touching the transport buttons.
    assert 'event.key === "["' in app
    assert 'event.key === "]"' in app


def test_playback_rate_does_not_overwrite_the_saved_preference() -> None:
    """Assigning a new src resets playbackRate to 1; mirroring that back would
    silently clobber the stored speed, so there must be no ratechange writer."""
    app = _read(APP_JS)
    assert 'addEventListener("ratechange"' not in app
    assert 'for (const event of ["loadstart", "loadedmetadata", "canplay"])' in app


def test_trail_decay_follows_the_audio_clock() -> None:
    """At 0.25x a wall-clock decay would shrink the trail instead of slowing it."""
    render = _read(RENDER_JS)
    assert "state.playbackRate" in render
    assert "const audioDtMs" in render
    assert "const pulseDecay = audioDtMs" in render
    assert "const decay = audioDtMs" in render


def test_every_documented_control_exists_in_the_markup() -> None:
    help_js = _read(HELP_CONTENT)
    index = _read(INDEX)
    documented = set(re.findall(r'^  "([a-z0-9-]+)":', help_js, flags=re.M))
    assert documented, "help registry parsed as empty"

    missing = sorted(
        key
        for key in documented
        if f'id="{key}"' not in index and f'name="{key}"' not in index
    )
    assert not missing, f"help written for controls that do not exist: {missing}"


def test_every_control_in_the_markup_has_help() -> None:
    """Adding a new adjustment without help copy should fail here."""
    help_js = _read(HELP_CONTENT)
    index = _read(INDEX)
    documented = set(re.findall(r'^  "([a-z0-9-]+)":', help_js, flags=re.M))

    controls = set(re.findall(r'<(?:input|select)[^>]*id="([a-z0-9-]+)"', index))
    controls -= HELP_EXEMPT
    controls = {c for c in controls if not c.startswith("val-")}

    undocumented = sorted(controls - documented)
    assert not undocumented, f"controls with no help entry: {undocumented}"


def test_help_entries_are_substantive() -> None:
    """Guards against empty or placeholder copy. A short, precise sentence is
    good help, so the bar is 'says something', not 'is long'."""
    help_js = _read(HELP_CONTENT)
    body = help_js.split("export const HELP_FALLBACK")[0]
    entries = re.findall(r'what:\s*"((?:[^"\\]|\\.)*)"', body)
    assert len(entries) >= 55, f"expected help for most controls, found {len(entries)}"

    placeholder = [
        text
        for text in entries
        if len(text) < 25 or text.strip().lower().startswith(("todo", "tbd", "no description"))
    ]
    assert not placeholder, f"placeholder help text: {placeholder}"

    # Most controls should also say when you would reach for them.
    when_entries = re.findall(r'when:\s*"((?:[^"\\]|\\.)*)"', body)
    assert len(when_entries) >= len(entries) - 2


def test_hover_and_hold_replaces_the_instant_css_tooltip() -> None:
    index = _read(INDEX)
    tooltips_js = _read(TOOLTIPS_JS)
    tooltips_css = _read(TOOLTIPS_CSS)

    # The 50 duplicated inline icons are gone; badges are generated instead.
    assert "data-tooltip" not in index
    assert index.count("info-icon") == 0

    assert "DWELL_MS = 550" in tooltips_js
    assert "TOUCH_DWELL_MS" in tooltips_js
    # Popup is positioned in viewport coordinates so a scrolling panel cannot clip it.
    assert "position: fixed" in tooltips_css.split(".help-tip")[1]
    assert 'host.dataset.placement = placement' in tooltips_js


def test_controls_are_docked_beside_the_stage_not_over_it() -> None:
    styles = _read(STYLES)
    app = _read(APP_JS)

    assert "body.dock-side .control-drawer" in styles
    # A canvas is a replaced element, so an explicit width is required for the
    # stage to actually surrender the docked column.
    assert "width: calc(100% - var(--dock-width))" in styles
    assert "--dock-width" in app
    assert "dock-resizer" in app


def test_mapper_stylesheets_have_balanced_braces() -> None:
    """An unclosed rule silently swallows every rule that follows it."""
    for path in (STYLES, TOOLTIPS_CSS):
        css = _strip_css_comments(_read(path))
        assert css.count("{") == css.count("}"), f"unbalanced braces in {path.name}"
