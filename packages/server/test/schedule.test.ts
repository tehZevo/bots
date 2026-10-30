import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-test-")),
  "t.db",
);

const { nextRunAt, previewSchedule } = await import("../src/scheduler.ts");

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

test("@every previews repeat the interval five times", () => {
  const from = new Date("2026-01-01T10:00:00Z");
  assert.deepEqual(previewSchedule("@every 30m", 5, from), {
    valid: true,
    next: [
      "2026-01-01T10:30:00.000Z",
      "2026-01-01T11:00:00.000Z",
      "2026-01-01T11:30:00.000Z",
      "2026-01-01T12:00:00.000Z",
      "2026-01-01T12:30:00.000Z",
    ],
  });
});

test("cron previews return the next five matches and cap at five", () => {
  const from = new Date("2026-01-01T10:15:30Z");
  const preview = previewSchedule("0 * * * *", 9, from);
  assert.equal(preview.valid, true);
  assert.deepEqual(
    preview.next.map((value) => new Date(value).getUTCHours()),
    [11, 12, 13, 14, 15],
  );
});

test("invalid previews report invalid without partial results", () => {
  assert.deepEqual(previewSchedule("@every 7x"), { valid: false, next: [] });
  assert.deepEqual(previewSchedule("not a cron"), { valid: false, next: [] });
});
