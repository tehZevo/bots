import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-test-")),
  "t.db",
);

const { nextRunAt } = await import("../src/scheduler.ts");

test("@every schedules add the parsed duration", () => {
  const from = new Date("2026-01-01T00:00:00Z").getTime();
  assert.equal(nextRunAt("@every 30s", new Date(from)), from + 30_000);
  assert.equal(nextRunAt("@every 5m", new Date(from)), from + 300_000);
  assert.equal(nextRunAt("@every 2h", new Date(from)), from + 7_200_000);
  assert.equal(nextRunAt("@every 1d", new Date(from)), from + 86_400_000);
});

test("invalid schedules yield null", () => {
  assert.equal(nextRunAt(""), null);
  assert.equal(nextRunAt("   "), null);
  assert.equal(nextRunAt("@every 7x"), null);
  assert.equal(nextRunAt("not a cron"), null);
});

test("cron expressions resolve to the next match", () => {
  const from = new Date("2026-01-01T10:15:30Z").getTime();
  const next = nextRunAt("0 * * * *", new Date(from));
  assert.equal(next, new Date("2026-01-01T11:00:00Z").getTime());
});
