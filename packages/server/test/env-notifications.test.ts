import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-env-notif-test-")),
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
    email: "envnotif@example.com",
    password: "dev-session-1",
  }),
});
assert.ok(signup.status === 200 || signup.status === 201);
const cookie = signup.headers.get("set-cookie");
if (cookie) SESSION = cookie;

interface Note {
  id: number;
  source: string;
  detail: string;
  created_at: number;
  status: string;
}

async function queue(botId: string): Promise<Note[]> {
  const res = await authed(`/api/bots/${botId}/notifications`);
  assert.equal(res.status, 200);
  return (await json<{ notifications: Note[] }>(res)).notifications;
}

async function makeBot(name: string): Promise<string> {
  const res = await authed("/api/bots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  assert.equal(res.status, 201);
  return (await json<{ id: string }>(res)).id;
}

async function makeProject(name: string): Promise<string> {
  const res = await authed("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, body: "first body" }),
  });
  assert.equal(res.status, 201);
  return (await json<{ id: string }>(res)).id;
}

test("project body edit queues a notification for attached bots only", async () => {
  const attached = await makeBot("attached-bot");
  const other = await makeBot("other-bot");
  const projectId = await makeProject("website");

  await authed(`/api/bots/${attached}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_ids: [projectId] }),
  });
  const afterAttach = await queue(attached);
  assert.equal(afterAttach.length, 1);
  assert.match(afterAttach[0].detail, /attached/);

  const edit = await authed(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "second body" }),
  });
  assert.equal(edit.status, 200);

  const notes = await queue(attached);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].source, `project:${projectId}`);
  assert.equal(notes[0].status, "queued");
  assert.match(notes[0].detail, /website/);
  assert.doesNotMatch(notes[0].detail, /second body/);
  assert.equal((await queue(other)).length, 0);
});

test("repeated edits to one source collapse to the newest row", async () => {
  const botId = await makeBot("collapse-bot");
  const projectId = await makeProject("collapse");
  await authed(`/api/bots/${botId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_ids: [projectId] }),
  });

  for (const body of ["b2", "b3", "b4"]) {
    const res = await authed(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    assert.equal(res.status, 200);
  }

  const notes = await queue(botId);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].source, `project:${projectId}`);
});

test("distinct sources queue separate lines", async () => {
  const botId = await makeBot("multi-source-bot");
  const projectId = await makeProject("multi");
  await authed(`/api/bots/${botId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_ids: [projectId] }),
  });
  const secret = await authed("/api/secrets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "api-key", key: "API_KEY", value: "shhh" }),
  });
  assert.equal(secret.status, 201);

  const secretId = (await json<{ id: string }>(secret)).id;
  await authed(`/api/bots/${botId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret_ids: [secretId] }),
  });
  await authed(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "changed" }),
  });
  await authed(`/api/secrets/${secretId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "newsecret" }),
  });

  const notes = await queue(botId);
  const sources = notes.map((n) => n.source).sort();
  assert.deepEqual(sources, [`project:${projectId}`, `secret:${secretId}`]);
  assert.ok(notes.every((n) => !n.detail.includes("newsecret")));
});

test("detaching a project queues its own notification", async () => {
  const botId = await makeBot("detach-bot");
  const projectId = await makeProject("detach-me");
  await authed(`/api/bots/${botId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_ids: [projectId] }),
  });
  await authed(`/api/bots/${botId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_ids: [] }),
  });

  const notes = await queue(botId);
  assert.equal(notes.length, 1);
  assert.match(notes[0].detail, /detached/);
});

test("the queue endpoint is read-only", async () => {
  const botId = await makeBot("readonly-bot");
  const res = await authed(`/api/bots/${botId}/notifications`, {
    method: "DELETE",
  });
  assert.ok(res.status === 404 || res.status === 405);
});
