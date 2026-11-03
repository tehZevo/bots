import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-webhook-deliv-")),
  "t.db",
);

const { createApp } = await import("../src/api.ts");
const app = createApp();

process.env.ALLOW_REGISTRATION = "true";
let SESSION = "";

function authed(path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: {
      ...(SESSION ? { cookie: SESSION } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

const signup = await authed("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "deliveries@example.com",
    password: "dev-session-1",
  }),
});
assert.ok(signup.status === 200 || signup.status === 201);
const cookie = signup.headers.get("set-cookie");
if (cookie) SESSION = cookie;

const bot = await authed("/api/bots", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Webhook Bot" }),
});
const botId = (await json<{ id: string }>(bot)).id;

interface Delivery {
  id: number;
  status: number;
  outcome: string;
  duration_ms: number;
  preview: string;
}

async function deliveries(triggerId: string): Promise<Delivery[]> {
  const res = await authed(`/api/triggers/${triggerId}/deliveries`);
  assert.equal(res.status, 200);
  return await json<Delivery[]>(res);
}

async function makeWebhook(): Promise<{ id: string; secret: string }> {
  const res = await authed(`/api/bots/${botId}/triggers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "webhook",
      message: "a webhook fired",
      secret: "0".repeat(48),
    }),
  });
  assert.equal(res.status, 201);
  const body = await json<{ id: string; secret: string }>(res);
  return { id: body.id, secret: body.secret ?? "0".repeat(48) };
}

function fire(triggerId: string, secret: string, body = "hello") {
  return app.request(`/api/webhooks/${triggerId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    body,
  });
}

test("accepted and rejected attempts each record a delivery", async () => {
  const { id, secret } = await makeWebhook();

  assert.equal((await fire(id, "wrong-secret")).status, 401);
  assert.equal((await fire(id, secret)).status, 200);

  const rows = await deliveries(id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].outcome, "accepted");
  assert.equal(rows[0].status, 200);
  assert.equal(rows[1].outcome, "unauthorized");
  assert.equal(rows[1].status, 401);
  assert.ok(rows[0].duration_ms >= 0);
  assert.equal(rows[0].preview, "hello");
});

test("unknown triggers, oversized bodies and disabled bots are recorded", async () => {
  const { id, secret } = await makeWebhook();

  assert.equal(
    (
      await app.request("/api/webhooks/does-not-exist", {
        method: "POST",
        body: "x",
      })
    ).status,
    404,
  );
  assert.equal((await fire(id, secret, "y".repeat(70 * 1024))).status, 413);
  await authed(`/api/bots/${botId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal((await fire(id, secret)).status, 409);
  await authed(`/api/bots/${botId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });

  const rows = await deliveries(id);
  assert.deepEqual(
    rows.map((row) => row.outcome),
    ["disabled", "too_large"],
  );
  const { listWebhookDeliveries } = await import("../src/db.ts");
  assert.deepEqual(
    listWebhookDeliveries("does-not-exist").map((row) => row.outcome),
    ["not_found"],
  );
});

test("previews are capped at 2 KB and never leak the secret", async () => {
  const { id, secret } = await makeWebhook();
  await fire(id, secret, "z".repeat(5000));
  await fire(id, secret, `payload mentions ${secret}`);

  const rows = await deliveries(id);
  assert.equal(rows[1].preview.length, 2048);
  assert.ok(!rows[0].preview.includes(secret));
  assert.match(rows[0].preview, /payload mentions \[redacted\]/);
});

test("the log is capped at the newest 100 rows", async () => {
  const { insertWebhookDelivery, listWebhookDeliveries } = await import(
    "../src/db.ts"
  );
  for (let i = 0; i < 105; i++)
    insertWebhookDelivery({
      triggerId: "cap-trigger",
      status: 401,
      outcome: "unauthorized",
      durationMs: 1,
      preview: "",
    });
  assert.equal(listWebhookDeliveries("cap-trigger").length, 100);
});

test("rotating the secret keeps history; deleting the trigger removes it", async () => {
  const { id, secret } = await makeWebhook();
  await fire(id, secret);
  const rotated = await authed(`/api/triggers/${id}/rotate-secret`, {
    method: "POST",
  });
  assert.equal(rotated.status, 200);
  assert.equal((await deliveries(id)).length, 1);

  const removed = await authed(`/api/triggers/${id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  const gone = await authed(`/api/triggers/${id}/deliveries`);
  assert.equal(gone.status, 404);
});

test("the deliveries endpoint needs a real trigger", async () => {
  const missing = await authed("/api/triggers/nope/deliveries");
  assert.equal(missing.status, 404);
});
