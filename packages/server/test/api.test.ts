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

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await app.request(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

async function makeBot(name = "api-bot") {
  const { json } = await req("POST", "/api/bots", { name });
  return json.id as string;
}

test("health and settings respond", async () => {
  assert.equal((await req("GET", "/api/health")).json.ok, true);
  const s = await req("GET", "/api/settings");
  assert.equal(s.status, 200);
});

test("bot create validates name", async () => {
  assert.equal((await req("POST", "/api/bots", {})).status, 400);
  assert.equal((await req("POST", "/api/bots", { name: "  " })).status, 400);
});

test("bot get/patch/delete lifecycle", async () => {
  const id = await makeBot("lifecycle-bot");
  assert.equal((await req("GET", `/api/bots/${id}`)).status, 200);
  assert.equal((await req("GET", "/api/bots/nope")).status, 404);
  const p = await req("PATCH", `/api/bots/${id}`, {
    name: "renamed",
    description: "d",
    system_prompt: "sp",
    enabled: false,
  });
  assert.equal(p.status, 200);
  assert.equal(p.json.name, "renamed");
  assert.equal(p.json.enabled, 0);
  const gone = await req("DELETE", `/api/bots/${id}`);
  assert.equal(gone.status, 200);
  assert.equal((await req("GET", `/api/bots/${id}`)).status, 404);
});

test("bot patch rejects unknown role and machine", async () => {
  const id = await makeBot("grant-bot");
  assert.equal(
    (await req("PATCH", `/api/bots/${id}`, { role_id: "nope" })).status,
    400,
  );
  assert.equal(
    (await req("PATCH", `/api/bots/${id}`, { machine_id: "nope" })).status,
    400,
  );
});

test("roles CRUD with grants and validation", async () => {
  const skill = (
    await req("POST", "/api/skills", { name: "sk1", instructions: "do it" })
  ).json.id as string;
  const mcp = (
    await req("POST", "/api/mcp-servers", {
      name: "mcp1",
      command: "node a.js",
    })
  ).json.id as string;
  assert.equal((await req("POST", "/api/roles", {})).status, 400);
  assert.equal(
    (await req("POST", "/api/roles", { name: "r1", instructions: "" })).status,
    400,
  );
  const r = await req("POST", "/api/roles", {
    name: "r1",
    instructions: "be good",
    skill_ids: [skill],
    mcp_server_ids: [mcp],
  });
  assert.equal(r.status, 201);
  const id = r.json.id as string;
  assert.deepEqual(r.json.skill_ids, [skill]);
  assert.equal((await req("GET", `/api/roles/${id}`)).status, 200);
  assert.equal((await req("GET", "/api/roles/nope")).status, 404);
  const bad = await req("POST", "/api/roles", {
    name: "r2",
    instructions: "x",
    skill_ids: ["ghost"],
  });
  assert.equal(bad.status, 400);
  const p = await req("PATCH", `/api/roles/${id}`, {
    name: "r1b",
    instructions: "be better",
    skill_ids: [],
    mcp_server_ids: [],
  });
  assert.equal(p.json.name, "r1b");
  assert.equal((await req("DELETE", `/api/roles/${id}`)).status, 200);
  assert.equal((await req("DELETE", "/api/roles/nope")).status, 404);
});

test("skills CRUD and validation", async () => {
  assert.equal(
    (await req("POST", "/api/skills", { name: "no-inst" })).status,
    400,
  );
  const r = await req("POST", "/api/skills", {
    name: "sk-crud",
    instructions: "i1",
  });
  assert.equal(r.status, 201);
  const id = r.json.id as string;
  const p = await req("PATCH", `/api/skills/${id}`, { instructions: "new" });
  assert.equal(p.json.instructions, "new");
  assert.equal((await req("PATCH", "/api/skills/nope", {})).status, 404);
  assert.equal((await req("DELETE", `/api/skills/${id}`)).status, 200);
  assert.equal((await req("DELETE", "/api/skills/nope")).status, 404);
});

test("mcp servers CRUD and validation", async () => {
  assert.equal((await req("POST", "/api/mcp-servers", {})).status, 400);
  const r = await req("POST", "/api/mcp-servers", {
    name: "m2",
    command: "node b.js",
    args: ["--x"],
    env: { A: "b" },
  });
  assert.equal(r.status, 201);
  const id = r.json.id as string;
  const p = await req("PATCH", `/api/mcp-servers/${id}`, {
    name: "m2b",
    command: "node c.js",
  });
  assert.equal(p.json.name, "m2b");
  assert.equal((await req("PATCH", "/api/mcp-servers/nope", {})).status, 404);
  assert.equal((await req("DELETE", `/api/mcp-servers/${id}`)).status, 200);
  assert.equal((await req("DELETE", "/api/mcp-servers/nope")).status, 404);
});

test("machines CRUD with name clash and in-use guard", async () => {
  const r = await req("POST", "/api/machines", {
    name: "mac1",
    dockerfile: "FROM scratch",
  });
  assert.equal(r.status, 201);
  const id = r.json.id as string;
  assert.equal(
    (await req("POST", "/api/machines", { name: "mac1", dockerfile: "x" }))
      .status,
    400,
  );
  assert.equal((await req("PATCH", `/api/machines/${id}`, {})).status, 200);
  const p = await req("PATCH", `/api/machines/${id}`, {
    name: "mac1b",
    dockerfile: "FROM alpine",
  });
  assert.equal(p.json.name, "mac1b");
  assert.equal((await req("PATCH", "/api/machines/nope", {})).status, 404);

  const bot = await makeBot("machine-user");
  const assign = await req("PATCH", `/api/bots/${bot}`, { machine_id: id });
  assert.equal(assign.status, 200);
  const busy = await req("DELETE", `/api/machines/${id}`);
  assert.equal(busy.status, 409);
  await req("PATCH", `/api/bots/${bot}`, { machine_id: null });
  assert.equal((await req("DELETE", `/api/machines/${id}`)).status, 200);
  assert.equal((await req("DELETE", "/api/machines/nope")).status, 404);
});

test("trigger CRUD via nested create and patches", async () => {
  const bot = await makeBot("trig-bot");
  assert.equal(
    (await req("POST", `/api/bots/${bot}/triggers`, { message: "" })).status,
    400,
  );
  const t = await req("POST", `/api/bots/${bot}/triggers`, {
    message: "ping",
    schedule: "@every 1h",
  });
  assert.equal(t.status, 201);
  const id = t.json.id as string;
  assert.ok(t.json.next_run_at);
  const listRes = await app.request(`/api/bots/${bot}/triggers`);
  assert.equal((await listRes.json()).length, 1);
  const p = await req("PATCH", `/api/triggers/${id}`, {
    message: "pong",
    schedule: "@every 2h",
    enabled: false,
  });
  assert.equal(p.json.message, "pong");
  assert.equal(p.json.enabled, 0);
  assert.equal(
    (await req("POST", `/api/triggers/${id}/rotate-secret`, {})).status,
    400,
  );
  assert.equal((await req("PATCH", "/api/triggers/nope", {})).status, 404);
  assert.equal((await req("DELETE", `/api/triggers/${id}`)).status, 200);
  assert.equal((await req("DELETE", "/api/triggers/nope")).status, 404);
});

test("notifications list, validation, read flows", async () => {
  const l = await req("GET", "/api/notifications");
  assert.ok(Array.isArray(l.json.items));
  assert.equal((await req("GET", "/api/notifications?limit=abc")).status, 400);
  assert.equal(
    (await req("POST", "/api/notifications/read-all", {})).status,
    200,
  );
  assert.equal(
    (await req("POST", "/api/notifications/nope/read", {})).status,
    404,
  );
});

test("providers create/update/delete with key masking", async () => {
  assert.equal((await req("GET", "/api/providers")).status, 200);
  assert.equal((await req("POST", "/api/providers", {})).status, 400);
  assert.equal(
    (
      await req("POST", "/api/providers", {
        name: "x",
        base_url: "http://example.com/v1",
        models: "not-a-list",
      })
    ).status,
    400,
  );
  const p = await req("POST", "/api/providers", {
    name: "p1",
    base_url: "http://example.com/v1",
    api_key: "secret",
    models: ["m1", " ", "m1"],
  });
  assert.equal(p.status, 201);
  assert.equal(p.json.has_key, true);
  assert.equal(p.json.api_key, undefined);
  const id = p.json.id as string;
  const u = await req("PUT", `/api/providers/${id}`, {
    name: "p1b",
    base_url: "http://example.com/v2",
  });
  assert.equal(u.status, 200);
  assert.equal((await req("PUT", "/api/providers/nope", {})).status, 404);
  assert.equal((await req("DELETE", `/api/providers/${id}`)).status, 200);
  assert.equal((await req("DELETE", "/api/providers/nope")).status, 404);
});

test("runs and message endpoints on a fresh bot", async () => {
  const bot = await makeBot("quiet-bot");
  const runsRes = await app.request(`/api/bots/${bot}/runs`);
  assert.deepEqual(await runsRes.json(), []);
  const msgsRes = await app.request(`/api/bots/${bot}/messages`);
  assert.ok(Array.isArray(await msgsRes.json()));
  assert.equal((await req("DELETE", `/api/bots/${bot}/messages`)).status, 200);
});
