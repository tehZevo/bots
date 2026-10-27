import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-test-")),
  "t.db",
);

const { createApp } = await import("../src/api.ts");
const db = await import("../src/db.ts");
const { runTick, setSchedulerInject } = await import("../src/scheduler.ts");

process.env.ALLOW_REGISTRATION = "true";
const app = createApp();
const signup = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "cont@example.com", password: "cont-pass-1" }),
});
const SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await app.request(path, {
    method,
    headers: {
      cookie: SESSION,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

db.insertBot({
  id: "bot-c",
  name: "Conty",
  instructions: "",
  model_id: "test-model",
  enabled: 1,
  created_at: Date.now(),
});

function addRun(status: "running" | "ok" | "error"): string {
  const id = `run-${Math.random().toString(36).slice(2)}`;
  db.insertRun({
    id,
    bot_id: "bot-c",
    status,
    trigger: "manual",
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });
  return id;
}

test("continuous interval validation", async () => {
  const cron = await req("POST", "/api/bots/bot-c/triggers", {
    kind: "continuous",
    message: "keep going",
    schedule: "0 * * * *",
  });
  assert.equal(cron.status, 400);
  const tooShort = await req("POST", "/api/bots/bot-c/triggers", {
    kind: "continuous",
    message: "keep going",
    schedule: "@every 30s",
  });
  assert.equal(tooShort.status, 400);
  const ok = await req("POST", "/api/bots/bot-c/triggers", {
    kind: "continuous",
    message: "keep going",
    schedule: "@every 5m",
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.next_run_at, null);

  const bad = await req("PATCH", `/api/triggers/${String(ok.json.id)}`, {
    schedule: "@every 10s",
  });
  assert.equal(bad.status, 400);
});

test("runs arm enabled continuous triggers; tick fires once and clears", () => {
  const trig = db.listTriggers("bot-c").find((t) => t.kind === "continuous");
  assert.ok(trig);
  const disabledId = (() => {
    db.insertTrigger({
      id: "trig-off",
      bot_id: "bot-c",
      kind: "continuous",
      name: null,
      message: "off duty",
      schedule: "@every 1h",
      next_run_at: null,
      secret: null,
      enabled: 0,
      created_at: Date.now(),
    });
    return "trig-off";
  })();

  const runId = addRun("running");
  db.finishRun(runId, "ok", "done", null);

  const armed = db.getTrigger(String(trig?.id));
  assert.ok(armed?.next_run_at);
  assert.ok(armed.next_run_at > Date.now() + 290_000);
  assert.equal(db.getTrigger(disabledId)?.next_run_at, null);

  db.updateTrigger(String(trig?.id), { next_run_at: Date.now() - 1 });
  const calls: string[] = [];
  setSchedulerInject((bot, text, kind) => {
    calls.push(`${kind}:${text}`);
    return { runId: "r", steered: false };
  });
  runTick();
  assert.deepEqual(calls, ["continuous:keep going"]);
  assert.equal(db.getTrigger(String(trig?.id))?.next_run_at, null);

  // no clock re-arm: a second tick with the timer cleared stays quiet
  runTick();
  assert.equal(calls.length, 1);
});

test("blocked bots skip continuous fires", () => {
  const trig = db.listTriggers("bot-c").find((t) => t.kind === "continuous");
  assert.ok(trig);
  const injects: string[] = [];
  setSchedulerInject((_bot, text) => {
    injects.push(text);
    return { runId: "r", steered: false };
  });

  try {
    db.updateBot("bot-c", { status_level: "blocked" });
    db.updateTrigger(String(trig.id), { next_run_at: Date.now() - 1 });
    runTick();
    assert.deepEqual(injects, []);
    assert.equal(db.getTrigger(String(trig.id))?.next_run_at, null);

    db.updateBot("bot-c", { status_level: null });
    const errRun = `run-e-${Math.random().toString(36).slice(2)}`;
    db.insertRun({
      id: errRun,
      bot_id: "bot-c",
      status: "running",
      trigger: "manual",
      started_at: Date.now(),
      finished_at: null,
      output: null,
      error: null,
    });
    db.finishRun(errRun, "error", null, "boom");
    db.updateTrigger(String(trig.id), { next_run_at: Date.now() - 1 });
    runTick();
    assert.deepEqual(injects, []);

    const okRun = `run-k-${Math.random().toString(36).slice(2)}`;
    db.insertRun({
      id: okRun,
      bot_id: "bot-c",
      status: "running",
      trigger: "manual",
      started_at: Date.now() + 1_000,
      finished_at: null,
      output: null,
      error: null,
    });
    db.finishRun(okRun, "ok", "fine", null);
    db.updateTrigger(String(trig.id), { next_run_at: Date.now() - 1 });
    runTick();
    assert.deepEqual(injects, ["keep going"]);
  } finally {
    setSchedulerInject(null);
    db.updateBot("bot-c", { status_level: null });
  }
});
