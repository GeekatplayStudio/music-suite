function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

export function computeAtmosphereMix(fogFactor, depth) {
  const depthNorm = clamp((depth - 6) / 28, 0, 1);
  return clamp(fogFactor * 0.45 + depthNorm * 0.35, 0, 0.86);
}

export function computeMicroDolly(frame, nowSec) {
  if (!frame) {
    return { zoom: 0, pitch: 0, yaw: 0 };
  }

  const lowBand = Math.pow(clamp(1 - (frame.centroidN ?? 0), 0, 1), 1.2);
  const drive = clamp((frame.rmsN ?? 0) * 0.62 + (frame.fluxN ?? 0) * 0.38, 0, 1);
  const beat = lowBand * drive;

  return {
    zoom: Math.sin(nowSec * 8.5) * beat,
    pitch: Math.cos(nowSec * 6.2) * beat,
    yaw: Math.sin(nowSec * 4.8 + (frame.id ?? 0) * 0.01) * beat,
  };
}

export function computeAberrationStrength({ activity, flux, motion, cinemaEnabled }) {
  if (!cinemaEnabled) {
    return 0;
  }

  const level = clamp(activity * 0.65 + flux * 0.55 + motion * 0.08, 0, 1.8);
  if (level < 0.18) {
    return 0;
  }

  return clamp((level - 0.18) * 0.34, 0, 0.5);
}

export function buildLocalDensityMap(points, cellSize) {
  const size = Math.max(8, cellSize || 48);
  const cells = new Map();

  for (const point of points) {
    const cx = Math.floor(point.x / size);
    const cy = Math.floor(point.y / size);
    const key = `${cx}:${cy}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }

  const byIndex = new Map();
  for (const point of points) {
    const cx = Math.floor(point.x / size);
    const cy = Math.floor(point.y / size);
    let local = 0;

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        local += cells.get(`${cx + dx}:${cy + dy}`) || 0;
      }
    }

    byIndex.set(point.index, local);
  }

  return byIndex;
}

export function computeLabelDensityScale(localDensity) {
  const t = clamp((localDensity - 1) / 20, 0, 1);
  return 1 - t * 0.7;
}
