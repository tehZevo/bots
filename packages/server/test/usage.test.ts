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
  body: JSON.stringify({ email: "u@example.com", password: "dev-session-1" }),
});
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

const { insertRun, recordRunUsage, botUsageTotals } = await import(
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
      body: JSON.stringify({ name: "usage-bot" }),
    }),
  )
).id as string;

const DAY = 24 * 60 * 60 * 1000;

function runRow(id: string): void {
  insertRun({
    id,
    bot_id: BOT,
    status: "ok",
    trigger: "manual",
    started_at: Date.now(),
    finished_at: Date.now(),
    output: null,
    error: null,
  });
}

test("usage totals sum lifetime and trailing 30 days separately", () => {
  runRow("u-old");
  recordRunUsage("u-old", BOT, Date.now() - 40 * DAY, {
    input: 100,
    output: 50,
    cache_read: 700,
    cache_write: 20,
  });
  runRow("u-new");
  recordRunUsage("u-new", BOT, Date.now() - DAY, {
    input: 10,
    output: 5,
    cache_read: 70,
    cache_write: 2,
  });

  const totals = botUsageTotals(BOT);
  assert.deepEqual(totals.lifetime, {
    input: 110,
    output: 55,
    cache_read: 770,
    cache_write: 22,
    total: 957,
  });
  assert.deepEqual(totals.last30d, {
    input: 10,
    output: 5,
    cache_read: 70,
    cache_write: 2,
    total: 87,
  });
});

test("missing usage counts are zero", () => {
  runRow("u-zero");
  recordRunUsage("u-zero", BOT, Date.now(), {
    input: 1,
    output: 0,
    cache_read: 0,
    cache_write: 0,
  });
  const totals = botUsageTotals(BOT);
  assert.equal(totals.last30d.input, 11);
});

test("GET /api/bots/:id/usage serves both windows", async () => {
  const res = await authedRequest(`/api/bots/${BOT}/usage`);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.deepEqual(Object.keys(body).sort(), ["last30d", "lifetime"]);
});

test("unknown bot is 404", async () => {
  assert.equal((await authedRequest("/api/bots/nope/usage")).status, 404);
});
