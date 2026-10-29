import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-archive-test-")),
  "t.db",
);

const { createApp } = await import("../src/api.ts");
const { dueTriggers, updateTrigger } = await import("../src/db.ts");
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
    email: "archive@example.com",
    password: "dev-session-1",
  }),
});
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function createBot(name: string): Promise<string> {
  const res = await authed("/api/bots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  assert.equal(res.status, 201);
  return (await json<{ id: string }>(res)).id;
}

const ACTIVE = await createBot("active-archive-bot");
const BOT = await createBot("archive-target-bot");

const hookRes = await authed(`/api/bots/${BOT}/triggers`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ kind: "webhook", message: "Archive event" }),
});
assert.equal(hookRes.status, 201);
const HOOK = await json<{ id: string; secret: string }>(hookRes);

const scheduleRes = await authed(`/api/bots/${BOT}/triggers`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ message: "Archive check", schedule: "@every 5m" }),
});
assert.equal(scheduleRes.status, 201);
const SCHEDULE_ID = (await json<{ id: string }>(scheduleRes)).id;
updateTrigger(SCHEDULE_ID, { next_run_at: Date.now() - 1_000 });

function findBot(rows: Record<string, unknown>[], id: string) {
  return rows.find((row) => row.id === id);
}

test("due triggers include enabled unarchived bots", () => {
  assert.ok(
    dueTriggers(Date.now()).some((trigger) => trigger.id === SCHEDULE_ID),
  );
});

test("archive hides a bot and marks it disabled in the archived view", async () => {
  const archive = await authed(`/api/bots/${BOT}/archive`, { method: "POST" });
  assert.equal(archive.status, 200);
  assert.equal((await json<Record<string, unknown>>(archive)).archived, 1);

  const visible = await json<Record<string, unknown>[]>(
    await authed("/api/bots"),
  );
  assert.ok(findBot(visible, ACTIVE));
  assert.equal(findBot(visible, BOT), undefined);

  const included = await json<Record<string, unknown>[]>(
    await authed("/api/bots?archived=1"),
  );
  const archivedRow = findBot(included, BOT);
  assert.ok(archivedRow);
  assert.equal(archivedRow.archived, 1);
  assert.equal(archivedRow.health, "gray");
  assert.equal(archivedRow.run_state, "disabled");
});

test("archived bots reject runs, chat sends, webhooks, and scheduled work", async () => {
  const run = await authed(`/api/bots/${BOT}/run`, { method: "POST" });
  assert.equal(run.status, 409);
  assert.deepEqual(await json(run), { error: "bot is archived" });

  const chat = await authed(`/api/bots/${BOT}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "archived message" }),
  });
  assert.equal(chat.status, 409);
  assert.deepEqual(await json(chat), { error: "bot is archived" });

  const webhook = await app.request(`/api/webhooks/${HOOK.id}`, {
    method: "POST",
    headers: { authorization: `Bearer ${HOOK.secret}` },
    body: "payload",
  });
  assert.equal(webhook.status, 409);
  assert.deepEqual(await json(webhook), { error: "bot is archived" });

  assert.ok(
    !dueTriggers(Date.now()).some((trigger) => trigger.id === SCHEDULE_ID),
  );
});

test("unarchiving returns a disabled bot that must be enabled again", async () => {
  const unarchive = await authed(`/api/bots/${BOT}/unarchive`, {
    method: "POST",
  });
  assert.equal(unarchive.status, 200);
  const row = await json<Record<string, unknown>>(unarchive);
  assert.equal(row.archived, 0);
  assert.equal(row.enabled, 0);

  const visible = await json<Record<string, unknown>[]>(
    await authed("/api/bots"),
  );
  const restoredRow = findBot(visible, BOT);
  assert.ok(restoredRow);
  assert.equal(restoredRow.run_state, "disabled");

  const disabledRun = await authed(`/api/bots/${BOT}/run`, { method: "POST" });
  assert.equal(disabledRun.status, 409);
  assert.deepEqual(await json(disabledRun), { error: "bot is disabled" });
  assert.ok(
    !dueTriggers(Date.now()).some((trigger) => trigger.id === SCHEDULE_ID),
  );

  const enable = await authed(`/api/bots/${BOT}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enable.status, 200);
  assert.ok(
    dueTriggers(Date.now()).some((trigger) => trigger.id === SCHEDULE_ID),
  );
});
