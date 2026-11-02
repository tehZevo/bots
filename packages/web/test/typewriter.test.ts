import assert from "node:assert/strict";
import { it as test } from "vitest";

import { nextReveal, revealStep } from "../src/lib/typewriter.ts";

test("reveal step always moves at least one character and scales with backlog", () => {
  assert.equal(revealStep(0), 0);
  assert.equal(revealStep(-5), 0);
  assert.equal(revealStep(1), 1);
  assert.equal(revealStep(12), 1);
  assert.equal(revealStep(13), 2);
  assert.equal(revealStep(1000), 84);
});

test("reveal advances one step at a time toward the target", () => {
  assert.equal(nextReveal("hello world", "hello", 3), "hello wo");
  assert.equal(nextReveal("hello world", "hello world", 3), "hello world");
  assert.equal(nextReveal("hello", "hello there", 3), "hello");
});

test("a target that is not an extension snaps instead of glitching", () => {
  assert.equal(nextReveal("goodbye", "hello", 1), "goodbye");
  assert.equal(nextReveal("", "partial", 1), "");
});

test("reveal never overshoots the target", () => {
  assert.equal(nextReveal("abc", "ab", 50), "abc");
});

test("a reveal converges in a bounded number of steps", () => {
  const target = "x".repeat(50000);
  let shown = "";
  let steps = 0;
  while (shown !== target && steps < 1000) {
    const next = nextReveal(
      target,
      shown,
      revealStep(target.length - shown.length),
    );
    assert.ok(next.length > shown.length, "reveal must always make progress");
    shown = next;
    steps += 1;
  }
  assert.equal(shown, target);
  assert.ok(steps < 120, `converged in ${steps} steps`);
});
