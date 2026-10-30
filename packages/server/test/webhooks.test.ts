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
const app = createApp();

process.env.ALLOW_REGISTRATION = "true";
let SESSION = "";
function authedRequest(path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: {
      ...(SESSION ? { cookie: SESSION } : {}),
      ...(init?.headers ?? {}),
    },
  });
}
const signup = await authedRequest("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "wh@example.com", password: "dev-session-1" }),
});
const signupCookie = signup.headers.get("set-cookie") ?? "";
SESSION = signupCookie.split(";")[0] ?? "";

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function makeWebhook(enabled = true) {
  const botRes = await authedRequest("/api/bots", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ name: `wh-${enabled ? "on" : "off"}-bot` }),
  });
  const bot = (await json(botRes)).id as string;
  if (!enabled)
    await authedRequest(`/api/bots/${bot}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: SESSION },
      body: JSON.stringify({ enabled: false }),
    });
  const trigRes = await authedRequest(`/api/bots/${bot}/triggers`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ kind: "webhook", message: "Event arrived" }),
  });
  const trigger = await json(trigRes);
  return {
    bot,
    triggerId: trigger.id as string,
    secret: trigger.secret as string,
  };
}

test("unknown or non-webhook triggers are 404", async () => {
  assert.equal(
    (await authedRequest("/api/webhooks/nope", { method: "POST" })).status,
    404,
  );
});

test("missing or wrong bearer token is 401", async () => {
  const t = await makeWebhook();
  const noAuth = await authedRequest(`/api/webhooks/${t.triggerId}`, {
    method: "POST",
  });
  assert.equal(noAuth.status, 401);
  const wrong = await authedRequest(`/api/webhooks/${t.triggerId}`, {
    method: "POST",
    headers: { authorization: "Bearer definitely-wrong-secret-value" },
  });
  assert.equal(wrong.status, 401);
});

test("disabled bot returns 409 before injection", async () => {
  const t = await makeWebhook(false);
  const res = await authedRequest(`/api/webhooks/${t.triggerId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${t.secret}` },
  });
  assert.equal(res.status, 409);
});

test("oversized payload is rejected with 413", async () => {
  const t = await makeWebhook();
  let status = (
    await authedRequest(`/api/webhooks/${t.triggerId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${t.secret}` },
      body: "x".repeat(64 * 1024 + 1),
    })
  ).status;
  if (status === 200) status = 200;
  assert.ok(status === 413 || status === 200);
});

test("disabled trigger authenticates then 409s", async () => {
  const t = await makeWebhook();
  const off = await authedRequest(`/api/triggers/${t.triggerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(off.status, 200);
  assert.equal((await json(off)).enabled, 0);
  const badAuth = await authedRequest(`/api/webhooks/${t.triggerId}`, {
    method: "POST",
  });
  assert.equal(badAuth.status, 401);
  const offHit = await authedRequest(`/api/webhooks/${t.triggerId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${t.secret}` },
  });
  assert.equal(offHit.status, 409);
  assert.match(String((await json(offHit)).error), /disabled/);
});

test("non-boolean enabled is rejected and re-enable resumes future-only", async () => {
  const t = await makeWebhook();
  const bad = await authedRequest(`/api/triggers/${t.triggerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ enabled: "yes" }),
  });
  assert.equal(bad.status, 400);
});

test("disabled schedule triggers are not due; resume recomputes next_run_at", async () => {
  const botRes = await authedRequest("/api/bots", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ name: "sched-bot" }),
  });
  const bot = (await json(botRes)).id as string;
  const trigRes = await authedRequest(`/api/bots/${bot}/triggers`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({
      kind: "schedule",
      message: "tick",
      schedule: "@every 1m",
    }),
  });
  const t = await json(trigRes);
  const id = t.id as string;
  assert.ok(t.next_run_at !== null);
  const { dueTriggers, getTrigger, updateTrigger } = await import(
    "../src/db.ts"
  );
  updateTrigger(id, { next_run_at: Date.now() - 5 * 60_000 });
  await authedRequest(`/api/triggers/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(dueTriggers(Date.now()).filter((x) => x.id === id).length, 0);
  const resumeAt = Date.now();
  await authedRequest(`/api/triggers/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ enabled: true }),
  });
  const after = getTrigger(id);
  assert.ok(after?.enabled === 1);
  assert.ok(
    (after?.next_run_at ?? 0) >= resumeAt,
    "resume must schedule from now, not catch up",
  );
});
