import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AVATAR_COLORS,
  avatarColor,
  SHAPE_PRESETS,
  shapeRadii,
  smoothClosedPath,
} from "../src/lib/avatar.ts";
import { mulberry32 } from "../src/lib/hash.ts";

test("shapeRadii produces 72 bounded radii", () => {
  const auto = shapeRadii(mulberry32(7));
  assert.equal(auto.length, 72);
  assert.ok(auto.every((r) => r > 0.5 && r < 1.5));
});

test("fixed (seed, preset) yields a stable SVG path", () => {
  const once = smoothClosedPath(shapeRadii(mulberry32(1), 3), 50, 40);
  const twice = smoothClosedPath(shapeRadii(mulberry32(1), 3), 50, 40);
  assert.equal(once, twice);
});

test("smoothClosedPath emits a closed cubic path", () => {
  const d = smoothClosedPath(shapeRadii(mulberry32(1)), 50, 40);
  assert.ok(d.startsWith("M "));
  assert.ok(d.endsWith("Z"));
  assert.ok(d.includes("C "));
});

test("every shape preset renders from a seeded rng", () => {
  for (let preset = 0; preset < SHAPE_PRESETS.length; preset++) {
    const d = smoothClosedPath(
      shapeRadii(mulberry32(preset * 7919 + 1000), preset),
      50,
      40,
    );
    assert.ok(d.startsWith("M ") && d.endsWith("Z"));
  }
});

test("avatarColor maps ids into the fixed palette", () => {
  for (const id of ["a", "b", "c", "zz"])
    assert.ok(AVATAR_COLORS.includes(avatarColor(id)));
});
