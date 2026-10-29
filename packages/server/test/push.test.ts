import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "bots-test-"));
process.env.DATA_DIR = dir;
process.env.DATABASE_PATH = join(dir, "t.db");
process.env.SECRETS_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

process.env.ALLOW_REGISTRATION = "true";
const { createApp } = await import("../src/api.ts");
const db = await import("../src/db.ts");
const { attachPushNotifications, setPushTransport } = await import(
  "../src/push.ts"
);

const app = createApp();
process.env.ALLOW_REGISTRATION = "true";
const signup = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "push@example.com", password: "push-pass-1" }),
});
const SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  return app
    .request(path, {
      method,
      headers: {
        cookie: SESSION,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    .then(async (res) => ({ status: res.status, json: await res.json() }));
}

test("vapid key is a P-256 public point and stable", async () => {
  const first = await req("GET", "/api/push/key");
  assert.equal(first.status, 200);
  const raw = Buffer.from(String(first.json.key), "base64url");
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 0x04);
  const second = await req("GET", "/api/push/key");
  assert.equal(second.json.key, first.json.key);
});

test("subscription validation", async () => {
  const badUrl = await req("PUT", "/api/push/subscription", {
    endpoint: "not-a-url",
    p256dh: "k",
    auth: "a",
  });
  assert.equal(badUrl.status, 400);
  const plainHttp = await req("PUT", "/api/push/subscription", {
    endpoint: "http://push.example.com/s/clear",
    p256dh: "k",
    auth: "a",
  });
  assert.equal(plainHttp.status, 400);
  const loopback = await req("PUT", "/api/push/subscription", {
    endpoint: "http://localhost:9/s/dev",
    p256dh: "k",
    auth: "a",
  });
  assert.equal(loopback.status, 201);
  const missingKeys = await req("PUT", "/api/push/subscription", {
    endpoint: "https://push.example.com/s/1",
    p256dh: "",
    auth: "",
  });
  assert.equal(missingKeys.status, 400);
  const delLoopback = await req("DELETE", "/api/push/subscription", {
    endpoint: "http://localhost:9/s/dev",
  });
  assert.equal(delLoopback.status, 200);
});

test("new notifications push; gone subscriptions are pruned", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  let nextStatus = 201;
  setPushTransport((async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: nextStatus });
  }) as typeof fetch);
  attachPushNotifications();

  const created = await req("PUT", "/api/push/subscription", {
    endpoint: "https://push.example.com/s/abc",
    p256dh: "BNzip",
    auth: "bXlhdA",
  });
  assert.equal(created.status, 201);
  await req("PUT", "/api/push/subscription", {
    endpoint: "https://push.example.com/s/abc",
    p256dh: "BNzip2",
    auth: "bXlhdA2",
  });
  assert.equal(db.listPushSubscriptions().length, 1);

  db.insertBot({
    id: "bot-p",
    name: "Pushy",
    instructions: "",
    enabled: 1,
    created_at: Date.now(),
  });
  db.insertRun({
    id: "run-p",
    bot_id: "bot-p",
    status: "running",
    trigger: "manual",
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });
  db.finishRun("run-p", "error", null, "boom");

  const deadline = Date.now() + 2_000;
  while (calls.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://push.example.com/s/abc");
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.match(
    headers.authorization,
    /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/,
  );
  assert.equal(headers.ttl, "86400");
  assert.equal(headers["content-type"], "application/json");
  const payload = JSON.parse(String(calls[0].init?.body)) as Record<
    string,
    unknown
  >;
  assert.equal(payload.target, "/bots?bot=bot-p&run=run-p");

  nextStatus = 410;
  db.createNotification({ kind: "test", title: "t", body: "b" });
  const pruneDeadline = Date.now() + 2_000;
  while (
    db.listPushSubscriptions().length === 1 &&
    Date.now() < pruneDeadline
  ) {
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(db.listPushSubscriptions().length, 0);

  setPushTransport(null);
});

test("delete is scoped to the owning user", async () => {
  const created = await req("PUT", "/api/push/subscription", {
    endpoint: "https://push.example.com/s/mine",
    p256dh: "k",
    auth: "a",
  });
  assert.equal(created.status, 201);

  const other = await app.request("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "other@example.com",
      password: "other-pass-1",
    }),
  });
  const otherCookie =
    (other.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const foreignDelete = await app.request("/api/push/subscription", {
    method: "DELETE",
    headers: { cookie: otherCookie, "content-type": "application/json" },
    body: JSON.stringify({ endpoint: "https://push.example.com/s/mine" }),
  });
  assert.equal(foreignDelete.status, 404);

  const ownerDelete = await req("DELETE", "/api/push/subscription", {
    endpoint: "https://push.example.com/s/mine",
  });
  assert.equal(ownerDelete.status, 200);
  const again = await req("DELETE", "/api/push/subscription", {
    endpoint: "https://push.example.com/s/mine",
  });
  assert.equal(again.status, 404);
});
