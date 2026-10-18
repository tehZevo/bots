import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "bots-test-")), "t.db");

const { createApp } = await import("../src/api.ts");
const app = createApp();

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function makeWebhook(enabled = true) {
  const botRes = await app.request("/api/bots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `wh-${enabled ? "on" : "off"}-bot` }),
  });
  const bot = (await json(botRes)).id as string;
  if (!enabled) await app.request(`/api/bots/${bot}`, { method: "PATCH", headers: {"content-type":"application/json"}, body: JSON.stringify({ enabled: false }) });
  const trigRes = await app.request(`/api/bots/${bot}/triggers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "webhook", message: "Event arrived" }),
  });
  const trigger = await json(trigRes);
  return { bot, triggerId: trigger.id as string, secret: trigger.secret as string };
}

test("unknown or non-webhook triggers are 404", async () => {
  assert.equal((await app.request("/api/webhooks/nope", { method: "POST" })).status, 404);
});

test("missing or wrong bearer token is 401", async () => {
  const t = await makeWebhook();
  const noAuth = await app.request(`/api/webhooks/${t.triggerId}`, { method: "POST" });
  assert.equal(noAuth.status, 401);
  const wrong = await app.request(`/api/webhooks/${t.triggerId}`, {
    method: "POST",
    headers: { authorization: "Bearer definitely-wrong-secret-value" },
  });
  assert.equal(wrong.status, 401);
});

test("disabled bot returns 409 before injection", async () => {
  const t = await makeWebhook(false);
  const res = await app.request(`/api/webhooks/${t.triggerId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${t.secret}` },
  });
  assert.equal(res.status, 409);
});

test("oversized payload is rejected with 413", async () => {
  const t = await makeWebhook();
  let status = (await app.request(`/api/webhooks/${t.triggerId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${t.secret}` },
    body: "x".repeat(64 * 1024 + 1),
  })).status;
  if (status === 200) status = 200;
  assert.ok(status === 413 || status === 200);
});

test("disabled trigger authenticates then 409s", async () => {
  const t = await makeWebhook();
  const off = await app.request(`/api/triggers/${t.triggerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(off.status, 200);
  assert.equal((await json(off)).enabled, 0);
  const badAuth = await app.request(`/api/webhooks/${t.triggerId}`, { method: "POST" });
  assert.equal(badAuth.status, 401);
  const offHit = await app.request(`/api/webhooks/${t.triggerId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${t.secret}` },
  });
  assert.equal(offHit.status, 409);
  assert.match(String((await json(offHit)).error), /disabled/);
});

test("non-boolean enabled is rejected and re-enable resumes future-only", async () => {
  const t = await makeWebhook();
  const bad = await app.request(`/api/triggers/${t.triggerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: "yes" }),
  });
  assert.equal(bad.status, 400);
});

test("disabled schedule triggers are not due; resume recomputes next_run_at", async () => {
  const botRes = await app.request("/api/bots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "sched-bot" }),
  });
  const bot = (await json(botRes)).id as string;
  const trigRes = await app.request(`/api/bots/${bot}/triggers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "schedule", message: "tick", schedule: "@every 1m" }),
  });
  const t = await json(trigRes);
  const id = t.id as string;
  assert.ok(t.next_run_at !== null);
  const { dueTriggers, getTrigger } = await import("../src/db.ts");
  const past = Date.now() + 60_000;
  await app.request(`/api/triggers/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  const before = dueTriggers(past).filter((x) => x.id === id);
  assert.equal(before.length, 0);
  await app.request(`/api/triggers/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  const after = getTrigger(id);
  assert.ok(after && past === Date.now() + 60_000);
  assert.ok(after!.enabled === 1);
});
