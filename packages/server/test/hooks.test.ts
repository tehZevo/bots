import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "bots-hooks-test-"));
process.env.DATA_DIR = dir;
process.env.DATABASE_PATH = join(dir, "t.db");
process.env.ALLOW_REGISTRATION = "true";

const { createApp } = await import("../src/api.ts");
const db = await import("../src/db.ts");
const { attachHookEvents, setHookSleep, setHookTransport } = await import(
  "../src/hooks.ts"
);

const app = createApp();
const signup = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "hooks@example.com",
    password: "hooks-pass-1",
  }),
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  condition: () => boolean,
  message: string,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (condition()) return;
    await sleep(5);
  }
  assert.fail(message);
}

interface HookCall {
  url: string;
  body: string;
  signature: string | null;
}

const calls: HookCall[] = [];
let responder = () => new Response(null, { status: 201 });
setHookTransport(async (url, init) => {
  const headers = new Headers(init?.headers);
  calls.push({
    url: String(url),
    body: String(init?.body ?? ""),
    signature: headers.get("x-bots-signature"),
  });
  return responder();
});
attachHookEvents();

let destinationId = "";

test("destination CRUD validates and masks secrets", async () => {
  const missingSecret = await req("POST", "/api/hooks", {
    name: "Incomplete",
    url: "https://receiver.test/incomplete",
    event_types: ["run.finished"],
  });
  assert.equal(missingSecret.status, 400);
  assert.match(String(missingSecret.json.error), /secret/);

  const badType = await req("POST", "/api/hooks", {
    name: "Bad type",
    url: "https://receiver.test/bad-type",
    secret: "s",
    event_types: ["not.a.real.event"],
  });
  assert.equal(badType.status, 400);
  assert.match(String(badType.json.error), /unknown event type/);

  const badUrl = await req("POST", "/api/hooks", {
    name: "Bad url",
    url: "ftp://receiver.test/hook",
    secret: "s",
    event_types: [],
  });
  assert.equal(badUrl.status, 400);

  const created = await req("POST", "/api/hooks", {
    name: "Run hook",
    url: "http://receiver.test/run-hook?source=bots",
    secret: "s3cret",
    event_types: ["run.finished"],
  });
  assert.equal(created.status, 201);
  destinationId = String(created.json.id);
  assert.ok(destinationId);
  assert.equal(created.json.has_secret, true);
  assert.equal("secret" in created.json, false);

  const list = await req("GET", "/api/hooks");
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.json));
  assert.equal((list.json as unknown[]).length, 1);
  assert.equal("secret" in (list.json as Record<string, unknown>[])[0], false);

  const badLimit = await req(
    "GET",
    `/api/hooks/${destinationId}/deliveries?limit=0`,
  );
  assert.equal(badLimit.status, 400);
  const missingDeliveries = await req("GET", "/api/hooks/missing/deliveries");
  assert.equal(missingDeliveries.status, 404);
});

test("run.finished sends a signed event with token totals and logs it", async () => {
  db.insertBot({
    id: "hook-bot",
    name: "Hook Bot",
    instructions: "",
    enabled: 1,
    current_task: null,
    current_task_updated_at: null,
    status: null,
    status_level: null,
    token_budget: null,
    created_at: Date.now(),
  });
  db.insertRun({
    id: "hook-run",
    bot_id: "hook-bot",
    status: "running",
    trigger: "schedule",
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });
  db.recordRunUsage("hook-run", "hook-bot", Date.now(), {
    input: 30,
    output: 20,
    cache_read: 4,
    cache_write: 6,
  });

  const before = calls.length;
  db.finishRun("hook-run", "ok", "visible transcript text", null);
  await waitFor(() => calls.length > before, "run.finished event was not sent");

  const call = calls[before];
  assert.equal(call.url, "http://receiver.test/run-hook?source=bots");
  const expectedSignature = `sha256=${createHmac("sha256", "s3cret")
    .update(call.body, "utf8")
    .digest("hex")}`;
  assert.equal(call.signature, expectedSignature);

  const event = JSON.parse(call.body) as {
    id: string;
    type: string;
    occurred_at: number;
    data: Record<string, unknown>;
  };
  assert.match(event.id, /^[0-9a-f-]{36}$/);
  assert.equal(event.type, "run.finished");
  assert.ok(Number.isFinite(event.occurred_at));
  assert.deepEqual(event.data.bot, { id: "hook-bot", name: "Hook Bot" });
  assert.equal(event.data.status, "ok");
  assert.equal(event.data.source, "schedule");
  assert.deepEqual(event.data.tokens, {
    input: 30,
    output: 20,
    cache_read: 4,
    cache_write: 6,
    total: 60,
  });
  assert.equal("output" in event.data, false);
  assert.equal("error" in event.data, false);

  await waitFor(
    () => db.listHookDeliveries(destinationId).length === 1,
    "delivery row was not written",
  );
  const logged = (await req("GET", `/api/hooks/${destinationId}/deliveries`))
    .json as Record<string, unknown>[];
  assert.equal(logged.length, 1);
  assert.equal(logged[0].event_type, "run.finished");
  assert.equal(logged[0].status, "ok");
  assert.equal(logged[0].attempt, 1);
  assert.equal(logged[0].http_status, 201);
  assert.ok(Number.isInteger(logged[0].duration_ms));
});

test("global pause suppresses events except breaker.tripped", async () => {
  const updated = await req("PUT", `/api/hooks/${destinationId}`, {
    name: "System hook",
    url: "https://receiver.test/system-hook",
    event_types: ["notification.created", "breaker.tripped"],
    enabled: true,
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.json.event_types, [
    "notification.created",
    "breaker.tripped",
  ]);
  assert.equal(updated.json.has_secret, true);

  const before = calls.length;
  db.setPaused(true);
  try {
    db.createNotification({ kind: "paused", title: "Hidden", body: "body" });
    await sleep(50);
    assert.equal(calls.length, before);

    db.publishAppEvent("breaker.tripped", { reason: "test budget" });
    await waitFor(() => calls.length > before, "breaker.tripped was not sent");
    const call = calls[before];
    assert.equal(call.url, "https://receiver.test/system-hook");
    const event = JSON.parse(call.body) as { type: string; data: unknown };
    assert.equal(event.type, "breaker.tripped");
    assert.deepEqual(event.data, { reason: "test budget" });
  } finally {
    db.setPaused(false);
  }
});

test("transient failures retry three times with exponential backoff", async () => {
  const delays: number[] = [];
  setHookSleep(async (ms) => {
    delays.push(ms);
  });
  const statuses = [500, 501, 429];
  responder = () => new Response(null, { status: statuses.shift() ?? 200 });

  const beforeCalls = calls.length;
  const beforeDeliveries = db.listHookDeliveries(destinationId).length;
  db.createNotification({ kind: "retry", title: "Retry me", body: "body" });
  await waitFor(
    () => calls.length >= beforeCalls + 4,
    "transient delivery did not retry four times",
  );

  const expected = [1_000, 2_000, 4_000];
  assert.equal(delays.slice(0, 3).length, 3);
  for (const [index, base] of expected.entries()) {
    const delay = delays[index];
    assert.ok(delay >= base && delay <= base * 1.6, `bad delay ${delay}`);
  }

  await waitFor(
    () => db.listHookDeliveries(destinationId).length === beforeDeliveries + 4,
    "retry deliveries were not fully logged",
  );
  const rows = db.listHookDeliveries(destinationId).slice(0, 4).reverse();
  assert.deepEqual(
    rows.map((row) => row.attempt),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    rows.map((row) => row.status),
    ["error", "error", "error", "ok"],
  );
  assert.deepEqual(
    rows.map((row) => row.http_status),
    [500, 501, 429, 200],
  );

  setHookSleep(null);
  responder = () => new Response(null, { status: 200 });
});

test("permanent failures are not retried", async () => {
  let remaining = 1;
  responder = () => new Response(null, { status: remaining-- > 0 ? 404 : 500 });

  const beforeCalls = calls.length;
  const beforeDeliveries = db.listHookDeliveries(destinationId).length;
  db.createNotification({ kind: "permanent", title: "Gone", body: "body" });
  await waitFor(() => calls.length > beforeCalls, "delivery was not attempted");

  await sleep(50);
  assert.equal(calls.length, beforeCalls + 1);
  const rows = db.listHookDeliveries(destinationId).slice(0, 1);
  assert.equal(rows.length, 1);
  assert.equal(beforeDeliveries + rows.length > beforeDeliveries, true);
  assert.equal(rows[0].status, "error");
  assert.equal(rows[0].attempt, 1);
  assert.equal(rows[0].http_status, 404);

  responder = () => new Response(null, { status: 200 });
});

test("bot.blocked and bot.recovered fire on status transitions", async () => {
  const created = await req("POST", "/api/hooks", {
    name: "Block hook",
    url: "https://receiver.test/block-hook",
    secret: "block-secret",
    event_types: ["bot.blocked", "bot.recovered"],
  });
  assert.equal(created.status, 201);
  const blockDestinationId = String(created.json.id);

  const before = calls.length;
  db.setBotStatus("hook-bot", "blocked: bad config", "blocked");
  await waitFor(() => calls.length > before, "bot.blocked was not sent");
  const blockedCall = calls[before];
  assert.equal(blockedCall.url, "https://receiver.test/block-hook");
  const blocked = JSON.parse(blockedCall.body) as {
    type: string;
    data: Record<string, unknown>;
  };
  assert.equal(blocked.type, "bot.blocked");
  assert.deepEqual(blocked.data.bot, { id: "hook-bot", name: "Hook Bot" });
  assert.equal(blocked.data.status, "blocked: bad config");

  const recoveredCallCount = before + 1;
  db.setBotStatus("hook-bot", null);
  await waitFor(
    () => calls.length > recoveredCallCount,
    "bot.recovered was not sent",
  );
  const recovered = JSON.parse(calls[recoveredCallCount].body) as {
    type: string;
    data: Record<string, unknown>;
  };
  assert.equal(recovered.type, "bot.recovered");
  assert.deepEqual(recovered.data.bot, { id: "hook-bot", name: "Hook Bot" });

  const deleted = await req("DELETE", `/api/hooks/${blockDestinationId}`);
  assert.equal(deleted.status, 200);
});

test("send test logs a ping and disabled destinations stay quiet", async () => {
  responder = () => new Response(null, { status: 204 });
  const beforeCalls = calls.length;
  const beforeDeliveries = db.listHookDeliveries(destinationId).length;

  const testResponse = await req("POST", `/api/hooks/${destinationId}/test`);
  assert.equal(testResponse.status, 200);
  assert.equal(testResponse.json.ok, true);
  assert.equal(testResponse.json.status, 204);
  assert.ok(Number.isInteger(testResponse.json.duration_ms));

  const call = calls[beforeCalls];
  const event = JSON.parse(call.body) as { type: string; data: unknown };
  assert.equal(event.type, "ping");
  assert.deepEqual(event.data, {});
  const expectedSignature = `sha256=${createHmac("sha256", "s3cret")
    .update(call.body, "utf8")
    .digest("hex")}`;
  assert.equal(call.signature, expectedSignature);

  await waitFor(
    () => db.listHookDeliveries(destinationId).length === beforeDeliveries + 1,
    "ping delivery was not logged",
  );
  const pingRow = db.listHookDeliveries(destinationId)[0];
  assert.equal(pingRow.event_type, "ping");
  assert.equal(pingRow.status, "ok");

  const disabled = await req("PUT", `/api/hooks/${destinationId}`, {
    name: "System hook",
    url: "https://receiver.test/system-hook",
    event_types: ["notification.created", "breaker.tripped"],
    enabled: false,
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.json.enabled, 0);

  const quietCalls = calls.length;
  const quietDeliveries = db.listHookDeliveries(destinationId).length;
  db.createNotification({ kind: "muted", title: "Muted", body: "body" });
  await sleep(50);
  assert.equal(calls.length, quietCalls);

  const disabledTest = await req("POST", `/api/hooks/${destinationId}/test`);
  assert.equal(disabledTest.status, 409);
  assert.match(String(disabledTest.json.error), /disabled/);
  assert.equal(db.listHookDeliveries(destinationId).length, quietDeliveries);

  const deleted = await req("DELETE", `/api/hooks/${destinationId}`);
  assert.equal(deleted.status, 200);
  assert.equal(db.getHookDestination(destinationId), undefined);
  assert.equal(db.listHookDeliveries(destinationId).length, 0);
  assert.ok(Array.isArray((await req("GET", "/api/hooks")).json));

  const missing = await req("POST", `/api/hooks/${destinationId}/test`);
  assert.equal(missing.status, 404);
});
