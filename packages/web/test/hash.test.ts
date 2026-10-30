import assert from "node:assert/strict";
import { test } from "node:test";
import { fnv, mulberry32 } from "../src/lib/hash.ts";

test("fnv is deterministic and separates inputs", () => {
  assert.equal(fnv("a"), fnv("a"));
  assert.notEqual(fnv("a"), fnv("b"));
});

test("mulberry32 replays the same sequence for a seed", () => {
  const r1 = mulberry32(42);
  const r2 = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2());
});

test("mulberry32 stays in [0, 1)", () => {
  const r = mulberry32(7);
  for (let i = 0; i < 100; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});
