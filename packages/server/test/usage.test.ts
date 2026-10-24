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
  assert.deepEqual(Object.keys(body).sort(), ["budget", "last30d", "lifetime"]);
});

test("unknown bot is 404", async () => {
  assert.equal((await authedRequest("/api/bots/nope/usage")).status, 404);
});

const BUDGET_BOT = (
  await json(
    await authedRequest("/api/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "budget-bot" }),
    }),
  )
).id as string;

function runRowOn(botId: string, id: string): void {
  insertRun({
    id,
    bot_id: botId,
    status: "ok",
    trigger: "manual",
    started_at: Date.now(),
    finished_at: Date.now(),
    output: null,
    error: null,
  });
}

test("token budget persists on the bot and can be cleared", async () => {
  const set = await json(
    await authedRequest(`/api/bots/${BUDGET_BOT}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token_budget: 250 }),
    }),
  );
  assert.equal(set.token_budget, 250);

  const usage = await json(
    await authedRequest(`/api/bots/${BUDGET_BOT}/usage`),
  );
  assert.equal(usage.budget, 250);

  const cleared = await json(
    await authedRequest(`/api/bots/${BUDGET_BOT}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token_budget: null }),
    }),
  );
  assert.equal(cleared.token_budget, null);

  const bad = await authedRequest(`/api/bots/${BUDGET_BOT}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token_budget: -3 }),
  });
  assert.equal(bad.status, 400);
});

test("a run is refused without calling the model once the budget is spent", async () => {
  await authedRequest(`/api/bots/${BUDGET_BOT}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token_budget: 100 }),
  });
  runRowOn(BUDGET_BOT, "b-used");
  recordRunUsage("b-used", BUDGET_BOT, Date.now(), {
    input: 60,
    output: 20,
    cache_read: 30,
    cache_write: 5,
  });

  const res = await authedRequest(`/api/bots/${BUDGET_BOT}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 202);

  const runs = (await json(
    await authedRequest(`/api/bots/${BUDGET_BOT}/runs`),
  )) as unknown as { status: string; error: string | null }[];
  const row = runs.find((r) => r.error === "token budget exhausted");
  assert.ok(row, "expected a token-budget-exhausted run row");
  assert.equal(row.status, "error");
});

test("raising the budget lets runs proceed again", async () => {
  const before = (await json(
    await authedRequest(`/api/bots/${BUDGET_BOT}/runs`),
  )) as unknown as { error: string | null }[];
  const refusalsBefore = before.filter(
    (r) => r.error === "token budget exhausted",
  ).length;
  await authedRequest(`/api/bots/${BUDGET_BOT}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token_budget: 100000 }),
  });
  const res = await authedRequest(`/api/bots/${BUDGET_BOT}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 202);

  const runs = (await json(
    await authedRequest(`/api/bots/${BUDGET_BOT}/runs`),
  )) as unknown as { error: string | null }[];
  const refusalsAfter = runs.filter(
    (r) => r.error === "token budget exhausted",
  ).length;
  assert.equal(refusalsAfter, refusalsBefore);
});

test("context breakdown estimates categories without a model", async () => {
  const res = await authedRequest(`/api/bots/${BOT}/context-usage`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    context_window: number | null;
    categories: Record<string, number>;
    used: number;
    free: number | null;
  };
  assert.equal(body.context_window, null);
  assert.equal(body.free, null);
  assert.ok(
    body.categories.system_prompt > 0,
    "system prompt should estimate non-zero",
  );
  assert.ok(body.categories.tools > 0, "tool defs should estimate non-zero");
  assert.equal(
    body.used,
    body.categories.system_prompt +
      body.categories.tools +
      body.categories.conversation,
  );
});

test("unknown bot context breakdown is 404", async () => {
  assert.equal(
    (await authedRequest("/api/bots/nope/context-usage")).status,
    404,
  );
});
