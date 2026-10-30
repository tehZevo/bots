import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fmt,
  fmtMs,
  fmtTokens,
  relTime,
  titleCase,
} from "../src/lib/format.ts";

test("relTime buckets ages against a fixed clock", (t) => {
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  assert.equal(relTime(now - 10_400), "10s ago");
  assert.equal(relTime(now - 120_000), "2m ago");
  assert.equal(relTime(now - 5 * 3_600_000), "5h ago");
  assert.equal(relTime(now - 3 * 86_400_000), "3d ago");
  assert.equal(relTime(now + 60_000), "0s ago");
});

test("fmt renders timestamps or dash", () => {
  assert.equal(fmt(null), "—");
  assert.ok(fmt(1_700_000_000_000).length > 4);
});

test("fmtTokens abbreviates large counts", () => {
  assert.equal(fmtTokens(999), "999");
  assert.equal(fmtTokens(1_500), "1.5k");
  assert.equal(fmtTokens(2_300_000), "2.3M");
  assert.equal(fmtTokens(4_600_000_000), "4.6B");
});

test("fmtMs formats durations", () => {
  assert.equal(fmtMs(250), "250ms");
  assert.equal(fmtMs(3_500), "3.5s");
  assert.equal(fmtMs(90_000), "1m 30s");
});

test("titleCase uppercases only the first character", () => {
  assert.equal(titleCase("active"), "Active");
  assert.equal(titleCase(""), "");
});
