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
  body: JSON.stringify({ email: "pp@example.com", password: "dev-session-1" }),
});
const signupCookie = signup.headers.get("set-cookie") ?? "";
SESSION = signupCookie.split(";")[0] ?? "";

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const botRes = await authedRequest("/api/bots", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: SESSION },
  body: JSON.stringify({ name: "paused-bot" }),
});
const BOT = (await json(botRes)).id as string;

const hookRes = await authedRequest(`/api/bots/${BOT}/triggers`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: SESSION },
  body: JSON.stringify({ kind: "webhook", message: "Event arrived" }),
});
const HOOK = (await json(hookRes)) as { id: string; secret: string };

async function setPaused(paused: boolean): Promise<Response> {
  return authedRequest("/api/pause", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ paused }),
  });
}

test("pause state starts off and round-trips", async () => {
  assert.deepEqual(await json(await authedRequest("/api/pause")), {
    paused: false,
  });
  assert.deepEqual(await json(await setPaused(true)), { paused: true });
  assert.deepEqual(await json(await authedRequest("/api/pause")), {
    paused: true,
  });
});

test("pause flag must be a boolean", async () => {
  const res = await authedRequest("/api/pause", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ paused: "yes" }),
  });
  assert.equal(res.status, 400);
});

test("run-now is rejected while paused", async () => {
  const res = await authedRequest(`/api/bots/${BOT}/run`, { method: "POST" });
  assert.equal(res.status, 409);
});

test("webhook is rejected while paused", async () => {
  const res = await authedRequest(`/api/webhooks/${HOOK.id}`, {
    method: "POST",
    headers: { authorization: `Bearer ${HOOK.secret}` },
    body: "payload",
  });
  assert.equal(res.status, 409);
});

test("chat send is held while paused and drains on resume", async () => {
  const send = await authedRequest(`/api/bots/${BOT}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ text: "queued while paused" }),
  });
  assert.equal(send.status, 200);
  assert.deepEqual(await json(send), {
    runId: null,
    steered: false,
    held: true,
  });

  const resume = await setPaused(false);
  assert.deepEqual(await json(resume), { paused: false });

  const runs = (await json(
    await authedRequest(`/api/bots/${BOT}/runs`),
  )) as unknown as { trigger: string; status: string; error: string | null }[];
  assert.equal(runs.length, 1);
  assert.equal(runs[0].trigger, "chat");
  assert.equal(runs[0].status, "error");
  assert.equal(runs[0].error, "no model configured");
});

test("held messages drain together into the resumed run", async () => {
  await setPaused(true);
  for (const text of ["first held", "second held"]) {
    const send = await authedRequest(`/api/bots/${BOT}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: SESSION },
      body: JSON.stringify({ text }),
    });
    assert.equal((await json(send)).held, true);
  }
  const runsBefore = (await json(
    await authedRequest(`/api/bots/${BOT}/runs`),
  )) as unknown as unknown[];
  await setPaused(false);
  const runs = (await json(
    await authedRequest(`/api/bots/${BOT}/runs`),
  )) as unknown as { trigger: string }[];
  // no live loop exists (no model configured), so each held send records its own run
  assert.equal(runs.length, runsBefore.length + 2);
  assert.equal(runs[0].trigger, "chat");
});

test("disabled bot stays 409 while paused", async () => {
  const otherRes = await authedRequest("/api/bots", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ name: "off-bot" }),
  });
  const other = (await json(otherRes)).id as string;
  await authedRequest(`/api/bots/${other}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ enabled: false }),
  });

  await setPaused(true);
  const send = await authedRequest(`/api/bots/${other}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: SESSION },
    body: JSON.stringify({ text: "for the disabled bot" }),
  });
  assert.equal(send.status, 409);
  await setPaused(false);
});
