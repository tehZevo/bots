import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-watchdog-")),
  "t.db",
);

const db = await import("../src/db.ts");
const { runTick } = await import("../src/scheduler.ts");

const HOUR = 3_600_000;

function makeBot(name: string): string {
  const id = randomUUID();
  db.insertBot({
    id,
    name,
    instructions: "",
    current_task: null,
    current_task_updated_at: null,
    status: null,
    status_level: null,
    enabled: 1,
    created_at: Date.now(),
  });
  return id;
}

test("watchdog trips once and raises the blocked condition", () => {
  const botId = makeBot("missed");
  const now = Date.now();
  db.updateBot(botId, { watchdog_hours: 2 });
  db.markWatchdogActivity(botId, now - HOUR * 3);

  db.evaluateWatchdogs(now);
  let runs = db.listRuns(botId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].trigger, "watchdog");
  assert.equal(runs[0].error, "watchdog: no completed run in 2h");

  const bot = db.getBot(botId);
  assert.ok(bot);
  assert.equal(bot.watchdog_tripped, 1);
  assert.equal(bot.status_level, "blocked");

  const notifications = db
    .listNotifications()
    .filter((n) => n.bot_id === botId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].kind, "watchdog");

  db.evaluateWatchdogs(now + HOUR);
  runs = db.listRuns(botId);
  assert.equal(runs.length, 1);
});

test("a newly started run clears the watchdog trip", () => {
  const botId = makeBot("recovered");
  const now = Date.now();
  db.updateBot(botId, { watchdog_hours: 2 });
  db.markWatchdogActivity(botId, now - HOUR * 3);
  db.evaluateWatchdogs(now);

  db.insertRun({
    id: randomUUID(),
    bot_id: botId,
    status: "running",
    trigger: "manual",
    started_at: now + 1000,
    finished_at: null,
    output: null,
    error: null,
  });

  const bot = db.getBot(botId);
  assert.ok(bot);
  assert.equal(bot.watchdog_tripped, 0);
  assert.equal(bot.status_level, null);
  assert.equal(bot.watchdog_run_started_at, now + 1000);
});

test("a completed run re-arms from its completion", () => {
  const botId = makeBot("completed");
  const startedAt = Date.now() - HOUR * 3;
  db.updateBot(botId, { watchdog_hours: 2 });
  db.insertRun({
    id: "watchdog-completion-run",
    bot_id: botId,
    status: "running",
    trigger: "manual",
    started_at: startedAt,
    finished_at: null,
    output: null,
    error: null,
  });

  db.finishRun("watchdog-completion-run", "ok", "done", null);
  const bot = db.getBot(botId);
  assert.ok(bot);
  assert.equal(bot.watchdog_tripped, 0);
  assert.ok((bot.watchdog_run_started_at ?? 0) > startedAt);

  db.evaluateWatchdogs();
  assert.equal(
    db.listRuns(botId).some((run) => run.trigger === "watchdog"),
    false,
  );
});

test("disabled bots and global pause freeze the watchdog", () => {
  const disabled = makeBot("disabled");
  const paused = makeBot("paused");
  const now = Date.now();
  db.updateBot(disabled, { watchdog_hours: 2, enabled: 0 });
  db.markWatchdogActivity(disabled, now - HOUR * 3);
  db.evaluateWatchdogs(now);
  assert.equal(db.listRuns(disabled).length, 0);

  db.updateBot(disabled, { enabled: 1 });
  assert.equal(db.getBot(disabled)?.watchdog_run_started_at, null);
  db.evaluateWatchdogs(now + HOUR * 4);
  assert.equal(db.listRuns(disabled).length, 0);

  db.markWatchdogActivity(paused, now - HOUR * 3);
  db.setPaused(true);
  db.evaluateWatchdogs(now + HOUR * 2);
  assert.equal(db.listRuns(paused).length, 0);
});

test("scheduler tick evaluates watchdogs", () => {
  const botId = makeBot("tick");
  db.setPaused(false);
  db.updateBot(botId, { watchdog_hours: 1 });
  db.markWatchdogActivity(botId, Date.now() - HOUR * 2);

  runTick();

  const runs = db.listRuns(botId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].trigger, "watchdog");
});
