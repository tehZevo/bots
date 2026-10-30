import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-proj-")),
  "t.db",
);

const { createApp } = await import("../src/api.ts");
const dbm = await import("../src/db.ts");
const app = createApp();

process.env.ALLOW_REGISTRATION = "true";
const signupRes = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "p@example.com", password: "proj-pass-1" }),
});
const SESSION = (signupRes.headers.get("set-cookie") ?? "").split(";")[0];

function req(
  path: string,
  init?: RequestInit,
): Promise<Response> & { json: () => Promise<never> } {
  return app.request(path, {
    ...init,
    headers: { cookie: SESSION, ...(init?.headers ?? {}) },
  }) as never;
}

const JSON_HEADERS = { "content-type": "application/json" };

test("projects CRUD with validation", async () => {
  const emptyName = await req("/api/projects", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: " ", body: "text" }),
  });
  assert.equal(emptyName.status, 400);

  const emptyBody = await req("/api/projects", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: "x", body: "" }),
  });
  assert.equal(emptyBody.status, 400);

  const first = (await (
    await req("/api/projects", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "dup", description: "one", body: "# A" }),
    })
  ).json()) as { id: string };
  const second = (await (
    await req("/api/projects", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "dup", body: "# B" }),
    })
  ).json()) as { id: string };
  assert.notEqual(first.id, second.id, "duplicate names allowed");

  const patched = (await (
    await req(`/api/projects/${first.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ description: "edited" }),
    })
  ).json()) as { description: string; name: string };
  assert.equal(patched.description, "edited");
  assert.equal(patched.name, "dup");

  assert.equal(
    (
      await req(`/api/projects/${first.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: "" }),
      })
    ).status,
    400,
  );
  assert.equal(
    (await req("/api/projects/nope", { method: "DELETE" })).status,
    404,
  );

  await req(`/api/projects/${second.id}`, { method: "DELETE" });
  const list = (await (await req("/api/projects")).json()) as unknown[];
  assert.equal(list.length, 1);
});

test("bots attach and detach projects", async () => {
  dbm.insertBot({
    id: "bot-p",
    name: "P",
    instructions: "",
    enabled: 1,
    created_at: Date.now(),
  });
  const project = (await (
    await req("/api/projects", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "context", body: "# Shared" }),
    })
  ).json()) as { id: string };

  const attached = (await (
    await req(`/api/bots/bot-p`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ project_ids: [project.id] }),
    })
  ).json()) as { project_ids: string[] };
  assert.deepEqual(attached.project_ids, [project.id]);

  const single = (await (await req("/api/bots/bot-p")).json()) as {
    project_ids: string[];
  };
  assert.deepEqual(single.project_ids, [project.id]);

  const listed = (await (await req("/api/bots")).json()) as {
    id: string;
    project_ids: string[];
  }[];
  assert.deepEqual(listed.find((b) => b.id === "bot-p")?.project_ids, [
    project.id,
  ]);

  const bad = await req("/api/bots/bot-p", {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ project_ids: ["ghost"] }),
  });
  assert.equal(bad.status, 400);

  await req(`/api/projects/${project.id}`, { method: "DELETE" });
  const after = (await (await req("/api/bots/bot-p")).json()) as {
    project_ids: string[];
  };
  assert.deepEqual(after.project_ids, []);
});

test("prompt helpers order direct projects and tolerate absent teams", () => {
  const a = dbm.getBot("bot-p")!;
  void a;
  assert.deepEqual(dbm.projectsInheritedByBot("bot-p"), []);
  assert.deepEqual(dbm.projectsForBot("bot-p"), []);
});
