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
RUNTIME_JS = MAPPER / "app" / "runtime.js"
ANALYSIS_JS = MAPPER / "app" / "analysis-module.js"
HUD_JS = MAPPER / "app" / "hud-module.js"
VISUAL_UTILS_JS = MAPPER / "visual_utils.js"

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


def test_adaptive_quality_is_latched_not_read_straight_off_the_ema() -> None:
    """Thresholding a noisy frame-cost EMA directly is what made the cloud and
    the edge web blink several times a second when the camera was close in."""
    runtime = _read(RUNTIME_JS)
    app = _read(APP_JS)

    assert "QUALITY_DWELL_MS" in runtime
    assert "qualityTierPendingSince" in runtime
    # A tier change must require the candidate to hold for the dwell period.
    assert "nowMs - state.qualityTierPendingSince >= QUALITY_DWELL_MS" in runtime
    # The old direct mapping from renderQuality to a decimation stride is gone.
    assert "state.renderQuality < 0.58 ? 3" not in _read(RENDER_JS)
    assert "state.renderQuality < 0.58" not in app


def test_quality_tier_thresholds_cannot_oscillate() -> None:
    """Upgrade and downgrade bounds must not overlap, or a tier could flip back
    and forth even with the dwell timer."""
    runtime = _read(RUNTIME_JS)
    block = runtime.split("const QUALITY_TIERS = [")[1].split("];")[0]
    tiers = re.findall(r"upgradeBelowMs:\s*([\d.]+),\s*downgradeAboveMs:\s*([\d.]+|Infinity)", block)
    assert len(tiers) >= 3, "quality tiers parsed as empty"

    for upgrade, downgrade in tiers:
        up = float(upgrade)
        down = float("inf") if downgrade == "Infinity" else float(downgrade)
        assert up < down, f"tier upgrade {up} must sit below downgrade {down}"


def test_zoom_out_is_not_capped_by_the_projection() -> None:
    """The wheel handler used to store a zoom the projection then clamped away,
    so zooming out silently did nothing past 0.55."""
    runtime = _read(RUNTIME_JS)
    render = _read(RENDER_JS)

    assert "ZOOM_MIN = 0.12" in runtime
    # The projection must clamp to the shared limits, not to its own constants.
    assert "clamp(state.userZoom * state.autoZoom, ZOOM_MIN, ZOOM_MAX)" in render
    assert "0.55, 2.2" not in render
    # Reset frames the actual cloud rather than returning to a fixed 1x.
    assert "fitZoomForCloud" in _read(MAPPER / "app" / "workflow-module.js")


def test_nodes_fade_at_the_near_plane_instead_of_popping() -> None:
    render = _read(RENDER_JS)
    assert "view.depth < 0.9" not in render, "hard near-plane rejection is back"
    assert "nearFade" in render
    # The fade has to actually reach the node and edge alphas to have an effect.
    assert "* item.nearFade" in render
    assert "Math.min(a.nearFade, b.nearFade)" in render


def test_playhead_motion_is_interpolated_between_analysis_frames() -> None:
    """At 0.25x a frame lasts most of a second, so an integer index makes every
    highlight stair-step."""
    analysis = _read(ANALYSIS_JS)
    render = _read(RENDER_JS)

    assert "function getFrameIndexFloatAtTime" in analysis
    assert "activeIndexFloat" in render
    assert "state.trailHead" in render


def test_edge_pass_batches_quiet_edges_rather_than_stroking_each_one() -> None:
    """Per-edge stroke() plus createLinearGradient() for ~4700 edges was 69% of
    the frame; the dim static web must be batched."""
    render = _read(RENDER_JS)
    assert "quietBuckets" in render
    assert "pushQuietEdge" in render
    assert "flushQuietEdges" in render
    # Only edges near the playhead earn the animated treatment.
    assert "ACTIVE_EDGE_MIN" in render


def test_connection_waveforms_use_a_harmonic_stack_driven_by_flatness() -> None:
    """A single sine reads as a rope. Partial weighting has to come from the
    audio, not from a constant."""
    render = _read(RENDER_JS)
    assert "WAVE_PARTIAL_MULTS" in render
    assert "function buildWavePartials(noisiness, detail)" in render
    assert 'id="edge-wave-harmonics"' in _read(INDEX)
    assert '"edge-wave-harmonics"' in _read(HELP_CONTENT)


def test_song_readout_is_always_on_and_toggleable() -> None:
    index = _read(INDEX)
    hud = _read(HUD_JS)

    for element_id in ("song-hud", "hud-elapsed", "hud-total", "hud-rate", "hud-percent",
                       "hud-frame", "hud-tempo", "hud-key", "hud-meter"):
        assert f'id="{element_id}"' in index, f"missing {element_id}"

    assert 'id="toggle-song-hud"' in index
    # Visibility survives a reload.
    assert "sgm.song-hud-visible" in hud
    # And the readout disappears with every other overlay in focus mode.
    styles = _read(STYLES)
    assert "body.focus-mode .song-hud" in styles


def test_tempo_and_key_are_hidden_when_the_estimate_is_not_trustworthy() -> None:
    """Printing a plausible-looking number for material that has no beat or no
    tonal centre is worse than printing nothing."""
    hud = _read(HUD_JS)
    assert "TEMPO_CONFIDENCE_MIN" in hud
    assert "KEY_CONFIDENCE_MIN" in hud
    assert "Tempo unclear" in hud
    assert "Key unclear" in hud


def test_chroma_runs_on_a_window_long_enough_to_resolve_a_semitone() -> None:
    """At the 1024-point analysis FFT a minor third in the bass collapses into
    one peak, and key detection then names the same wrong key for every song."""
    analysis = _read(ANALYSIS_JS)
    assert "CHROMA_FFT_SIZE = 8192" in analysis
    assert "function computeSongChroma" in analysis
    # Peak interpolation is what removes the residual bin-centre bias.
    assert "accumulateChroma" in _read(VISUAL_UTILS_JS)


def test_waveform_scrubber_exists_and_yields_the_docked_column() -> None:
    index = _read(INDEX)
    styles = _read(STYLES)

    assert 'id="waveform-strip"' in index
    assert 'id="waveform-canvas"' in index
    assert 'id="toggle-waveform-strip"' in index
    # It spans the stage, so it must be inset like every other full-width overlay.
    assert "body.dock-side .waveform-strip" in styles
    assert "right: var(--dock-width)" in styles
    assert "sgm.waveform-strip-visible" in _read(HUD_JS)


def test_hovering_a_node_explains_what_it_is_and_why_it_sits_there() -> None:
    index = _read(INDEX)
    hud = _read(HUD_JS)
    render = _read(RENDER_JS)

    assert 'id="node-inspector"' in index
    assert "function updateHoverPick" in render
    assert "state.hoverNode" in render
    assert "function describeNodePosition" in hud
    # The explanation must be per mapping mode, not one generic sentence.
    assert "PCA 1" in hud
    assert "elapsed time" in hud.lower()


TEMPORAL_CONTROLS = ("temporal-fog", "temporal-ghosts", "ghost-offset", "time-tube", "section-arcs")


def test_temporal_effects_exist_and_are_documented() -> None:
    index = _read(INDEX)
    help_js = _read(HELP_CONTENT)
    render = _read(RENDER_JS)

    for control in TEMPORAL_CONTROLS:
        assert f'id="{control}"' in index, f"missing control {control}"
        assert f'"{control}"' in help_js, f"missing help for {control}"

    for fn in ("drawTemporalGhosts", "drawSectionArcs", "drawTimeTube"):
        assert f"function {fn}" in render, f"missing {fn}"


def test_temporal_effects_respect_nodes_only_and_the_quality_tier() -> None:
    """A new effect that ignores Nodes Only or the tier budget would undo both
    the clean-view escape hatch and the flicker fix."""
    render = _read(RENDER_JS)

    ghosts = render.split("function drawTemporalGhosts")[1].split("function drawSectionArcs")[0]
    assert "nodesOnly.checked" in ghosts
    assert "qualityTier()" in ghosts

    arcs = render.split("function drawSectionArcs")[1].split("function projectFrameIndex")[0]
    assert "nodesOnly.checked" in arcs
    assert "qualityTier()" in arcs


def test_temporal_fog_keys_off_the_playhead_not_the_camera() -> None:
    """Camera-distance fog already exists. The point of temporal fog is that it
    keeps working while you orbit, which requires the playhead index."""
    render = _read(RENDER_JS)
    assert "temporalFogAmount" in render
    assert "Math.abs(i - activeIndexFloat) / temporalFogSpan" in render


def test_section_arcs_come_from_existing_similarity_data() -> None:
    """Structure detection must reuse the kNN graph rather than add a second
    analysis pass, and must only link moments genuinely far apart in time."""
    analysis = _read(ANALYSIS_JS)
    assert "function buildSectionLinks" in analysis
    assert "SECTION_MIN_GAP_RATIO" in analysis
    assert "sectionLinks" in analysis
    # Rebuilding the neighbour graph has to refresh the structure with it.
    rebuild = analysis.split("function rebuildKnnEdges")[1].split("function remapFrames")[0]
    assert "buildSectionLinks" in rebuild


def test_axis_semantics_cover_every_mapping_mode() -> None:
    """A mode with no documented axes would silently fall back to another
    mode's explanation, which would be actively misleading."""
    index = _read(INDEX)
    hud = _read(HUD_JS)

    modes = set(re.findall(r'<option value="(\w+)"[^>]*>(?:Manifold|Time|Hybrid|Helix)', index))
    assert modes, "mapping modes parsed as empty"

    documented = set(re.findall(r"^  (\w+): \{", hud, flags=re.M))
    missing = sorted(modes - documented)
    assert not missing, f"mapping modes with no axis explanation: {missing}"
