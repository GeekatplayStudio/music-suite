import test from "node:test";
import assert from "node:assert/strict";

import { sanitizePresetName, sortPresetEntries } from "../preset_utils.js";

test("sanitizePresetName trims and collapses whitespace", () => {
  assert.equal(sanitizePresetName("   My    Preset   Name  "), "My Preset Name");
});

test("sanitizePresetName enforces max length", () => {
  const long = "a".repeat(100);
  assert.equal(sanitizePresetName(long).length, 48);
});

test("sortPresetEntries sorts by most recent updatedAt first", () => {
  const store = {
    old: { updatedAt: 100 },
    newest: { updatedAt: 500 },
    middle: { updatedAt: 220 },
  };

  const order = sortPresetEntries(store).map(([name]) => name);
  assert.deepEqual(order, ["newest", "middle", "old"]);
});
