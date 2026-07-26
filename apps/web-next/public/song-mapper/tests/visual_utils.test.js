import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLocalDensityMap,
  computeAberrationStrength,
  computeAtmosphereMix,
  computeLabelDensityScale,
  computeMicroDolly,
} from "../visual_utils.js";

test("computeAtmosphereMix increases with fog/depth and stays bounded", () => {
  const shallow = computeAtmosphereMix(0.1, 7);
  const deep = computeAtmosphereMix(0.8, 28);

  assert.ok(shallow >= 0 && shallow <= 0.86);
  assert.ok(deep >= 0 && deep <= 0.86);
  assert.ok(deep > shallow);
});

test("computeMicroDolly reacts to low-band energetic frames", () => {
  const weak = computeMicroDolly({ id: 10, centroidN: 0.9, rmsN: 0.2, fluxN: 0.1 }, 1.2);
  const strong = computeMicroDolly({ id: 10, centroidN: 0.15, rmsN: 0.95, fluxN: 0.9 }, 1.2);

  const weakMag = Math.abs(weak.zoom) + Math.abs(weak.pitch) + Math.abs(weak.yaw);
  const strongMag = Math.abs(strong.zoom) + Math.abs(strong.pitch) + Math.abs(strong.yaw);

  assert.ok(strongMag > weakMag);
});

test("computeAberrationStrength respects cinema mode and thresholds", () => {
  const disabled = computeAberrationStrength({
    activity: 1,
    flux: 1,
    motion: 3,
    cinemaEnabled: false,
  });
  const low = computeAberrationStrength({
    activity: 0.05,
    flux: 0.04,
    motion: 0.1,
    cinemaEnabled: true,
  });
  const high = computeAberrationStrength({
    activity: 0.9,
    flux: 0.9,
    motion: 2.4,
    cinemaEnabled: true,
  });

  assert.equal(disabled, 0);
  assert.equal(low, 0);
  assert.ok(high > 0);
  assert.ok(high <= 0.5);
});

test("density map and label scale reduce alpha in crowded regions", () => {
  const points = [];
  for (let i = 0; i < 14; i += 1) {
    points.push({ index: i, x: 100 + (i % 4) * 8, y: 120 + Math.floor(i / 4) * 8 });
  }
  points.push({ index: 99, x: 600, y: 320 });

  const densityMap = buildLocalDensityMap(points, 40);
  const dense = densityMap.get(0);
  const sparse = densityMap.get(99);

  assert.ok(dense > sparse);

  const denseScale = computeLabelDensityScale(dense);
  const sparseScale = computeLabelDensityScale(sparse);
  assert.ok(denseScale < sparseScale);
});
