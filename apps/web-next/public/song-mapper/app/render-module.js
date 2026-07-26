import {
  buildLocalDensityMap,
  computeAberrationStrength,
  computeAtmosphereMix,
  computeLabelDensityScale,
  computeMicroDolly,
} from "../visual_utils.js";

// Batching buckets for the quiet edge backbone.
//
// Profiling a 2600-point cloud put 69% of the frame inside drawEdges: every one
// of ~4700 edges paid for its own multi-segment path, its own stroke(), and its
// own createLinearGradient(). Almost all of those edges are a dim static web far
// from the playhead, where a gradient and a wave are invisible. Those are now
// collected into a few dozen buckets by quantised colour and alpha and emitted
// as one stroke each, leaving the animated treatment for the edges that are
// actually near the playhead.
const QUIET_ALPHA_STEPS = 3;
const QUIET_BUCKET_COUNT = 64 * QUIET_ALPHA_STEPS;
const quietBuckets = [];
for (let i = 0; i < QUIET_BUCKET_COUNT; i += 1) {
  quietBuckets.push({ points: [], r: 0, g: 0, b: 0, width: 0, count: 0 });
}

// Harmonic stack used to shape connection waveforms. Partial amplitudes are
// derived per edge from spectral flatness, so this is only the multiplier set.
const WAVE_PARTIAL_MULTS = [1, 2, 3, 5, 8];
const wavePartialAmps = new Float64Array(WAVE_PARTIAL_MULTS.length);

/**
 * Fills `wavePartialAmps` for one edge and returns the number of live partials.
 *
 * How much energy sits above the fundamental *is* spectral flatness: a peaked
 * spectrum is tonal, a flat one is noise-like. So a tonal passage gets a 1/k
 * rolloff that is nearly a pure sine, and a percussive one gets a much flatter
 * stack that draws as a ragged, harmonically dense wave. That is the difference
 * between the old single sine - which read as a wobbling rope - and something
 * that actually looks like sound.
 */
function buildWavePartials(noisiness, detail) {
  const count = Math.max(1, Math.min(WAVE_PARTIAL_MULTS.length, Math.round(1 + detail * (1 + noisiness * 3.2))));
  let total = 0;

  for (let i = 0; i < count; i += 1) {
    const k = WAVE_PARTIAL_MULTS[i];
    const tonal = 1 / k;
    const noisy = Math.pow(k, -0.22);
    const amp = tonal + (noisy - tonal) * noisiness;
    wavePartialAmps[i] = amp;
    total += amp;
  }

  // Normalise so the peak excursion stays inside the caller's amplitude budget
  // no matter how many partials are live.
  const inv = total > 0 ? 1 / total : 0;
  for (let i = 0; i < count; i += 1) {
    wavePartialAmps[i] *= inv;
  }
  return count;
}

export function createRenderModule(runtime) {
  const {
    ctx,
    state,
    player,
    nodesOnly,
    visualPreset,
    motionBlur,
    trailFlare,
    trailPersistence,
    edgeTailFade,
    flowDensity,
    showFlowArrows,
    temporalFog,
    temporalGhosts,
    ghostOffset,
    timeTube,
    sectionArcs,
    motionStrength,
    rotationSpeed,
    renderStyle,
    sceneHaze,
    hazeDrift,
    cameraPreset,
    observatoryOverlay,
    cathedralOverlay,
    freqSpread,
    offsetX,
    offsetY,
    offsetZ,
    pointScale,
    pointOpacity,
    pointSolidness,
    pointDepth,
    pulseStrength,
    nodeHitPulse,
    edgeMode,
    edgeStyle,
    edgeOpacity,
    edgeBrightness,
    edgeWidthBoost,
    edgeRibbonSoftness,
    edgeRibbonWaveSpeed,
    edgeRibbonFlexibility,
    edgeWaveHarmonics,
    edgeSolidness,
    edgeTrailLength,
    waveAmplification,
    knnBoost,
    cinemaMode,
    glowShift,
    showConnections,
    showLabels,
    displayDecimation,
    bloomStrength,
    glowIntensity,
    glowThreshold,
    glowDecay,
    fogStrength,
    lensFlareStrength,
    lensStreakStrength,
    metricRms,
    metricCentroid,
    metricSpread,
    PRESET_BACKGROUND,
    clamp,
    lerp,
    rgba,
    shiftToInfra,
    mixColor,
    getFrameIndexAtTime,
    getFrameIndexFloatAtTime,
    getInterpolatedFrameAtTime,
    activityForIndex,
    edgeFrequencyFactor,
    sampleFrameAt,
    qualityTier,
    ZOOM_MIN,
    ZOOM_MAX,
    NEAR_CLAMP_DEPTH,
    NEAR_FADE_START,
    NEAR_FADE_END,
  } = runtime;

  function updateTrail(dtMs) {
    if (!state.map || state.map.frames.length === 0) {
      return;
    }
  
    // Trail and pulse lifetimes advance on the audio clock, not the wall clock.
    // At 0.25x the playhead reaches a quarter as many nodes per second, so decay
    // must also run at a quarter speed or the trail collapses to a few points.
    // A paused transport therefore freezes the trail for inspection.
    const audioDtMs = player.paused ? 0 : dtMs * (state.playbackRate || 1);
    const pulseDecay = audioDtMs * 0.001 * 2.6;
    for (const [idx, value] of state.activationPulse.entries()) {
      const next = value - pulseDecay;
      if (next <= 0.03) {
        state.activationPulse.delete(idx);
      } else {
        state.activationPulse.set(idx, next);
      }
    }
  
    if (player.currentTime < state.lastPlaybackTime - 0.05) {
      state.trail = [];
      state.lastTrailIndex = -1;
      state.trailVelocity = 0;
      state.activationPulse.clear();
    }
    state.lastPlaybackTime = player.currentTime;
  
    if (!player.paused) {
      const frameIndex = getFrameIndexAtTime(player.currentTime);
      if (frameIndex >= 0) {
        const appendNode = (idx) => {
          const frame = state.map.frames[idx];
          if (!frame) {
            return;
          }
  
          state.trail.push({
            index: idx,
            x: frame.x,
            y: frame.y,
            z: frame.z,
            color: frame.color,
            volume: frame.rmsN,
            flux: frame.fluxN,
            life: 1,
          });
  
          state.activationPulse.set(idx, 1);
          if (idx > 0) {
            state.activationPulse.set(idx - 1, Math.max(state.activationPulse.get(idx - 1) || 0, 0.72));
          }
          if (idx < state.map.frames.length - 1) {
            state.activationPulse.set(idx + 1, Math.max(state.activationPulse.get(idx + 1) || 0, 0.72));
          }
        };
  
        if (state.lastTrailIndex < 0) {
          appendNode(frameIndex);
        } else if (frameIndex !== state.lastTrailIndex) {
          const jump = Math.abs(frameIndex - state.lastTrailIndex);
          state.trailVelocity = lerp(state.trailVelocity, jump, 0.26);
  
          const step = frameIndex > state.lastTrailIndex ? 1 : -1;
          let cursor = state.lastTrailIndex + step;
          let guard = 0;
          while (cursor !== frameIndex + step && guard < 140) {
            appendNode(cursor);
            cursor += step;
            guard += 1;
          }
        }
  
        state.lastTrailIndex = frameIndex;
  
        const maxTrail = Math.round(clamp(620 - state.trailVelocity * 6.5, 220, 620));
        if (state.trail.length > maxTrail) {
          state.trail.splice(0, state.trail.length - maxTrail);
        }
      }
    }
  
    const persistence = Number(trailPersistence.value);
    // Lower persistence should clear trails quickly for responsive rhythm changes.
    const speedBoost = clamp(state.trailVelocity * 0.03, 0, 1.3);
    const decayBase = clamp((1 - persistence) * (4.5 + speedBoost * 2.8), 0.04, 1.8);
  
    const length = Math.max(1, state.trail.length - 1);
    for (let i = 0; i < state.trail.length; i += 1) {
      const node = state.trail[i];
      const tailAge = 1 - i / length;
      const tailFadeBoost = 1 + tailAge * (1.6 + speedBoost);
      const decay = audioDtMs * 0.001 * decayBase * (1.12 - node.volume * 0.42) * tailFadeBoost;
      node.life -= decay;
    }

    // Compact in place. `filter` allocated a fresh array of up to 620 objects
    // on every single frame, which is pure GC pressure in the hot path.
    let write = 0;
    for (let read = 0; read < state.trail.length; read += 1) {
      const node = state.trail[read];
      if (node.life > 0.02) {
        state.trail[write] = node;
        write += 1;
      }
    }
    state.trail.length = write;

    // The trail head tracks the *fractional* playhead. Without this the head
    // sits on the last whole analysis frame and jumps a whole hop at a time,
    // which is exactly the stutter you see at 0.25x.
    const headIndex = getFrameIndexFloatAtTime(player.currentTime);
    state.trailHead = headIndex >= 0 ? sampleFrameAt(headIndex) : null;
  }
  
  function updateCameraMotion(nowSec, dtMs) {
    const preset = cameraPreset.value;
    const orbitSpeed = Number(rotationSpeed.value);
    const pulse = !player.paused ? 1 : 0.4;
    const motion = Number(motionStrength.value);

    // Ease the user zoom toward its target. A wheel flick then glides instead
    // of snapping, which also stops the near-plane fade from strobing when the
    // camera crosses the cloud.
    const zoomEase = clamp(dtMs / 110, 0, 1);
    state.userZoom = clamp(
      state.userZoom + (state.userZoomTarget - state.userZoom) * zoomEase,
      ZOOM_MIN,
      ZOOM_MAX,
    );

    state.autoYaw += orbitSpeed * dtMs * 0.00034;
    state.autoPitch = 0;
    state.autoZoom = 1;
  
    if (preset === "static") {
      state.autoYaw = 0;
      state.autoPitch = 0;
      state.autoZoom = 1;
      return;
    }
  
    if (preset === "orbit") {
      state.autoYaw += orbitSpeed * dtMs * 0.0002;
      state.autoPitch = Math.sin(nowSec * 0.34) * 0.08;
    } else if (preset === "pulse") {
      state.autoPitch = Math.sin(nowSec * 0.75) * 0.14;
      state.autoZoom = 1 + Math.sin(nowSec * 1.7) * 0.09 * pulse;
    } else if (preset === "dive") {
      state.autoPitch = -0.2 + Math.sin(nowSec * 0.38) * 0.36;
      state.autoZoom = 1 + Math.sin(nowSec * 0.95) * 0.12 * pulse;
    } else {
      state.autoPitch = Math.sin(nowSec * 0.26) * 0.09;
      state.autoZoom = 1 + Math.sin(nowSec * 0.48) * 0.04 * pulse;
    }
  
    if (!player.paused && state.map?.frames?.length) {
      const activeIndex = getFrameIndexAtTime(player.currentTime);
      const frame = activeIndex >= 0 ? state.map.frames[activeIndex] : null;
      const dolly = computeMicroDolly(frame, nowSec);
      state.autoZoom += dolly.zoom * (0.015 + motion * 0.01);
      state.autoPitch += dolly.pitch * (0.02 + motion * 0.012);
      state.autoYaw += dolly.yaw * (0.0018 + motion * 0.0015);
    }
  }
  
  function computeViewSpacePoint(x, y, z, nowSec, activity = 0) {
    const spreadScale = Number(freqSpread.value);
    const motion = Number(motionStrength.value) * 0.24;
  
    let px = (x + Number(offsetX.value)) * spreadScale;
    let py = (y + Number(offsetY.value));
    let pz = (z + Number(offsetZ.value)) * spreadScale;
  
    if (motion > 0 && activity > 0.001 && !player.paused) {
      const wave = activity * motion;
      px += Math.sin(nowSec * 2.1 + x * 0.35 + z * 0.15) * wave;
      py += Math.cos(nowSec * 1.65 + y * 0.32 + x * 0.1) * wave * 0.85;
      pz += Math.sin(nowSec * 1.48 + z * 0.28 + y * 0.14) * wave;
    }
  
    const yaw = state.userYaw + state.autoYaw;
    const pitch = clamp(state.userPitch + state.autoPitch, -1.15, 1.2);
  
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const xYaw = px * cosY - pz * sinY;
    const zYaw = px * sinY + pz * cosY;
  
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const yPitch = py * cosP - zYaw * sinP;
    const zPitch = py * sinP + zYaw * cosP;
  
    const zoom = clamp(state.userZoom * state.autoZoom, ZOOM_MIN, ZOOM_MAX);
    const cameraDistance = 24 / zoom;
    const depth = cameraDistance - zPitch;

    return {
      x: xYaw,
      y: yPitch,
      z: zPitch,
      depth,
    };
  }

  function projectPoint3D(x, y, z, nowSec, activity = 0) {
    const view = computeViewSpacePoint(x, y, z, nowSec, activity);
    // Only reject what is genuinely behind the camera. The old `depth < 0.9`
    // cut made nodes pop out of existence on the way in; they now fade across
    // the NEAR_FADE band instead.
    if (!view || view.depth <= NEAR_FADE_END) {
      return null;
    }

    const focal = Math.min(state.width, state.height) * 0.96;
    // Clamping the divisor bounds the on-screen radius of a node that drifts
    // near the camera, so one close node cannot blow out the fill rate.
    const perspective = focal / Math.max(NEAR_CLAMP_DEPTH, view.depth);
    const nearFade = clamp(
      (view.depth - NEAR_FADE_END) / Math.max(0.001, NEAR_FADE_START - NEAR_FADE_END),
      0,
      1,
    );

    return {
      x: state.width * (0.53 + state.userPanX) + view.x * perspective,
      y: state.height * (0.54 + state.userPanY) + view.y * perspective,
      depth: view.depth,
      perspective,
      nearFade,
      fog: clamp((view.depth - 6) / 26, 0, 1),
    };
  }
  
  function drawBackground(nowSec) {
    if (nodesOnly.checked) {
        if (ctx.fillStyle !== "#000000") ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, state.width, state.height);
        return;
    }
    const basePreset = PRESET_BACKGROUND[visualPreset.value] || PRESET_BACKGROUND.cinematic;
    // X-ray reads as bright structure on a near-black plate, so the preset's
    // aura and vignette are dimmed rather than replaced - the scene keeps its
    // colour identity, it just stops competing with the outlines.
    const preset = isXrayStyle()
      ? {
          core: basePreset.core.map((c) => Math.round(c * 0.3)),
          aura: basePreset.aura.map((c) => Math.round(c * 0.28)),
          vignette: basePreset.vignette.map((c) => Math.round(c * 0.35)),
        }
      : basePreset;
    const blur = Number(motionBlur.value);
    const veilAlpha = clamp(0.02 + blur * 0.07, 0.01, 0.12);
  
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgb(${preset.vignette[0]}, ${preset.vignette[1]}, ${preset.vignette[2]})`;
    ctx.fillRect(0, 0, state.width, state.height);
  
    if (blur > 0.001) {
      ctx.fillStyle = `rgba(${preset.vignette[0]}, ${preset.vignette[1]}, ${preset.vignette[2]}, ${veilAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, state.width, state.height);
    }
  
    const radial = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.46,
      30,
      state.width * 0.5,
      state.height * 0.5,
      Math.max(state.width, state.height) * 0.8,
    );
    radial.addColorStop(0, `rgba(${preset.aura[0]}, ${preset.aura[1]}, ${preset.aura[2]}, 0.11)`);
    radial.addColorStop(1, `rgba(${preset.core[0]}, ${preset.core[1]}, ${preset.core[2]}, 0.02)`);
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, state.width, state.height);
  
    const parallax = (state.userYaw + state.autoYaw) * 0.045;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
  
    const starStride = state.renderQuality < 0.62 ? 2 : 1;
    for (let starIndex = 0; starIndex < state.stars.length; starIndex += starStride) {
      const star = state.stars[starIndex];
      const twinkle = (Math.sin(nowSec * (0.9 + star.depth) + star.twinkle) + 1) * 0.5;
      const alpha = star.alpha * (0.58 + twinkle * 0.42);
      const x = ((star.x + parallax * star.depth + 2) % 1) * state.width;
      const y = star.y * state.height;
      ctx.fillStyle = `rgba(190, 214, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, star.radius * state.dpr * (0.35 + star.depth * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  
    ctx.restore();
  }
  
  /**
   * Extrudes the trail into a ribbon: thickness is loudness, colour is the
   * active metric, and the whole band fades along its length.
   *
   * Where the trail line says "the playhead went this way", the tube says how
   * loud it was the whole way, which turns the path into a readable record of
   * the last few seconds rather than a decoration.
   */
  function drawTimeTube(projected, segmentCount) {
    const tube = Number(timeTube?.value || 0);
    if (tube <= 0.001 || projected.length < 3) {
      return;
    }

    const top = [];
    const bottom = [];

    for (let i = 0; i < projected.length; i += 1) {
      const point = projected[i];
      const prev = projected[Math.max(0, i - 1)];
      const next = projected[Math.min(projected.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const length = Math.hypot(dx, dy) || 1;
      // Perpendicular to the local direction of travel.
      const nx = -dy / length;
      const ny = dx / length;

      const headBias = i / segmentCount;
      const half =
        tube *
        point.node.life *
        (1.4 + point.node.volume * 9 + point.node.flux * 3.5) *
        (0.35 + headBias * 0.65);

      top.push(point.x + nx * half, point.y + ny * half);
      bottom.push(point.x - nx * half, point.y - ny * half);
    }

    const head = projected[projected.length - 1];
    const tail = projected[0];
    const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    gradient.addColorStop(0, rgba(tail.node.color, 0));
    gradient.addColorStop(0.55, rgba(head.node.color, clamp(tube * 0.14, 0.01, 0.24).toFixed(3)));
    gradient.addColorStop(1, rgba(head.node.color, clamp(tube * 0.4, 0.02, 0.62).toFixed(3)));

    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    for (let i = 2; i < top.length; i += 2) {
      ctx.lineTo(top[i], top[i + 1]);
    }
    for (let i = bottom.length - 2; i >= 0; i -= 2) {
      ctx.lineTo(bottom[i], bottom[i + 1]);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  /** True when the scene should render as bright outlines rather than solids. */
  function isXrayStyle() {
    return (renderStyle?.value || "solid") === "xray";
  }

  // Haze anchor colours, cold to hot. Which one the haze sits on is decided by
  // the music's spectral centroid, so a dark bass-heavy passage hazes deep blue
  // and a bright one hazes amber. Reused each frame rather than reallocated.
  const HAZE_ANCHORS = [
    { r: 38, g: 86, b: 190 },
    { r: 96, g: 72, b: 208 },
    { r: 196, g: 74, b: 168 },
    { r: 236, g: 126, b: 96 },
    { r: 240, g: 196, b: 118 },
  ];

  /** Samples the haze ramp at t, so the hue slides continuously with centroid. */
  function hazeColorAt(t) {
    const scaled = clamp(t, 0, 1) * (HAZE_ANCHORS.length - 1);
    const index = Math.min(HAZE_ANCHORS.length - 2, Math.floor(scaled));
    return mixColor(HAZE_ANCHORS[index], HAZE_ANCHORS[index + 1], scaled - index);
  }

  /**
   * Colour-shifting volumetric haze.
   *
   * A handful of very large, very soft radial gradients drifting across the
   * stage. It is keyed to the music rather than being decoration: hue follows
   * spectral centroid, density follows loudness, and the drift rate follows
   * spectral flux, so the atmosphere of a quiet dark passage and a bright busy
   * one genuinely differ.
   *
   * Drawn after the background and before the graph, so it reads as air the
   * nodes sit inside rather than as a wash over the top of them.
   */
  function drawColorHaze(nowSec) {
    const strength = Number(sceneHaze?.value || 0);
    if (strength <= 0.001 || nodesOnly.checked) {
      return;
    }

    const frame = state.map && player.src ? getInterpolatedFrameAtTime(player.currentTime) : null;
    const centroid = clamp(Number(frame?.centroidN ?? 0.45), 0, 1);
    const energy = clamp(Number(frame?.rmsN ?? 0.35), 0, 1);
    const flux = clamp(Number(frame?.fluxN ?? 0.3), 0, 1);

    // Colour eases toward its target so a single percussive frame cannot make
    // the whole atmosphere jump hue.
    state.hazeHue = lerp(state.hazeHue, centroid, 0.035);
    state.hazeEnergy = lerp(state.hazeEnergy, energy, 0.06);

    const drift = Number(hazeDrift?.value || 1) * (0.35 + flux * 0.9);
    const blobs = state.renderQuality > 0.75 ? 5 : 3;
    const maxDim = Math.max(state.width, state.height);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < blobs; i += 1) {
      const phase = nowSec * drift * (0.05 + i * 0.017) + i * 2.1;
      const x = state.width * (0.5 + Math.cos(phase) * (0.28 + i * 0.05));
      const y = state.height * (0.5 + Math.sin(phase * 0.83 + i) * (0.24 + i * 0.04));
      const radius = maxDim * (0.28 + i * 0.07);

      // Each blob is offset along the ramp, so the haze is a gradient of
      // related hues rather than one flat colour.
      const color = hazeColorAt(state.hazeHue + (i - blobs * 0.5) * 0.06);
      const alpha = clamp(strength * (0.055 + state.hazeEnergy * 0.09) * (1 - i * 0.11), 0.004, 0.2);

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, rgba(color, alpha.toFixed(3)));
      gradient.addColorStop(0.55, rgba(color, (alpha * 0.4).toFixed(3)));
      gradient.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = gradient;
      // Fill only the blob's own box. Filling the whole canvas per blob was
      // five full-screen overdraws a frame for gradient stops that are
      // transparent outside this rectangle anyway.
      const left = Math.max(0, x - radius);
      const top = Math.max(0, y - radius);
      ctx.fillRect(
        left,
        top,
        Math.min(state.width, x + radius) - left,
        Math.min(state.height, y + radius) - top,
      );
    }

    ctx.restore();
  }

  function drawTrail(nowSec) {
    if (state.trail.length < 2) {
      return;
    }
  
    const flare = Number(trailFlare.value);
    const blur = Number(motionBlur.value);
  
    const projected = [];
    for (const node of state.trail) {
      const p = projectPoint3D(node.x, node.y, node.z, nowSec, node.life);
      if (p) {
        projected.push({ ...p, node });
      }
    }

    // Extend the trail to the interpolated playhead so the head glides between
    // analysis frames rather than stepping from one to the next.
    const head = state.trailHead;
    if (head && !player.paused) {
      const hp = projectPoint3D(head.x, head.y, head.z, nowSec, 1);
      if (hp) {
        projected.push({
          ...hp,
          node: { index: -1, x: head.x, y: head.y, z: head.z, color: head.color, volume: head.volume, flux: head.flux, life: 1 },
        });
      }
    }

    if (projected.length < 2) {
      return;
    }
  
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const segmentCount = Math.max(1, projected.length - 1);

    drawTimeTube(projected, segmentCount);

    for (let i = 1; i < projected.length; i += 1) {
      const a = projected[i - 1];
      const b = projected[i];
      const life = Math.min(a.node.life, b.node.life);
      const energy = (a.node.volume + b.node.volume + a.node.flux + b.node.flux) * 0.25;
      const headBias = i / segmentCount;
      const meteorBoost = Math.pow(headBias, 1.45);
      const tailFade = 1 - Math.pow(1 - headBias, 1.85);
  
      const tailDesolve = Number(edgeTailFade.value);
      const alphaWide = clamp(
        life * (0.02 + energy * 0.36) * (0.45 + tailFade * (0.9 + flare * 0.85)),
        0.01,
        0.68,
      );
      ctx.strokeStyle = rgba(b.node.color, alphaWide.toFixed(3));
      ctx.lineWidth = 1.35 + energy * (3.4 + flare * 2.4) + meteorBoost * (3.6 + flare * 4.2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
  
      const alphaCore = clamp(
        life * (0.08 + energy * 0.72) * (0.55 + tailFade * (1 + flare * 0.95)),
        0.03,
        0.96,
      );
      ctx.strokeStyle = rgba(b.node.color, alphaCore.toFixed(3));
      ctx.lineWidth = 0.72 + energy * (1.6 + flare * 1.1) + meteorBoost * (1.9 + flare * 1.7);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
  
      if (blur > 0.01) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const bx = (dx / len) * blur * (2 + state.trailVelocity * 0.22);
        const by = (dy / len) * blur * (2 + state.trailVelocity * 0.22);
  
        const blurColor = shiftToInfra(b.node.color, clamp(tailDesolve * 0.38, 0, 1));
        ctx.strokeStyle = rgba(blurColor, clamp(alphaCore * 0.22, 0.01, 0.2).toFixed(3));
        ctx.lineWidth = Math.max(0.5, 0.8 + energy * 1.2);
        ctx.beginPath();
        ctx.moveTo(a.x - bx, a.y - by);
        ctx.lineTo(b.x - bx, b.y - by);
        ctx.stroke();
      }
    }
  
    if (!player.paused) {
      const head = projected[projected.length - 1];
      if (head) {
        const radius = 14 + head.node.volume * (16 + flare * 6.5);
        const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, radius);
        glow.addColorStop(0, rgba(head.node.color, clamp(0.76 + flare * 0.16, 0.76, 1).toFixed(3)));
        glow.addColorStop(1, rgba(head.node.color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(head.x, head.y, radius, 0, Math.PI * 2);
        ctx.fill();
  
        const prev = projected[projected.length - 2];
        if (prev) {
          const dx = head.x - prev.x;
          const dy = head.y - prev.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const streakLen = 10 + flare * 26 + head.node.flux * 18;
  
          const streak = ctx.createLinearGradient(
            head.x - ux * streakLen,
            head.y - uy * streakLen,
            head.x + ux * 2,
            head.y + uy * 2,
          );
          streak.addColorStop(0, rgba(head.node.color, 0));
          streak.addColorStop(0.72, rgba(head.node.color, clamp(0.24 + flare * 0.2, 0.24, 0.65).toFixed(3)));
          streak.addColorStop(1, rgba(head.node.color, clamp(0.84 + flare * 0.12, 0.84, 1).toFixed(3)));
  
          ctx.strokeStyle = streak;
          ctx.lineWidth = 1.4 + flare * 2.2;
          ctx.beginPath();
          ctx.moveTo(head.x - ux * streakLen, head.y - uy * streakLen);
          ctx.lineTo(head.x + ux * 2, head.y + uy * 2);
          ctx.stroke();
        }
      }
    }
  
    ctx.restore();
  }
  
  /**
   * Ghost layers: the cloud as it was N seconds ago and as it will be N
   * seconds from now, drawn faintly around the playhead.
   *
   * Past is tinted cool and future warm, so the direction of travel is
   * readable at a glance rather than inferred from motion. Only the
   * neighbourhood of each offset is drawn - rendering two whole extra clouds
   * would triple the frame cost to show something that is mostly redundant.
   */
  function drawTemporalGhosts(activeIndexFloat, nowSec) {
    const strength = Number(temporalGhosts?.value || 0);
    if (strength <= 0.001 || activeIndexFloat < 0 || !state.map || nodesOnly.checked) {
      return;
    }

    const profile = state.map.songProfile;
    const frameRate = Number(profile?.frameRate) || 0;
    if (frameRate <= 0) {
      return;
    }

    const offsetFrames = Number(ghostOffset?.value || 6) * frameRate;
    const tier = qualityTier();
    const span = Math.max(6, Math.round(26 * tier.waveDetail));
    const stride = Math.max(1, Math.round(2 / tier.waveDetail));
    const sizeScale = Number(pointScale.value);
    const past = { r: 108, g: 168, b: 255 };
    const future = { r: 255, g: 168, b: 108 };

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const direction of [-1, 1]) {
      const centre = activeIndexFloat + offsetFrames * direction;
      const tint = direction < 0 ? past : future;

      for (let step = -span; step <= span; step += stride) {
        const sample = sampleFrameAt(centre + step);
        if (!sample) {
          continue;
        }

        const p = projectPoint3D(sample.x, sample.y, sample.z, nowSec, 0);
        if (!p) {
          continue;
        }

        const falloff = 1 - Math.abs(step) / (span + 1);
        const alpha = clamp(strength * falloff * (0.06 + sample.volume * 0.2) * p.nearFade, 0.004, 0.42);
        const radius = clamp((0.6 + sample.volume * 2.6) * sizeScale * p.perspective * 0.05, 0.4, 12);

        ctx.fillStyle = rgba(mixColor(sample.color, tint, 0.55), alpha.toFixed(3));
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Structural section arcs: curves joining moments that sound alike but are
   * far apart in the song, so a chorus visibly links back to its earlier
   * occurrences. The pairs come from the kNN graph that already exists.
   */
  function drawSectionArcs(byIndex, activeIndexFloat, nowSec) {
    const strength = Number(sectionArcs?.value || 0);
    const links = state.map?.sectionLinks;
    if (strength <= 0.001 || !links || links.length === 0 || nodesOnly.checked) {
      return;
    }

    const dpr = Math.max(1, state.dpr || 1);
    const budget = Math.max(6, Math.round(links.length * qualityTier().waveDetail));

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < Math.min(budget, links.length); i += 1) {
      const link = links[i];
      const a = byIndex.get(link.a) || projectFrameIndex(link.a, nowSec);
      const b = byIndex.get(link.b) || projectFrameIndex(link.b, nowSec);
      if (!a || !b) {
        continue;
      }

      // An arc lights up as the playhead reaches either end, which is the
      // moment the repeat is audible.
      const focus = Math.max(
        activityForIndex(link.a, activeIndexFloat, 14),
        activityForIndex(link.b, activeIndexFloat, 14),
      );
      const alpha = clamp(strength * (0.05 + link.weight * 0.1 + focus * 0.62), 0.006, 0.85);

      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 1;
      // Bulge perpendicular to the chord so the arc reads as a link rather
      // than as another edge in the graph.
      const bulge = Math.min(distance * 0.42, Math.min(state.width, state.height) * 0.3);
      const cx = midX - (dy / distance) * bulge;
      const cy = midY + (dx / distance) * bulge;

      const color = mixColor(a.frame.color, b.frame.color, 0.5);
      ctx.strokeStyle = rgba(color, alpha.toFixed(3));
      ctx.lineWidth = Math.max(0.6 * dpr, (0.7 + link.weight * 1.2 + focus * 2.4) * dpr);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cx, cy, b.x, b.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Projects a frame that decimation left out of `byIndex`. Section arcs
   * anchor to specific frames, and dropping an arc because its endpoint
   * happened to be decimated away would make the structure flicker with the
   * decimation stride.
   */
  function projectFrameIndex(index, nowSec) {
    const frame = state.map?.frames?.[index];
    if (!frame) {
      return null;
    }
    const p = projectPoint3D(frame.x, frame.y, frame.z, nowSec, 0);
    return p ? { x: p.x, y: p.y, frame, radius: 1, nearFade: p.nearFade } : null;
  }

  function drawFlowParticles(activeIndex, nowSec) {
    if (!showFlowArrows?.checked) {
      return;
    }

    if (!state.map || player.paused || activeIndex < 2) {
      return;
    }
  
    const density = Number(flowDensity.value);
    const perfMs = Number(state.renderEmaMs || 16.7);
    const perfLoad = clamp((perfMs - 16.7) / 16, 0, 1);
    const particleBudget = 1 - perfLoad * 0.45;
    const particleCount = Math.max(8, Math.floor((14 + density * 70) * particleBudget));
    const pathLength = Math.min(340, Math.max(40, Math.floor(activeIndex * (1 - perfLoad * 0.12))));
    const speed = 0.25 + Number(motionStrength.value) * 0.42;
  
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
  
    for (let i = 0; i < particleCount; i += 1) {
      const phase = (nowSec * speed + i / particleCount) % 1;
      const idxFloat = activeIndex - phase * pathLength;
      const sample = sampleFrameAt(idxFloat);
      const ahead = sampleFrameAt(idxFloat - 1.3);
      const behind = sampleFrameAt(idxFloat + 1.3);
  
      if (!sample || !ahead || !behind) {
        continue;
      }
  
      const p = projectPoint3D(sample.x, sample.y, sample.z, nowSec, 1);
      const pA = projectPoint3D(ahead.x, ahead.y, ahead.z, nowSec, 1);
      const pB = projectPoint3D(behind.x, behind.y, behind.z, nowSec, 1);
      if (!p || !pA || !pB) {
        continue;
      }
  
      const dx = pA.x - pB.x;
      const dy = pA.y - pB.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
  
      const e = clamp((sample.volume + sample.flux) * 0.5, 0, 1);
      const trailLen = 6 + e * 26;
      const alpha = clamp(0.14 + e * 0.72, 0.1, 0.92);
  
      ctx.strokeStyle = rgba(sample.color, alpha.toFixed(3));
      ctx.lineWidth = 0.8 + e * 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x - nx * trailLen, p.y - ny * trailLen);
      ctx.lineTo(p.x + nx * trailLen * 0.2, p.y + ny * trailLen * 0.2);
      ctx.stroke();
  
      ctx.fillStyle = rgba(sample.color, clamp(alpha * 1.16, 0.2, 0.98).toFixed(3));
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.9 + e * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  
    ctx.restore();
  }
  
  function drawEdges(byIndex, visibleIndices, activeIndex, nowSec, activeIndexFloat = activeIndex) {
    if (!state.map || !showConnections.checked) {
      return;
    }

    const mode = edgeMode.value;
    const edgeStrength = Number(edgeOpacity.value);
    const edgeLightBoost = Number(edgeBrightness?.value || 1);
    const edgeThicknessBoost = Number(edgeWidthBoost?.value || 1);
    const trailLength = Number(edgeTrailLength.value);
    const tailFade = Number(edgeTailFade.value);
    const solidness = Number(edgeSolidness.value);
    const neighborVisibility = Number(knnBoost.value);
    const window = 6 + Number(flowDensity.value) * 18;
    const motionValue = Number(motionStrength.value);
    const waveAmpBoost = Number(waveAmplification?.value || 1);
    const ribbonWaveSpeedBoost = Number(edgeRibbonWaveSpeed?.value || 1);
    const ribbonFlexibility = Number(edgeRibbonFlexibility?.value || 1);
    const ribbonSoftness = Number(edgeRibbonSoftness?.value || 0.55);
    const nodeHitPulseStrength = Number(nodeHitPulse.value);
    // Budgets come from the latched quality tier rather than from a raw EMA of
    // frame cost. Thresholding the EMA directly made the edge stride and the
    // visibility cutoff change several times a second, which is what read as
    // flickering when the camera was close in.
    const tier = qualityTier();
    const waveDetail = tier.waveDetail;
    const edgeVisibilityCutoff = 0.014;
    const cinemaBoost = cinemaMode.checked ? 1.15 : 0.72;
    const glowShiftAmt = Number(glowShift.value);
    const idleVisibility = activeIndex < 0 ? 0.52 : 1;
    const playbackTime = !player.paused ? player.currentTime : nowSec;
    const liveFrame = getInterpolatedFrameAtTime(playbackTime);
    const style = edgeStyle?.value || "wave";
    const useWave = style === "wave";
    const useRibbon = style === "ribbon";
    const lowUseColor = { r: 74, g: 106, b: 236 };
    const harmonicDetail = Number(edgeWaveHarmonics?.value ?? 0.6);
    // Live spectral flatness decides how harmonically dense the waveforms are.
    const liveNoisiness = clamp(Number(liveFrame?.flatnessN ?? 0.4), 0, 1);

    // Only edges this close to the playhead earn the animated waveform, the
    // per-edge gradient, and the comet head. Everything else is batched.
    const ACTIVE_EDGE_MIN = 0.055;

    for (const bucket of quietBuckets) {
      bucket.points.length = 0;
      bucket.count = 0;
      bucket.r = 0;
      bucket.g = 0;
      bucket.b = 0;
      bucket.width = 0;
    }

    /**
     * Files one dim edge into a colour/alpha bucket instead of stroking it.
     * Colour is quantised to 4 levels per channel and alpha to 3 levels; at the
     * alphas these edges draw at, the quantisation error is not visible.
     */
    const pushQuietEdge = (ax, ay, bx, by, color, alpha, width) => {
      const alphaStep = Math.min(QUIET_ALPHA_STEPS - 1, Math.floor((alpha / 0.34) * QUIET_ALPHA_STEPS));
      const colorKey = ((color.r >> 6) << 4) | ((color.g >> 6) << 2) | (color.b >> 6);
      const bucket = quietBuckets[alphaStep * 64 + colorKey];
      bucket.points.push(ax, ay, bx, by);
      bucket.r += color.r;
      bucket.g += color.g;
      bucket.b += color.b;
      bucket.width += width;
      bucket.count += 1;
    };

    const flushQuietEdges = () => {
      for (let i = 0; i < QUIET_BUCKET_COUNT; i += 1) {
        const bucket = quietBuckets[i];
        if (bucket.count === 0) {
          continue;
        }

        const inv = 1 / bucket.count;
        const alphaStep = Math.floor(i / 64);
        const alpha = ((alphaStep + 0.5) / QUIET_ALPHA_STEPS) * 0.34;
        ctx.strokeStyle = rgba(
          { r: bucket.r * inv, g: bucket.g * inv, b: bucket.b * inv },
          alpha.toFixed(3),
        );
        ctx.lineWidth = Math.max(0.24, bucket.width * inv);
        ctx.beginPath();
        for (let p = 0; p < bucket.points.length; p += 4) {
          ctx.moveTo(bucket.points[p], bucket.points[p + 1]);
          ctx.lineTo(bucket.points[p + 2], bucket.points[p + 3]);
        }
        ctx.stroke();
      }
    };

    // Usage heat now only tracks edges that actually animate, so the decay walk
    // below stays in the low hundreds of entries instead of the low thousands.
    const useUsageHeat = true;

    if (!player.paused && state.connectionUsage.size > 0) {
      let decayedMax = 0;
      for (const [key, value] of state.connectionUsage.entries()) {
        const next = value * 0.992;
        if (next < 0.0008) {
          state.connectionUsage.delete(key);
          continue;
        }
        state.connectionUsage.set(key, next);
        if (next > decayedMax) {
          decayedMax = next;
        }
      }
      state.connectionUsageMax = decayedMax;
    }
  
    const registerConnectionPulse = (index, amount) => {
      if (index < 0) {
        return;
      }
      const current = state.connectionPulse.get(index) || 0;
      state.connectionPulse.set(index, Math.max(current, amount));
    };

    const edgeKey = (prefix, a, b) => (a <= b ? `${prefix}:${a}:${b}` : `${prefix}:${b}:${a}`);

    const registerConnectionUsage = (key, activity) => {
      if (player.paused || !key || !useUsageHeat) {
        return;
      }
      const current = state.connectionUsage.get(key) || 0;
      const increment = clamp(0.006 + activity * 0.08, 0.003, 0.11);
      const next = current + increment;
      state.connectionUsage.set(key, next);
      if (next > state.connectionUsageMax) {
        state.connectionUsageMax = next;
      }
    };

    const connectionColorByUsage = (baseColor, key, activity) => {
      if (!useUsageHeat || !key) {
        return baseColor;
      }
      const maxUsage = Math.max(0.0001, state.connectionUsageMax || 0);
      const usage = state.connectionUsage.get(key) || 0;
      const usageNorm = clamp(usage / maxUsage, 0, 1);
      const activityBoost = clamp(activity * 0.08, 0, 0.08);
      const usageMix = clamp(usageNorm * 0.92 + activityBoost, 0, 1);
      return mixColor(lowUseColor, baseColor, usageMix);
    };
  
    const drawCometSegmentWave = (ax, ay, bx, by, color, alpha, width, phaseSeed, activity, edgeA, edgeB, freqFactor, noisiness) => {
      const phase = (playbackTime * (0.65 + motionValue * 0.24) + phaseSeed) % 1;
      const lenRatio = clamp(trailLength * (0.45 + activity * 0.9), 0.16, 1);
      const t1 = phase;
      const t0 = Math.max(0, t1 - lenRatio);
  
      if (t1 <= 0.001) {
        return;
      }
  
      const dx = bx - ax;
      const dy = by - ay;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      // Perpendicular vector
      const px = -ny;
      const py = nx;
  
      // Wave properties are synced to current playback frequency.
      const waveFreq = 1.1 + freqFactor * 9.5;
      const waveAmp = Math.min(dist * 0.2, (1.25 + freqFactor * 3.9) * (0.42 + activity * 1.15) * waveAmpBoost);
      const waveSpeed = 0.55 + freqFactor * 2.2 + motionValue * 0.55;
      const partialCount = buildWavePartials(noisiness, harmonicDetail);
      const timePhase = playbackTime * waveSpeed * Math.PI * 2;

      const getWavePoint = (t) => {
        const lx = ax + dx * t;
        const ly = ay + dy * t;
        // Envelope pins the wave exactly at both nodes.
        const envelope = Math.sin(t * Math.PI);
        // A fundamental plus its partials, weighted by how noise-like the
        // spectrum is, so the line reads as a waveform rather than a rope.
        let sum = 0;
        for (let k = 0; k < partialCount; k += 1) {
          const mult = WAVE_PARTIAL_MULTS[k];
          sum += wavePartialAmps[k] * Math.sin(t * Math.PI * 2 * waveFreq * mult + timePhase * mult);
        }
        const offset = sum * waveAmp * envelope;
        return {
          x: lx + px * offset,
          y: ly + py * offset,
        };
      };

      const tailColor = shiftToInfra(color, clamp(glowShiftAmt * (0.22 + (1 - activity) * 0.5), 0, 1));
      const backboneAlpha = clamp(alpha * (0.08 + solidness * (0.62 + tailFade * 0.16)), 0.006, 0.56);
  
      // Draw full wave backbone.
      ctx.strokeStyle = rgba(tailColor, backboneAlpha.toFixed(3));
      ctx.lineWidth = Math.max(0.24, 0.34 + width * (0.16 + solidness * 0.08));
      ctx.beginPath();
      // More partials need more sample points, or the harmonics alias into a
      // zigzag. Tie the step count to the live partial count and the tier.
      const stepWidth = (3 + (1 - waveDetail) * 5) / Math.max(1, 0.55 + partialCount * 0.3);
      const steps = Math.max(9, Math.floor(dist / stepWidth));
      for (let i = 0; i <= steps; i++) {
        const p = getWavePoint(i / steps);
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
  
      // Draw active comet segment.
      const startWave = getWavePoint(t0);
      const endWave = getWavePoint(t1);
      const grad = ctx.createLinearGradient(startWave.x, startWave.y, endWave.x, endWave.y);
      const particleMix = clamp(1.08 - solidness * 0.86, 0.16, 1.08);
      grad.addColorStop(0, rgba(tailColor, clamp(alpha * (0.06 + tailFade * 0.1) * particleMix, 0.004, 0.22).toFixed(3)));
      grad.addColorStop(0.55, rgba(color, clamp(alpha * (0.22 + tailFade * 0.24) * particleMix, 0.008, 0.56).toFixed(3)));
      grad.addColorStop(1, rgba(color, clamp(alpha * 1.12 * particleMix, 0.03, 0.98).toFixed(3)));
  
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(0.32, width * (0.86 - solidness * 0.34));
      ctx.beginPath();
  
      // Draw only the active [t0, t1] section.
      const subSteps = Math.ceil(steps * (t1 - t0));
      const safeSubSteps = Math.max(4, subSteps);
  
      for (let i = 0; i <= safeSubSteps; i++) {
        const localT = i / safeSubSteps;
        const t = t0 + localT * (t1 - t0);
        const p = getWavePoint(t);
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
  
      if (t1 > 0.94) {
        registerConnectionPulse(edgeB, clamp(activity * nodeHitPulseStrength, 0, 2.8));
      }
      if (t0 < 0.06) {
        registerConnectionPulse(edgeA, clamp(activity * nodeHitPulseStrength * 0.7, 0, 2.8));
      }
    };
  
    const drawCometSegmentLine = (ax, ay, bx, by, color, alpha, width, phaseSeed, activity, edgeA, edgeB) => {
      const phase = (playbackTime * (0.65 + motionValue * 0.24) + phaseSeed) % 1;
      const len = clamp(trailLength * (0.45 + activity * 0.9), 0.16, 1);
      const t1 = phase;
      const t0 = Math.max(0, t1 - len);
  
      if (t1 <= 0.001) {
        return;
      }
  
      const x0 = lerp(ax, bx, t0);
      const y0 = lerp(ay, by, t0);
      const x1 = lerp(ax, bx, t1);
      const y1 = lerp(ay, by, t1);
  
      const tailColor = shiftToInfra(color, clamp(glowShiftAmt * (0.22 + (1 - activity) * 0.5), 0, 1));
  
      const backboneAlpha = clamp(alpha * (0.08 + solidness * (0.62 + tailFade * 0.16)), 0.006, 0.56);
      ctx.strokeStyle = rgba(tailColor, backboneAlpha.toFixed(3));
      ctx.lineWidth = Math.max(0.24, 0.34 + width * (0.16 + solidness * 0.08));
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
  
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      const particleMix = clamp(1.08 - solidness * 0.86, 0.16, 1.08);
      grad.addColorStop(0, rgba(tailColor, clamp(alpha * (0.06 + tailFade * 0.1) * particleMix, 0.004, 0.22).toFixed(3)));
      grad.addColorStop(0.55, rgba(color, clamp(alpha * (0.22 + tailFade * 0.24) * particleMix, 0.008, 0.56).toFixed(3)));
      grad.addColorStop(1, rgba(color, clamp(alpha * 1.12 * particleMix, 0.03, 0.98).toFixed(3)));
  
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(0.32, width * (0.86 - solidness * 0.34));
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
  
      if (t1 > 0.94) {
        registerConnectionPulse(edgeB, clamp(activity * nodeHitPulseStrength, 0, 2.8));
      }
      if (t0 < 0.06) {
        registerConnectionPulse(edgeA, clamp(activity * nodeHitPulseStrength * 0.7, 0, 2.8));
      }
    };
  
    const drawCometSegmentCurve = (a, b, cx, cy, color, alpha, width, phaseSeed, activity, edgeA, edgeB) => {
      const phase = (playbackTime * (0.62 + motionValue * 0.22) + phaseSeed) % 1;
      const len = clamp(trailLength * (0.42 + activity * 0.95), 0.14, 1);
      const t1 = phase;
      const t0 = Math.max(0, t1 - len);
      if (t1 <= 0.001) {
        return;
      }
  
      const q = (t, p0, p1, p2) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
      const steps = Math.max(4, Math.ceil(8 + activity * 8));
  
      const tailColor = shiftToInfra(color, clamp(glowShiftAmt * (0.22 + (1 - activity) * 0.5), 0, 1));
  
      const backboneAlpha = clamp(alpha * (0.08 + solidness * (0.62 + tailFade * 0.16)), 0.006, 0.56);
      ctx.strokeStyle = rgba(tailColor, backboneAlpha.toFixed(3));
      ctx.lineWidth = Math.max(0.24, 0.34 + width * (0.16 + solidness * 0.08));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cx, cy, b.x, b.y);
      ctx.stroke();
  
      const xStart = q(t0, a.x, cx, b.x);
      const yStart = q(t0, a.y, cy, b.y);
      const xEnd = q(t1, a.x, cx, b.x);
      const yEnd = q(t1, a.y, cy, b.y);
      const grad = ctx.createLinearGradient(xStart, yStart, xEnd, yEnd);
      const particleMix = clamp(1.08 - solidness * 0.86, 0.16, 1.08);
      grad.addColorStop(0, rgba(tailColor, clamp(alpha * (0.06 + tailFade * 0.1) * particleMix, 0.004, 0.22).toFixed(3)));
      grad.addColorStop(0.55, rgba(color, clamp(alpha * (0.22 + tailFade * 0.24) * particleMix, 0.008, 0.56).toFixed(3)));
      grad.addColorStop(1, rgba(color, clamp(alpha * 1.12 * particleMix, 0.03, 0.98).toFixed(3)));
  
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(0.32, width * (0.86 - solidness * 0.34));
      ctx.beginPath();
      for (let step = 0; step <= steps; step += 1) {
        const t = lerp(t0, t1, step / steps);
        const x = q(t, a.x, cx, b.x);
        const y = q(t, a.y, cy, b.y);
        if (step === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
  
      if (t1 > 0.94) {
        registerConnectionPulse(edgeB, clamp(activity * nodeHitPulseStrength, 0, 2.8));
      }
      if (t0 < 0.06) {
        registerConnectionPulse(edgeA, clamp(activity * nodeHitPulseStrength * 0.7, 0, 2.8));
      }
    };

    const drawCometSegmentRibbon = (ax, ay, bx, by, color, alpha, width, phaseSeed, activity, edgeA, edgeB, freqFactor, noisiness) => {
      const phase = (playbackTime * (0.62 + motionValue * 0.22) + phaseSeed) % 1;
      const lenRatio = clamp(trailLength * (0.42 + activity * 0.98), 0.14, 1);
      const t1 = phase;
      const t0 = Math.max(0, t1 - lenRatio);

      if (t1 <= 0.001) {
        return;
      }

      const dx = bx - ax;
      const dy = by - ay;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      const px = -ny;
      const py = nx;

      const waveFreq = 0.95 + freqFactor * 7.6;
      const musicShape = clamp(
        ((liveFrame?.peakN ?? freqFactor) * 0.64 + (liveFrame?.centroidN ?? freqFactor) * 0.36),
        0,
        1,
      );
      const adaptiveFreq = waveFreq * (0.78 + musicShape * (0.55 + ribbonFlexibility * 0.24));
      const waveAmp = Math.min(
        dist * 0.24,
        (0.8 + freqFactor * (2.4 + ribbonFlexibility * 1.4))
          * (0.28 + activity * (0.78 + ribbonFlexibility * 0.35))
          * waveAmpBoost,
      );
      const waveSpeed = (0.35 + freqFactor * 1.7 + motionValue * 0.44) * ribbonWaveSpeedBoost;
      const ribbonHalfWidth = Math.max(1.05, width * (0.74 + activity * 0.86));
      const partialCount = buildWavePartials(noisiness, harmonicDetail);
      const timePhase = playbackTime * waveSpeed * Math.PI * 2;

      const centerPoint = (t) => {
        const lx = ax + dx * t;
        const ly = ay + dy * t;
        const envelope = Math.sin(t * Math.PI);
        const bendBias = Math.sin(playbackTime * (0.7 + adaptiveFreq * 0.14) + t * Math.PI * 2) * ribbonFlexibility * (0.2 + musicShape * 0.5);
        let sum = 0;
        for (let k = 0; k < partialCount; k += 1) {
          const mult = WAVE_PARTIAL_MULTS[k];
          sum += wavePartialAmps[k] * Math.sin(t * Math.PI * 2 * adaptiveFreq * mult + timePhase * mult + bendBias);
        }
        const offset = sum * waveAmp * envelope;
        return {
          x: lx + px * offset,
          y: ly + py * offset,
          envelope,
        };
      };

      const tailColor = shiftToInfra(color, clamp(glowShiftAmt * (0.18 + (1 - activity) * 0.5), 0, 1));
      const stepWidth = (3.2 + (1 - waveDetail) * 5) / Math.max(1, 0.55 + partialCount * 0.28);
      const steps = Math.max(10, Math.floor(dist / stepWidth));
      const top = [];
      const bottom = [];

      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const cp = centerPoint(t);
        const thickness = ribbonHalfWidth * (0.6 + cp.envelope * (0.8 + activity * 0.3));
        top.push({ x: cp.x + px * thickness, y: cp.y + py * thickness });
        bottom.push({ x: cp.x - px * thickness, y: cp.y - py * thickness });
      }

      ctx.beginPath();
      ctx.moveTo(top[0].x, top[0].y);
      for (let i = 1; i < top.length; i += 1) {
        ctx.lineTo(top[i].x, top[i].y);
      }
      for (let i = bottom.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(bottom[i].x, bottom[i].y);
      }
      ctx.closePath();
      const fillAlpha = clamp(alpha * (0.09 + solidness * 0.34) * (1 - ribbonSoftness * 0.38), 0.012, 0.62);
      ctx.fillStyle = rgba(tailColor, fillAlpha.toFixed(3));
      ctx.fill();

      ctx.strokeStyle = rgba(color, clamp(alpha * (0.16 + ribbonSoftness * 0.18), 0.02, 0.6).toFixed(3));
      ctx.lineWidth = Math.max(0.8, ribbonHalfWidth * (0.65 + ribbonSoftness * 1.15));
      ctx.beginPath();
      ctx.moveTo(top[0].x, top[0].y);
      for (let i = 1; i < top.length; i += 1) {
        ctx.lineTo(top[i].x, top[i].y);
      }
      for (let i = bottom.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(bottom[i].x, bottom[i].y);
      }
      ctx.closePath();
      ctx.stroke();

      const activeStart = centerPoint(t0);
      const activeEnd = centerPoint(t1);
      const activeGrad = ctx.createLinearGradient(activeStart.x, activeStart.y, activeEnd.x, activeEnd.y);
      activeGrad.addColorStop(0, rgba(tailColor, clamp(alpha * 0.08, 0.012, 0.24).toFixed(3)));
      activeGrad.addColorStop(0.58, rgba(color, clamp(alpha * 0.34, 0.03, 0.72).toFixed(3)));
      activeGrad.addColorStop(1, rgba(color, clamp(alpha * 1.12, 0.05, 0.98).toFixed(3)));

      ctx.strokeStyle = activeGrad;
      ctx.lineWidth = Math.max(0.8, ribbonHalfWidth * 0.7);
      ctx.beginPath();
      const waveSteps = Math.max(6, Math.ceil((t1 - t0) * steps));
      for (let i = 0; i <= waveSteps; i += 1) {
        const t = t0 + (i / waveSteps) * (t1 - t0);
        const cp = centerPoint(t);
        if (i === 0) {
          ctx.moveTo(cp.x, cp.y);
        } else {
          ctx.lineTo(cp.x, cp.y);
        }
      }
      ctx.stroke();

      const lightBandT = (phase + 0.12) % 1;
      const lightBand = centerPoint(lightBandT);
      const glowRadius = ribbonHalfWidth * (1.9 + ribbonSoftness * 1.4);
      const glow = ctx.createRadialGradient(lightBand.x, lightBand.y, 0, lightBand.x, lightBand.y, glowRadius);
      glow.addColorStop(0, rgba(color, clamp(alpha * 1.2, 0.12, 0.95).toFixed(3)));
      glow.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lightBand.x, lightBand.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      if (t1 > 0.94) {
        registerConnectionPulse(edgeB, clamp(activity * nodeHitPulseStrength, 0, 2.8));
      }
      if (t0 < 0.06) {
        registerConnectionPulse(edgeA, clamp(activity * nodeHitPulseStrength * 0.7, 0, 2.8));
      }
    };
  
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
  
    /** Dispatches one active edge to the renderer for the selected style. */
    const drawActiveEdge = (a, b, edgeA, edgeB, color, alpha, width, activity, seed) => {
      const freqFactor = edgeFrequencyFactor(a.frame, b.frame, liveFrame, activity);
      // Blend the two endpoints' own flatness toward the live frame's, so a
      // waveform near the playhead takes the character of what is sounding now.
      const edgeNoise = clamp((a.frame.flatnessN + b.frame.flatnessN) * 0.5, 0, 1);
      const noisiness = lerp(edgeNoise, liveNoisiness, clamp(activity * 1.3, 0, 1));

      if (useRibbon) {
        drawCometSegmentRibbon(a.x, a.y, b.x, b.y, color, alpha, width, seed, activity, edgeA, edgeB, freqFactor, noisiness);
      } else if (useWave) {
        drawCometSegmentWave(a.x, a.y, b.x, b.y, color, alpha, width, seed, activity, edgeA, edgeB, freqFactor, noisiness);
      } else {
        drawCometSegmentLine(a.x, a.y, b.x, b.y, color, alpha, width, seed, activity, edgeA, edgeB);
      }
    };

    if (mode === "temporal" || mode === "both") {
      for (let i = 1; i < visibleIndices.length; i += 1) {
        const edgeA = visibleIndices[i - 1];
        const edgeB = visibleIndices[i];
        const a = byIndex.get(edgeA);
        const b = byIndex.get(edgeB);
        if (!a || !b) {
          continue;
        }

        const activity = Math.max(
          activityForIndex(edgeA, activeIndexFloat, window),
          activityForIndex(edgeB, activeIndexFloat, window),
        );

        const nearFade = Math.min(a.nearFade, b.nearFade);
        const alpha = clamp(
          (0.04 + activity * 0.42) * edgeStrength * edgeLightBoost * cinemaBoost * idleVisibility * nearFade,
          0.001,
          0.96,
        );
        if (alpha < edgeVisibilityCutoff && activity < ACTIVE_EDGE_MIN) {
          continue;
        }
        const width = (0.52 + activity * 2.25) * edgeThicknessBoost;
        const baseColor = activity > 0.04 ? b.frame.color : { r: 105, g: 118, b: 138 };

        if (activity < ACTIVE_EDGE_MIN) {
          pushQuietEdge(a.x, a.y, b.x, b.y, baseColor, alpha, width);
          continue;
        }

        const usageKey = edgeKey("t", edgeA, edgeB);
        registerConnectionUsage(usageKey, activity);
        const color = connectionColorByUsage(baseColor, usageKey, activity);

        if (!useWave && !useRibbon) {
          const curve = (0.08 + motionValue * 0.07 + activity * 0.28) * Math.sin(playbackTime * 0.8 + edgeA * 0.02);
          const cx = (a.x + b.x) * 0.5 + (b.y - a.y) * curve;
          const cy = (a.y + b.y) * 0.5 - (b.x - a.x) * curve;
          drawCometSegmentCurve(a, b, cx, cy, color, alpha, width, edgeA * 0.019 + edgeB * 0.013, activity, edgeA, edgeB);
        } else {
          drawActiveEdge(a, b, edgeA, edgeB, color, alpha, width, activity, edgeA * 0.019 + edgeB * 0.013);
        }
      }
    }

    if (mode === "knn" || mode === "both") {
      const knnEdges = state.map.knnEdges;
      // A fixed stride derived from the latched tier. Because the tier only
      // changes after a sustained cost change, the same edges stay on screen
      // frame to frame instead of half the web blinking with the EMA.
      const stride = Math.max(1, Math.ceil(knnEdges.length / Math.max(1, tier.edgeBudget)));

      for (let i = 0; i < knnEdges.length; i += 1) {
        const edge = knnEdges[i];
        const a = byIndex.get(edge.a);
        const b = byIndex.get(edge.b);
        if (!a || !b) {
          continue;
        }

        const activity = Math.max(
          activityForIndex(edge.a, activeIndexFloat, window * 0.86),
          activityForIndex(edge.b, activeIndexFloat, window * 0.86),
        );

        // Edges near the playhead are never decimated: those are the ones the
        // viewer is actually reading. The budget only thins the quiet web.
        if (activity < ACTIVE_EDGE_MIN && i % stride !== 0) {
          continue;
        }

        const nearFade = Math.min(a.nearFade, b.nearFade);
        const alpha = clamp(
          (0.025 + edge.weight * 0.16 * neighborVisibility + activity * 0.26)
            * edgeStrength
            * edgeLightBoost
            * (cinemaMode.checked ? 1 : 0.8)
            * idleVisibility
            * nearFade,
          0.001,
          0.95,
        );
        if (alpha < edgeVisibilityCutoff) {
          continue;
        }
        const width = (0.5 + edge.weight * 1.42 * neighborVisibility + activity * 1.2) * edgeThicknessBoost;

        if (activity < ACTIVE_EDGE_MIN) {
          pushQuietEdge(a.x, a.y, b.x, b.y, b.frame.color, alpha, width);
          continue;
        }

        const usageKey = edgeKey("k", edge.a, edge.b);
        registerConnectionUsage(usageKey, activity);
        const edgeColor = connectionColorByUsage(b.frame.color, usageKey, activity);
        drawActiveEdge(a, b, edge.a, edge.b, edgeColor, alpha, width, activity, edge.a * 0.017 + edge.b * 0.021);
      }
    }

    flushQuietEdges();

    ctx.restore();
  }
  
  function drawLabels(projected, activeIndex) {
    if (!showLabels.checked || projected.length === 0) {
      return;
    }
  
    const dpr = Math.max(1, state.dpr || 1);
    const perfMs = Number(state.renderEmaMs || 16.7);
    const perfLoad = clamp((perfMs - 16.7) / 16, 0, 1);
    const densityCell = Math.max(22 * dpr, 52) * (1 + perfLoad * 0.25);
    const densityMap = buildLocalDensityMap(projected, densityCell);
  
    const ranked = [...projected]
      .map((item) => ({
        item,
        score: item.radius * (0.7 + item.frame.rmsN * 0.7 + item.activity * 1.1),
      }))
      .sort((a, b) => b.score - a.score);
  
    const stableBudget = clamp(1 - perfLoad * 0.35, 0.6, 1);
    const activeBudget = clamp(1 - perfLoad * 0.3, 0.65, 1);
    const stableCount = Math.min(Math.max(22, Math.floor(56 * stableBudget)), ranked.length);
    const activeCount = Math.min(Math.max(30, Math.floor(86 * activeBudget)), ranked.length);
  
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
  
    for (let i = 0; i < stableCount; i += 1) {
      const item = ranked[i].item;
      if (item.radius < 0.8) {
        continue;
      }
  
      const localDensity = densityMap.get(item.index) || 1;
      const densityScale = computeLabelDensityScale(localDensity);
      const alpha = clamp((0.16 + item.frame.rmsN * 0.28) * densityScale, 0.08, 0.45);
      const fontPx = (8 + Math.min(4, item.radius * 0.2)) * dpr;
  
      ctx.font = `${fontPx.toFixed(1)}px "IBM Plex Mono", "SFMono-Regular", Menlo, monospace`;
      ctx.strokeStyle = `rgba(4, 8, 14, ${(alpha * 0.9).toFixed(3)})`;
      ctx.fillStyle = rgba(item.frame.color, alpha.toFixed(3));
      ctx.lineWidth = 2.2 * dpr;
  
      const lx = item.x + item.radius + 3 * dpr;
      const ly = item.y - item.radius * 0.08;
      ctx.strokeText(item.frame.label, lx, ly);
      ctx.fillText(item.frame.label, lx, ly);
    }
  
    if (activeIndex >= 0) {
      for (let i = 0; i < activeCount; i += 1) {
        const item = ranked[i].item;
        const focus = activityForIndex(item.index, activeIndex, 8);
        if (focus < 0.26) {
          continue;
        }
  
        const localDensity = densityMap.get(item.index) || 1;
        const densityScale = computeLabelDensityScale(localDensity);
        const alpha = clamp((0.45 + focus * 0.45) * densityScale, 0.32, 0.95);
        const fontPx = (9 + focus * 4.4) * dpr;
  
        ctx.font = `${fontPx.toFixed(1)}px "IBM Plex Mono", "SFMono-Regular", Menlo, monospace`;
        ctx.strokeStyle = `rgba(4, 8, 14, ${(alpha * 0.94).toFixed(3)})`;
        ctx.fillStyle = rgba(item.frame.color, alpha.toFixed(3));
        ctx.lineWidth = 2.7 * dpr;
  
        const lx = item.x + item.radius + 4 * dpr;
        const ly = item.y - item.radius * (0.16 + focus * 0.22);
        ctx.strokeText(item.frame.label, lx, ly);
        ctx.fillText(item.frame.label, lx, ly);
      }
    }
  
    ctx.restore();
  }

    function rankSceneOverlayAnchors(projected, activeIndex, perfLoad) {
      const dpr = Math.max(1, state.dpr || 1);
      const densityCell = Math.max(24 * dpr, 58) * (1 + perfLoad * 0.25);
      const densityMap = buildLocalDensityMap(projected, densityCell);

      return projected
        .map((item) => {
          const localDensity = densityMap.get(item.index) || 1;
          const densityScale = clamp(1 / Math.sqrt(Math.max(1, localDensity)), 0.28, 1);
          const focus = activeIndex >= 0 ? activityForIndex(item.index, activeIndex, 10) : 0;
          return {
            item,
            densityScale,
            focus,
            score:
              item.radius * (1.1 + item.frame.rmsN * 0.92 + item.activity * 1.18 + focus * 1.28) +
              densityScale * 14,
          };
        })
        .sort((a, b) => b.score - a.score);
    }

    function drawObservatoryOverlay(projected, activeIndex, nowSec) {
      const overlayEnabled = visualPreset.value === "observatory" || Boolean(observatoryOverlay?.checked);
      if (!overlayEnabled || projected.length === 0) {
        return;
      }

      const dpr = Math.max(1, state.dpr || 1);
      const perfMs = Number(state.renderEmaMs || 16.7);
      const perfLoad = clamp((perfMs - 16.7) / 18, 0, 1);
      const ranked = rankSceneOverlayAnchors(projected, activeIndex, perfLoad);
      const anchorCount = Math.min(
        Math.max(5, Math.round(9 * (1 - perfLoad * 0.25))),
        ranked.length,
      );
      const anchors = ranked.slice(0, anchorCount);
      const sceneBackground = PRESET_BACKGROUND.observatory;
      const auraColor = { r: sceneBackground.aura[0], g: sceneBackground.aura[1], b: sceneBackground.aura[2] };
      const chartAccent = { r: 247, g: 235, b: 197 };
      const presetBoost = visualPreset.value === "observatory" ? 1 : 0.82;

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";

      for (const entry of anchors) {
        const { item, densityScale, focus } = entry;
        const sweep = Math.sin(nowSec * 0.68 + item.index * 0.11) * 0.5 + 0.5;
        const baseRadius = clamp(
          item.radius * (2.4 + densityScale * 7.6 + focus * 2.2) * presetBoost,
          12 * dpr,
          Math.min(state.width, state.height) * 0.14,
        );
        const tintBase = mixColor(item.frame.color, auraColor, 0.38);
        const tintAccent = mixColor(item.frame.color, chartAccent, 0.42);
        const alpha = clamp(
          (0.026 + densityScale * 0.05 + focus * 0.14 + (visualPreset.value === "observatory" ? 0.035 : 0)) * presetBoost,
          0.022,
          0.18,
        );

        const haloRadius = baseRadius * (1.18 + sweep * 0.12);
        const halo = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, haloRadius);
        halo.addColorStop(0, rgba(tintBase, clamp(alpha * 0.5, 0.01, 0.08).toFixed(3)));
        halo.addColorStop(0.45, rgba(tintBase, clamp(alpha * 0.22, 0.01, 0.04).toFixed(3)));
        halo.addColorStop(1, rgba(tintBase, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(item.x, item.y, haloRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.setLineDash([
          Math.max(8 * dpr, baseRadius * 0.18),
          Math.max(12 * dpr, baseRadius * 0.14),
        ]);
        ctx.strokeStyle = rgba(tintBase, alpha.toFixed(3));
        ctx.lineWidth = Math.max(0.85 * dpr, (0.72 + densityScale * 0.8 + focus * 1.0) * dpr);
        const orbitStart = nowSec * 0.14 + item.index * 0.039;
        const orbitSpan = Math.PI * (0.68 + sweep * 0.42 + focus * 0.24);
        ctx.beginPath();
        ctx.arc(item.x, item.y, baseRadius, orbitStart, orbitStart + orbitSpan);
        ctx.stroke();

        ctx.setLineDash([
          Math.max(4 * dpr, baseRadius * 0.1),
          Math.max(14 * dpr, baseRadius * 0.18),
        ]);
        ctx.strokeStyle = rgba(tintAccent, clamp(alpha * 0.84, 0.03, 0.14).toFixed(3));
        ctx.lineWidth = Math.max(0.48 * dpr, (0.45 + densityScale * 0.56) * dpr);
        const innerStart = -nowSec * 0.22 + item.index * 0.031;
        ctx.beginPath();
        ctx.arc(item.x, item.y, baseRadius * 0.62, innerStart, innerStart + Math.PI * (0.44 + focus * 0.48));
        ctx.stroke();

        ctx.setLineDash([]);
        const satelliteAngle = orbitStart + orbitSpan * (0.26 + sweep * 0.3);
        const satelliteRadius = baseRadius + 1.5 * dpr;
        ctx.fillStyle = rgba(tintAccent, clamp(alpha * (0.9 + focus * 0.28), 0.03, 0.18).toFixed(3));
        ctx.beginPath();
        ctx.arc(
          item.x + Math.cos(satelliteAngle) * satelliteRadius,
          item.y + Math.sin(satelliteAngle) * satelliteRadius,
          Math.max(1.2 * dpr, (1.0 + densityScale * 1.1 + focus * 0.9) * dpr),
          0,
          Math.PI * 2,
        );
        ctx.fill();

        const sweepAngle = nowSec * 0.74 + item.index * 0.064;
        const sweepRadius = baseRadius * (0.72 + sweep * 0.22);
        ctx.strokeStyle = rgba(tintAccent, clamp(alpha * (0.62 + focus * 0.28), 0.025, 0.12).toFixed(3));
        ctx.lineWidth = Math.max(0.35 * dpr, (0.4 + focus * 0.55) * dpr);
        ctx.beginPath();
        ctx.moveTo(item.x, item.y);
        ctx.lineTo(
          item.x + Math.cos(sweepAngle) * sweepRadius,
          item.y + Math.sin(sweepAngle) * sweepRadius,
        );
        ctx.stroke();

        if (focus > 0.18) {
          const pulseRadius = baseRadius * (1.04 + sweep * 0.12);
          ctx.strokeStyle = rgba(tintAccent, clamp(alpha * 0.55, 0.02, 0.11).toFixed(3));
          ctx.lineWidth = Math.max(0.55 * dpr, 0.8 * dpr);
          ctx.beginPath();
          ctx.arc(item.x, item.y, pulseRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    function drawCathedralOverlay(projected, activeIndex, nowSec) {
      const overlayEnabled = visualPreset.value === "cathedral" || Boolean(cathedralOverlay?.checked);
      if (!overlayEnabled || projected.length === 0) {
        return;
      }

      const dpr = Math.max(1, state.dpr || 1);
      const perfMs = Number(state.renderEmaMs || 16.7);
      const perfLoad = clamp((perfMs - 16.7) / 18, 0, 1);
      const ranked = rankSceneOverlayAnchors(projected, activeIndex, perfLoad);
      const anchorCount = Math.min(
        Math.max(5, Math.round(8 * (1 - perfLoad * 0.22))),
        ranked.length,
      );
      const anchors = ranked.slice(0, anchorCount).sort((a, b) => a.item.x - b.item.x);
      const sceneBackground = PRESET_BACKGROUND.cathedral;
      const auraColor = { r: sceneBackground.aura[0], g: sceneBackground.aura[1], b: sceneBackground.aura[2] };
      const goldAccent = { r: 255, g: 229, b: 186 };
      const vaultY = state.height * (0.16 + Math.sin(nowSec * 0.22) * 0.018);
      const floorY = state.height * 0.84;
      const sceneBoost = visualPreset.value === "cathedral" ? 1 : 0.84;

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";

      for (const entry of anchors) {
        const { item, densityScale, focus } = entry;
        const sway = Math.sin(nowSec * 0.34 + item.index * 0.09) * 8 * dpr;
        const archLift = clamp(item.radius * (3.2 + densityScale * 7.2 + focus * 2.1), 16 * dpr, state.height * 0.18);
        const tintBase = mixColor(item.frame.color, auraColor, 0.42);
        const tintAccent = mixColor(item.frame.color, goldAccent, 0.38);
        const alpha = clamp(
          (0.028 + densityScale * 0.048 + focus * 0.15 + (visualPreset.value === "cathedral" ? 0.038 : 0)) * sceneBoost,
          0.022,
          0.19,
        );

        const apexX = lerp(item.x, state.width * 0.5, 0.12 + densityScale * 0.08) + sway;
        const beam = ctx.createLinearGradient(item.x, item.y, apexX, vaultY);
        beam.addColorStop(0, rgba(tintAccent, clamp(alpha * 0.92, 0.02, 0.18).toFixed(3)));
        beam.addColorStop(0.58, rgba(tintBase, clamp(alpha * 0.44, 0.015, 0.08).toFixed(3)));
        beam.addColorStop(1, rgba(tintBase, 0));
        ctx.strokeStyle = beam;
        ctx.lineWidth = Math.max(0.7 * dpr, (0.7 + densityScale * 0.75 + focus * 0.95) * dpr);
        ctx.beginPath();
        ctx.moveTo(item.x, item.y - item.radius * 0.25);
        ctx.lineTo(apexX, vaultY);
        ctx.stroke();

        ctx.strokeStyle = rgba(tintBase, clamp(alpha * 0.46, 0.015, 0.08).toFixed(3));
        ctx.lineWidth = Math.max(0.38 * dpr, (0.4 + densityScale * 0.38) * dpr);
        ctx.beginPath();
        ctx.moveTo(item.x, item.y + item.radius * 0.35);
        ctx.lineTo(item.x, floorY);
        ctx.stroke();

        ctx.strokeStyle = rgba(tintAccent, clamp(alpha * 0.82, 0.02, 0.14).toFixed(3));
        ctx.lineWidth = Math.max(0.5 * dpr, (0.45 + densityScale * 0.45) * dpr);
        ctx.beginPath();
        ctx.ellipse(
          item.x,
          item.y,
          Math.max(4 * dpr, archLift * 0.22),
          Math.max(7 * dpr, archLift * 0.54),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }

      for (let i = 0; i < anchors.length - 1; i += 1) {
        const left = anchors[i];
        const right = anchors[i + 1];
        const span = right.item.x - left.item.x;
        if (span < 20 * dpr || span > state.width * 0.34) {
          continue;
        }

        const midX = (left.item.x + right.item.x) * 0.5;
        const baseY = Math.min(left.item.y, right.item.y);
        const crestY = Math.min(vaultY + state.height * 0.12, baseY - clamp(span * 0.22, 18 * dpr, state.height * 0.16));
        const archColor = mixColor(left.item.frame.color, right.item.frame.color, 0.5);
        const alpha = clamp((0.034 + (left.focus + right.focus) * 0.1 + (left.densityScale + right.densityScale) * 0.032) * sceneBoost, 0.02, 0.14);

        ctx.strokeStyle = rgba(archColor, alpha.toFixed(3));
        ctx.lineWidth = Math.max(0.6 * dpr, (0.68 + (left.focus + right.focus) * 0.45) * dpr);
        ctx.beginPath();
        ctx.moveTo(left.item.x, left.item.y);
        ctx.quadraticCurveTo(midX, crestY, right.item.x, right.item.y);
        ctx.stroke();

        ctx.strokeStyle = rgba(mixColor(archColor, goldAccent, 0.3), clamp(alpha * 0.56, 0.015, 0.08).toFixed(3));
        ctx.lineWidth = Math.max(0.35 * dpr, 0.45 * dpr);
        ctx.beginPath();
        ctx.moveTo(left.item.x, left.item.y - 3 * dpr);
        ctx.quadraticCurveTo(midX, crestY + 8 * dpr, right.item.x, right.item.y - 3 * dpr);
        ctx.stroke();
      }

      const activeEntry = anchors.find((entry) => entry.item.index === activeIndex) || anchors[0] || null;
      if (activeEntry) {
        const roseRadius = clamp(
          activeEntry.item.radius * (2.8 + activeEntry.focus * 1.6),
          14 * dpr,
          Math.min(state.width, state.height) * 0.075,
        );
        const roseColor = mixColor(activeEntry.item.frame.color, goldAccent, 0.48);
        ctx.setLineDash([Math.max(5 * dpr, roseRadius * 0.18), Math.max(7 * dpr, roseRadius * 0.16)]);
        ctx.strokeStyle = rgba(roseColor, 0.12);
        ctx.lineWidth = Math.max(0.65 * dpr, 0.9 * dpr);
        ctx.beginPath();
        ctx.arc(activeEntry.item.x, activeEntry.item.y, roseRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

  function selectLensSource(projected, activeIndex) {
    if (!Array.isArray(projected) || projected.length === 0) {
      return null;
    }

    if (activeIndex >= 0) {
      const active = projected.find((item) => item.index === activeIndex);
      if (active) {
        return active;
      }
    }

    const centerX = state.width * 0.5;
    const centerY = state.height * 0.5;
    const maxDim = Math.max(1, Math.max(state.width, state.height));
    let best = null;
    let bestScore = -Infinity;

    for (const item of projected) {
      const distance = Math.hypot(item.x - centerX, item.y - centerY);
      const centerBias = 1 - clamp(distance / (maxDim * 0.55), 0, 1);
      const score =
        item.frame.rmsN * 0.62 +
        item.frame.fluxN * 0.38 +
        item.activity * 0.16 +
        centerBias * 0.24;
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }

    return best;
  }

  function drawLensArtifacts(source, nowSec, bloom, glowGain, pointAlpha) {
    const flare = Number(lensFlareStrength?.value || 0);
    const streaks = Number(lensStreakStrength?.value || 0);
    if (!source || (flare <= 0.001 && streaks <= 0.001)) {
      return;
    }

    const centerX = state.width * 0.5;
    const centerY = state.height * 0.5;
    const maxDim = Math.max(1, Math.max(state.width, state.height));
    const axisX = centerX - source.x;
    const axisY = centerY - source.y;
    const axisLen = Math.hypot(axisX, axisY) || 1;
    const energy = clamp(
      source.frame.rmsN * 0.64 +
      source.frame.fluxN * 0.36 +
      source.activity * 0.2 +
      source.connectionPulse * 0.18,
      0,
      2,
    );

    if (energy <= 0.02) {
      return;
    }

    const tintWarm = mixColor(source.frame.color, { r: 255, g: 222, b: 154 }, 0.35);
    const tintCool = mixColor(source.frame.color, { r: 102, g: 162, b: 255 }, 0.4);

    if (flare > 0.001) {
      const coreAlpha = clamp(
        (0.08 + energy * 0.2 + bloom * 0.16) * flare * pointAlpha * (0.66 + glowGain * 0.34),
        0.01,
        0.72,
      );
      const coreRadius = clamp(
        source.radius * (2.2 + flare * 4.4 + energy * 1.8),
        8,
        maxDim * 0.18,
      );

      const core = ctx.createRadialGradient(source.x, source.y, 0, source.x, source.y, coreRadius);
      core.addColorStop(0, rgba(tintWarm, coreAlpha.toFixed(3)));
      core.addColorStop(0.55, rgba(source.frame.color, clamp(coreAlpha * 0.38, 0.02, 0.4).toFixed(3)));
      core.addColorStop(1, rgba(source.frame.color, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(source.x, source.y, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      const ghostCount = 5;
      for (let i = 0; i < ghostCount; i += 1) {
        const t = -0.35 + (i / (ghostCount - 1)) * 1.8;
        const gx = source.x + axisX * t;
        const gy = source.y + axisY * t;
        const fade = 1 - i / ghostCount;
        const ghostRadius = clamp(
          coreRadius * (0.32 + fade * 0.58) + maxDim * (0.008 + i * 0.002),
          6,
          maxDim * 0.16,
        );
        const ghostAlpha = clamp(coreAlpha * (0.2 + fade * 0.48), 0.01, 0.38);
        const ghostColor = i % 2 === 0 ? tintCool : tintWarm;
        const ghost = ctx.createRadialGradient(gx, gy, 0, gx, gy, ghostRadius);
        ghost.addColorStop(0, rgba(ghostColor, ghostAlpha.toFixed(3)));
        ghost.addColorStop(0.65, rgba(ghostColor, clamp(ghostAlpha * 0.26, 0.01, 0.12).toFixed(3)));
        ghost.addColorStop(1, rgba(ghostColor, 0));
        ctx.fillStyle = ghost;
        ctx.beginPath();
        ctx.arc(gx, gy, ghostRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      const ringRadius = clamp(axisLen * 0.28 + coreRadius * (1.35 + flare * 0.35), 20, maxDim * 0.46);
      ctx.strokeStyle = rgba(tintWarm, clamp(coreAlpha * 0.16, 0.01, 0.12).toFixed(3));
      ctx.lineWidth = Math.max(1, source.radius * 0.12);
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (streaks > 0.001) {
      const angle = Math.sin(nowSec * 0.42 + source.index * 0.021) * 0.11 + (state.userYaw + state.autoYaw) * 0.08;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const perpX = -dirY;
      const perpY = dirX;
      const halfLength = maxDim * (0.2 + streaks * 0.52 + energy * 0.1);
      const streakAlpha = clamp(
        (0.05 + energy * 0.14 + bloom * 0.1) * streaks * pointAlpha * (0.6 + glowGain * 0.28),
        0.01,
        0.48,
      );

      const main = ctx.createLinearGradient(
        source.x - dirX * halfLength,
        source.y - dirY * halfLength,
        source.x + dirX * halfLength,
        source.y + dirY * halfLength,
      );
      main.addColorStop(0, rgba(tintCool, 0));
      main.addColorStop(0.25, rgba(tintCool, clamp(streakAlpha * 0.24, 0.01, 0.18).toFixed(3)));
      main.addColorStop(0.5, rgba(tintWarm, clamp(streakAlpha * 0.92, 0.03, 0.48).toFixed(3)));
      main.addColorStop(0.75, rgba(tintCool, clamp(streakAlpha * 0.2, 0.01, 0.16).toFixed(3)));
      main.addColorStop(1, rgba(tintCool, 0));
      ctx.strokeStyle = main;
      ctx.lineWidth = Math.max(0.6, 0.8 + source.radius * 0.08 + streaks * 1.85);
      ctx.beginPath();
      ctx.moveTo(source.x - dirX * halfLength, source.y - dirY * halfLength);
      ctx.lineTo(source.x + dirX * halfLength, source.y + dirY * halfLength);
      ctx.stroke();

      for (const side of [-1, 1]) {
        const offset = side * (1.4 + source.radius * 0.1);
        const sx = source.x + perpX * offset;
        const sy = source.y + perpY * offset;
        const subLen = halfLength * 0.48;
        const sub = ctx.createLinearGradient(
          sx - dirX * subLen,
          sy - dirY * subLen,
          sx + dirX * subLen,
          sy + dirY * subLen,
        );
        sub.addColorStop(0, rgba(tintWarm, 0));
        sub.addColorStop(0.5, rgba(tintWarm, clamp(streakAlpha * 0.22, 0.01, 0.16).toFixed(3)));
        sub.addColorStop(1, rgba(tintWarm, 0));
        ctx.strokeStyle = sub;
        ctx.lineWidth = Math.max(0.45, 0.6 + streaks * 1.0);
        ctx.beginPath();
        ctx.moveTo(sx - dirX * subLen, sy - dirY * subLen);
        ctx.lineTo(sx + dirX * subLen, sy + dirY * subLen);
        ctx.stroke();
      }
    }
  }
  
  function drawPoints(projected, activeIndex, nowSec) {
    const bloom = Number(bloomStrength.value);
    const glowGain = Number(glowIntensity.value);
    const glowGate = Number(glowThreshold.value);
    const glowShiftAmt = Number(glowShift.value);
    const glowDecayRate = Number(glowDecay.value);
    const fog = Number(fogStrength.value);
    const pointAlpha = Number(pointOpacity.value);
    const solidness = Number(pointSolidness?.value || 0.45);
    const pointDepthAmount = Number(pointDepth.value);
    const pulseControl = Number(pulseStrength.value);
    const motion = Number(motionStrength.value);
    const motionNorm = clamp(motion / 3, 0, 1);
    const bg = PRESET_BACKGROUND[visualPreset.value] || PRESET_BACKGROUND.cinematic;
    const atmosphereColor = { r: bg.aura[0], g: bg.aura[1], b: bg.aura[2] };
    const xray = isXrayStyle();

    ctx.save();
    // X-ray builds the image out of overlapping bright edges, so it composites
    // additively: where structure stacks up behind structure it gets brighter,
    // which is exactly the readability an x-ray buys you.
    ctx.globalCompositeOperation = xray ? "lighter" : "source-over";

    if (xray) {
      for (const item of projected) {
        const radius = Math.max(
          0.6,
          item.radius * (0.8 + item.activity * 0.3) * (1 + item.pulse * 0.35),
        );
        const alpha = clamp(
          (0.06 + item.frame.rmsN * 0.34 + item.activity * 0.4) * pointAlpha * item.nearFade,
          0.008,
          0.95,
        );

        // Rim only. The interior stays empty so nodes behind remain visible,
        // which is the whole point of the style.
        ctx.strokeStyle = rgba(item.frame.color, alpha.toFixed(3));
        ctx.lineWidth = Math.max(0.45, radius * (0.16 + solidness * 0.12));
        ctx.beginPath();
        ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        if (item.activity > 0.12 || item.pulse > 0.1) {
          ctx.fillStyle = rgba(
            mixColor(item.frame.color, { r: 255, g: 255, b: 255 }, 0.5),
            clamp(alpha * 0.72, 0.02, 0.9).toFixed(3),
          );
          ctx.beginPath();
          ctx.arc(item.x, item.y, Math.max(0.4, radius * 0.24), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
      if (!cinemaMode.checked) {
        return;
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const lensSourceXray = selectLensSource(projected, activeIndex);
      drawLensArtifacts(lensSourceXray, nowSec, bloom, glowGain, pointAlpha * 0.6);
      ctx.restore();
      return;
    }

    for (const item of projected) {
      const fogFactor = clamp(item.fog * fog, 0, 1);
      const darkMix = clamp(0.26 + fogFactor * 0.55 - solidness * 0.14, 0.16, 0.86);
      const tintedBase = mixColor(item.frame.color, { r: 10, g: 14, b: 20 }, darkMix);
      const atmosphereMix = computeAtmosphereMix(fogFactor, item.depth);
      const baseColor = mixColor(tintedBase, atmosphereColor, atmosphereMix);
  
      // nearFade replaces the old hard near-plane rejection: a node flying past
      // the camera now dissolves instead of blinking out of existence.
      const baseAlpha = clamp(
        (0.18 + item.frame.rmsN * 0.4 - fogFactor * 0.18) * pointAlpha * (0.74 + solidness * 0.78) * item.nearFade,
        0.004,
        0.98,
      );
      const pulsePhase = Math.sin(nowSec * 18 + item.index * 0.41) * 0.5 + 0.5;
      const pulseEnvelope = clamp((item.activity * 0.58 + item.pulse * 1.45 + item.connectionPulse * 1.25) * pulseControl, 0, 3.8);
      const pulseScale = 1 + pulseEnvelope * (0.16 + 0.28 * pulsePhase);
      const px = item.x;
      const py = item.y;
      const radius = Math.max(0.55, item.radius * (0.74 + item.activity * 0.18) * pulseScale);
      const tinyFastPath = radius < 1.35 && pulseEnvelope < 0.08 && item.activity < 0.1;
      if (tinyFastPath) {
        ctx.fillStyle = rgba(baseColor, clamp(baseAlpha * (0.86 + solidness * 0.2), 0.06, 0.9).toFixed(3));
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
  
      const sphereGradient = ctx.createRadialGradient(
        px - radius * (0.3 + pointDepthAmount * 0.12),
        py - radius * (0.32 + pointDepthAmount * 0.1),
        Math.max(0.1, radius * 0.16),
        px,
        py,
        radius * (1 + pointDepthAmount * 0.42),
      );
      sphereGradient.addColorStop(0, rgba(mixColor(item.frame.color, { r: 255, g: 255, b: 255 }, 0.42 - solidness * 0.12), clamp(baseAlpha * (1.04 + solidness * 0.24), 0.16, 1).toFixed(3)));
      sphereGradient.addColorStop(0.42, rgba(baseColor, clamp(baseAlpha * (0.86 + pointDepthAmount * 0.18), 0.1, 1).toFixed(3)));
      sphereGradient.addColorStop(1, rgba(mixColor(baseColor, { r: 4, g: 6, b: 10 }, 0.42 - solidness * 0.18), clamp(baseAlpha * (0.58 + pointDepthAmount * 0.22 + solidness * 0.12), 0.08, 0.98).toFixed(3)));
  
      ctx.fillStyle = sphereGradient;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
  
      const highlight = mixColor(item.frame.color, { r: 255, g: 255, b: 255 }, 0.22);
      ctx.fillStyle = rgba(highlight, clamp(baseAlpha * (0.6 + pulseEnvelope * 0.2), 0.08, 0.74).toFixed(3));
      ctx.beginPath();
      ctx.arc(px - radius * 0.3, py - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  
    ctx.restore();
  
    if (!cinemaMode.checked) {
      return;
    }
  
    // Glow is only applied around active playback regions to avoid constant overexposure.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
  
    for (const item of projected) {
      const glowActivity = Math.max(item.activity, item.pulse * 1.2, item.connectionPulse * 1.1);
      if (glowActivity < glowGate) {
        continue;
      }
  
      const pulsePhase = Math.sin(nowSec * 14 + item.index * 0.43) * 0.5 + 0.5;
      const pulseEnvelope = clamp((item.activity * 0.5 + item.pulse * 1.4) * pulseControl, 0, 3.2);
      const px = item.x;
      const py = item.y;
      const glowPower = clamp(
        glowActivity * (0.3 + item.frame.rmsN * 0.86) * (0.42 + bloom * 0.52) * pointAlpha * glowGain * (0.8 + pulsePhase * 0.24) * item.nearFade,
        0.004,
        0.78,
      );
      const glowRadius = item.radius * (1.2 + item.activity * 3.1 + bloom * 1.4 + item.connectionPulse * 0.65);
  
      const tailColor = shiftToInfra(
        item.frame.color,
        clamp(glowShiftAmt * (0.22 + (1 - motionNorm) * 0.56), 0, 1),
      );
  
      const gradient = ctx.createRadialGradient(px, py, 0, px, py, glowRadius);
      gradient.addColorStop(0, rgba(item.frame.color, glowPower.toFixed(3)));
      gradient.addColorStop(clamp(0.45 / Math.max(0.2, glowDecayRate), 0.18, 0.7), rgba(item.frame.color, clamp(glowPower * 0.24, 0.02, 0.3).toFixed(3)));
      gradient.addColorStop(1, rgba(tailColor, 0));
  
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, glowRadius, 0, Math.PI * 2);
      ctx.fill();
  
      const coreAlpha = clamp(glowPower * (0.7 + pulseEnvelope * 0.06), 0.04, 0.96);
      ctx.fillStyle = rgba(item.frame.color, coreAlpha.toFixed(3));
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.8, item.radius * (0.64 + item.activity * 0.4) * (1 + pulseEnvelope * 0.12)), 0, Math.PI * 2);
      ctx.fill();
  
      const aberration = computeAberrationStrength({
        activity: item.activity,
        flux: item.frame.fluxN,
        motion,
        cinemaEnabled: cinemaMode.checked,
      });
  
      if (aberration > 0) {
        const shift = (0.8 + item.radius * 0.14) * aberration;
        const ghostRadius = Math.max(0.7, item.radius * 0.64);
  
        ctx.fillStyle = `rgba(255, 86, 118, ${clamp(0.06 + aberration * 0.22, 0.06, 0.28).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px - shift, py, ghostRadius, 0, Math.PI * 2);
        ctx.fill();
  
        ctx.fillStyle = `rgba(94, 162, 255, ${clamp(0.06 + aberration * 0.2, 0.06, 0.26).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px + shift, py, ghostRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  
    const active = projected.find((item) => item.index === activeIndex);
    if (active) {
      ctx.strokeStyle = rgba(active.frame.color, 0.96);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(active.x, active.y, active.radius * 2.7, 0, Math.PI * 2);
      ctx.stroke();
    }

    const lensSource = selectLensSource(projected, activeIndex);
    drawLensArtifacts(lensSource, nowSec, bloom, glowGain, pointAlpha);
  
    ctx.restore();
  }
  
  /**
   * Picks the node nearest the pointer, if it is close enough to have been
   * aimed at. Runs against the already-projected list, so hit-testing costs a
   * single pass rather than a second projection.
   *
   * Nearest-in-screen-space wins ties by depth because `projected` is sorted
   * far-to-near, and a later equal-distance candidate overwrites an earlier
   * one - so the front-most of two overlapping nodes is the one you get, which
   * is the one you can actually see.
   */
  function updateHoverPick(projected) {
    if (state.pointerX === null || state.dragging) {
      state.hoverNode = null;
      return;
    }

    const dpr = Math.max(1, state.dpr || 1);
    const maxDistance = 26 * dpr;
    let best = null;
    let bestDistanceSq = maxDistance * maxDistance;

    for (const item of projected) {
      const dx = item.x - state.pointerX;
      const dy = item.y - state.pointerY;
      const distanceSq = dx * dx + dy * dy;
      // Large nodes should be grabbable across their whole face.
      const reach = Math.max(maxDistance, item.radius * 1.6);
      if (distanceSq <= Math.max(bestDistanceSq, reach * reach)) {
        best = item;
        bestDistanceSq = distanceSq;
      }
    }

    state.hoverNode = best;
  }

  /** Ring around the hovered node, so the pick is unambiguous. */
  function drawHoverHighlight() {
    const hover = state.hoverNode;
    if (!hover) {
      return;
    }

    const dpr = Math.max(1, state.dpr || 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(190, 238, 255, 0.92)";
    ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, Math.max(7 * dpr, hover.radius * 2.1), 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(190, 238, 255, 0.34)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, Math.max(12 * dpr, hover.radius * 3.4), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawMap(nowSec) {
    if (!state.map) {
      return;
    }
  
    // Decimation comes from the latched tier, so the node count no longer
    // changes several times a second as the frame-cost EMA wobbles.
    const decimate = Math.max(qualityTier().decimation, Number(displayDecimation.value));
    const sizeScale = Number(pointScale.value);
    const activeIndex = !player.paused ? getFrameIndexAtTime(player.currentTime) : -1;
    // Activity falls off around the *fractional* playhead. Snapping it to the
    // nearest analysis frame made every highlight stair-step, which is most
    // obvious at 0.25x where a frame lasts the better part of a second.
    const activeIndexFloat = !player.paused ? getFrameIndexFloatAtTime(player.currentTime) : -1;
    const activityWindow = 6 + Number(flowDensity.value) * 18;
    const temporalFogAmount = Number(temporalFog?.value || 0);
    // Full fog is reached roughly a fifth of the song away from the playhead,
    // so the effect scales with the track rather than with a fixed frame count.
    const temporalFogSpan = Math.max(60, state.map.frames.length * 0.2);

    const projected = [];
    const byIndex = new Map();
    const visibleIndices = [];
    state.connectionPulse.clear();

    for (let i = 0; i < state.map.frames.length; i += decimate) {
      const frame = state.map.frames[i];
      const pulse = state.activationPulse.get(i) || 0;
      const activity = clamp(activityForIndex(i, activeIndexFloat, activityWindow) + pulse * 1.15, 0, 2.2);
      const p = projectPoint3D(frame.x, frame.y, frame.z, nowSec, activity);

      if (!p) {
        continue;
      }

      const radius = clamp(frame.size * sizeScale * p.perspective * 0.09, 0.45, 22);
      // Temporal fog: recession keyed to distance from the playhead in *time*
      // rather than from the camera in space, so "now" is sharp and "then"
      // recedes regardless of where the camera happens to be.
      const timeFade =
        temporalFogAmount > 0.001 && activeIndexFloat >= 0
          ? 1 - temporalFogAmount * clamp(Math.abs(i - activeIndexFloat) / temporalFogSpan, 0, 1)
          : 1;

      const item = {
        index: i,
        frame,
        x: p.x,
        y: p.y,
        depth: p.depth,
        fog: p.fog,
        nearFade: p.nearFade * timeFade,
        timeFade,
        radius,
        activity,
        pulse,
        connectionPulse: 0,
      };

      projected.push(item);
      byIndex.set(i, item);
      visibleIndices.push(i);
    }

    projected.sort((a, b) => b.depth - a.depth);
    updateHoverPick(projected);

    if (!nodesOnly.checked) {
        drawTemporalGhosts(activeIndexFloat, nowSec);
        drawEdges(byIndex, visibleIndices, activeIndex, nowSec, activeIndexFloat);
        drawSectionArcs(byIndex, activeIndexFloat, nowSec);
        drawObservatoryOverlay(projected, activeIndex, nowSec);
        drawCathedralOverlay(projected, activeIndex, nowSec);
    }
  
    for (const item of projected) {
      item.connectionPulse = state.connectionPulse.get(item.index) || 0;
    }
  
    drawPoints(projected, activeIndex, nowSec);

    if (!nodesOnly.checked) {
        drawLabels(projected, activeIndex);
        drawFlowParticles(activeIndex, nowSec);
    }

    drawHoverHighlight();
  
    let active = byIndex.get(activeIndex);
    if (!active && activeIndex >= 0) {
      const snapped = Math.round(activeIndex / decimate) * decimate;
      const left = Math.max(0, snapped - decimate);
      const right = Math.min(state.map.frames.length - 1, snapped + decimate);
      active = byIndex.get(snapped) || byIndex.get(left) || byIndex.get(right) || null;
    }
  
    if (active) {
      metricRms.textContent = active.frame.rms.toFixed(3);
      metricCentroid.textContent = `${Math.round(active.frame.centroidHz)} Hz`;
      metricSpread.textContent = `${active.frame.spreadKhz.toFixed(2)} kHz`;
    }
  }

  return {
    updateTrail,
    updateCameraMotion,
    computeViewSpacePoint,
    projectPoint3D,
    drawBackground,
    drawColorHaze,
    isXrayStyle,
    drawTrail,
    drawFlowParticles,
    drawEdges,
    drawLabels,
    drawObservatoryOverlay,
    drawCathedralOverlay,
    drawPoints,
    drawHoverHighlight,
    drawTemporalGhosts,
    drawSectionArcs,
    drawTimeTube,
    updateHoverPick,
    drawMap,
  };
}
