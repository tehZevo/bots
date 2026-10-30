import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-test-")),
  "t.db",
);

const {
  insertBot,
  insertRun,
  listNotifications,
  listRuns,
  sweepInterruptedRuns,
} = await import("../src/db.ts");

insertBot({
  id: "bot-1",
  name: "Sweepy",
  instructions: "",
  enabled: 1,
  created_at: Date.now(),
});

function addRun(status: "running" | "ok"): string {
  const id = randomUUID();
  insertRun({
    id,
    bot_id: "bot-1",
    status,
    trigger: "manual",
    started_at: Date.now(),
    finished_at: status === "ok" ? Date.now() : null,
    output: null,
    error: null,
  });
  return id;
}

test("boot sweep finalizes stale running runs as interrupted errors", () => {
  const crashed = addRun("running");
  const alsoCrashed = addRun("running");
  const done = addRun("ok");

  assert.equal(sweepInterruptedRuns(), 2);

  const byId = new Map(listRuns("bot-1").map((r) => [r.id, r]));
  for (const id of [crashed, alsoCrashed]) {
    const run = byId.get(id);
    assert.equal(run?.status, "error");
    assert.equal(run?.error, "interrupted");
    assert.ok(run?.finished_at);
  }
  assert.equal(byId.get(done)?.status, "ok");

  const titles = listNotifications().filter((n) =>
    n.dedupe_key?.startsWith("run-error:"),
  );
  assert.equal(titles.length, 2);
});

test("sweep is idempotent", () => {
  assert.equal(sweepInterruptedRuns(), 0);
});
