import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "bots-targets-"));
process.env.DATA_DIR = dir;
process.env.DATABASE_PATH = join(dir, "targets.db");

const db = await import("../src/db.ts");
const { notificationTargetPath } = await import(
  "../src/notification-targets.ts"
);

test("notification targets resolve from kind and ids", () => {
  assert.equal(
    notificationTargetPath({ kind: "run_error", botId: "b1", runId: "r1" }),
    "/bots?bot=b1&run=r1",
  );
  assert.equal(
    notificationTargetPath({ kind: "watchdog", botId: "b/1", runId: null }),
    `/bots?bot=${encodeURIComponent("b/1")}`,
  );
  assert.equal(
    notificationTargetPath({ kind: "breaker", botId: null, runId: null }),
    "/settings?tab=system",
  );
  assert.equal(notificationTargetPath({ kind: "approval" }), null);
});

test("created notifications persist their destination", () => {
  db.insertBot({
    id: "bot-t",
    name: "Targets",
    instructions: "",
    enabled: 1,
    created_at: Date.now(),
  });
  db.insertRun({
    id: "run-t",
    bot_id: "bot-t",
    status: "running",
    trigger: "manual",
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });
  db.finishRun("run-t", "error", null, "boom");

  const runError = db.listNotifications().find((n) => n.kind === "run_error");
  assert.ok(runError);
  assert.equal(runError.run_id, "run-t");
  assert.equal(runError.target_path, "/bots?bot=bot-t&run=run-t");

  db.tripWatchdog("bot-t", "Targets", 1);
  const watchdog = db.listNotifications().find((n) => n.kind === "watchdog");
  assert.ok(watchdog?.run_id);
  assert.equal(
    watchdog.target_path,
    `/bots?bot=bot-t&run=${encodeURIComponent(String(watchdog.run_id))}`,
  );

  db.createNotification({
    kind: "breaker",
    title: "Spend circuit breaker tripped",
    body: "over cap",
  });
  const breaker = db.listNotifications().find((n) => n.kind === "breaker");
  assert.equal(breaker?.target_path, "/settings?tab=system");
});
