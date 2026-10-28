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
  body: JSON.stringify({ email: "b@example.com", password: "dev-session-1" }),
});
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

const { checkSpendBreaker, insertRun, recordRunUsage } = await import(
  "../src/db.ts"
);

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const BOT = (
  await json(
    await authedRequest("/api/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "breaker-bot" }),
    }),
  )
).id as string;

const DAY = 24 * 60 * 60 * 1000;

function recordUsage(id: string, total: number, ageDays = 0): void {
  insertRun({
    id,
    bot_id: BOT,
    status: "ok",
    trigger: "manual",
    started_at: Date.now() - ageDays * DAY,
    finished_at: Date.now() - ageDays * DAY,
    output: null,
    error: null,
  });
  recordRunUsage(id, BOT, Date.now() - ageDays * DAY, {
    input: Math.floor(total / 2),
    output: Math.ceil(total / 2),
    cache_read: 0,
    cache_write: 0,
  });
}

async function putBreaker(limit: unknown): Promise<Response> {
  return authedRequest("/api/breaker", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit_tokens: limit }),
  });
}

async function setPaused(paused: boolean): Promise<Response> {
  return authedRequest("/api/pause", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paused }),
  });
}

test("breaker starts unlimited with zero usage and does not trip", async () => {
  assert.deepEqual(await json(await authedRequest("/api/breaker")), {
    limit_tokens: 0,
    tokens_30d: 0,
    exceeded: false,
  });
  recordUsage("u-old-big", 5000, 45);
  assert.equal(checkSpendBreaker(), false);
  const state = await json(await authedRequest("/api/breaker"));
  assert.equal(state.tokens_30d, 0);
});

test("breaker cap round-trips and validates input", async () => {
  for (const bad of ["x", -5, 1.5, null]) {
    const res = await putBreaker(bad);
    assert.equal(res.status, 400);
  }
  assert.equal(
    (await json(await putBreaker(1000))).limit_tokens as number,
    1000,
  );
});

test("crossing the cap at run end arms the global pause with a notification", async () => {
  recordUsage("u-over", 1250);
  assert.equal(checkSpendBreaker(), true);
  const state = await json(await authedRequest("/api/breaker"));
  assert.equal(state.tokens_30d, 1250);
  assert.equal(state.exceeded, true);
  assert.deepEqual(await json(await authedRequest("/api/pause")), {
    paused: true,
    reason: "breaker",
  });
  let notifs = (await json(await authedRequest("/api/notifications")))
    .items as { kind: string; title: string }[];
  assert.ok(notifs.some((n) => n.kind === "breaker"));
  checkSpendBreaker();
  notifs = (await json(await authedRequest("/api/notifications")))
    .items as { kind: string; title: string }[];
  assert.equal(
    notifs.filter((n) => n.kind === "breaker").length,
    1,
    "one notification per trip",
  );
});

test("resume is refused while over the cap and permitted after raising it", async () => {
  const res = await setPaused(false);
  assert.equal(res.status, 409);
  const body = await json(res);
  assert.match(String(body.error), /1,250/);
  assert.match(String(body.error), /1,000/);
  assert.equal(
    (await json(await putBreaker(100000))).exceeded as boolean,
    false,
  );
  assert.deepEqual(await json(await setPaused(false)), { paused: false });
});

test("clearing the cap unarms the breaker", async () => {
  recordUsage("u-over-again", 500000);
  assert.equal(checkSpendBreaker(), true);
  assert.equal((await json(await putBreaker(0))).limit_tokens as number, 0);
  assert.deepEqual(await json(await setPaused(false)), { paused: false });
});
