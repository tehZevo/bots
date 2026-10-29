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
const {
  appendMessages,
  insertRun,
  latestErrorBotIds,
  setSetting,
  supersedeInterruptedRuns,
} = await import("../src/db.ts");
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
  body: JSON.stringify({ email: "api@example.com", password: "dev-session-1" }),
});
const signupCookie = signup.headers.get("set-cookie") ?? "";
SESSION = signupCookie.split(";")[0] ?? "";

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await authedRequest(path, {
    method,
    headers: {
      cookie: SESSION,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
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

test("bot avatar overrides validate and persist", async () => {
  const id = await makeBot("avatar-bot");
  assert.equal(
    (await req("PATCH", `/api/bots/${id}`, { avatar_shape: 99 })).status,
    400,
  );
  assert.equal(
    (await req("PATCH", `/api/bots/${id}`, { avatar_color: -3 })).status,
    400,
  );
  const ok = await req("PATCH", `/api/bots/${id}`, {
    avatar_shape: 3,
    avatar_color: 7,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.avatar_shape, 3);
  assert.equal(ok.json.avatar_color, 7);
  const reset = await req("PATCH", `/api/bots/${id}`, {
    avatar_shape: null,
    avatar_color: null,
  });
  assert.equal(reset.json.avatar_shape, null);
  assert.equal(reset.json.avatar_color, null);
});

test("bot sound choice validates and persists", async () => {
  const id = await makeBot("sound-bot");
  assert.equal(
    (await req("PATCH", `/api/bots/${id}`, { sound: "didgeridoo" })).status,
    400,
  );
  const ok = await req("PATCH", `/api/bots/${id}`, { sound: "bell" });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.sound, "bell");
  const reset = await req("PATCH", `/api/bots/${id}`, { sound: "" });
  assert.equal(reset.json.sound, null);
});

test("GET /api/bots includes the assigned role name", async () => {
  const role = await req("POST", "/api/roles", {
    name: "card-role",
    instructions: "be terse",
  });
  assert.equal(role.status, 201);
  const withRole = await makeBot("role-name-bot");
  assert.equal(
    (
      await req("PATCH", `/api/bots/${withRole}`, {
        role_id: role.json.id as string,
      })
    ).status,
    200,
  );
  const plain = await makeBot("roleless-bot");
  const list = await req("GET", "/api/bots");
  assert.equal(list.status, 200);
  const bots = list.json as { id: string; role_name?: string | null }[];
  assert.equal(bots.find((b) => b.id === withRole)?.role_name, "card-role");
  assert.equal(bots.find((b) => b.id === plain)?.role_name, null);
});

test("tags CRUD, counts and bot assignment", async () => {
  assert.equal((await req("POST", "/api/tags", {})).status, 400);
  const a = await req("POST", "/api/tags", { name: "prod" });
  assert.equal(a.status, 201);
  assert.equal((await req("POST", "/api/tags", { name: "PROD" })).status, 400);
  const b = await req("POST", "/api/tags", { name: "experimental" });
  assert.equal(b.status, 201);

  const id = await makeBot("tagged-bot");
  assert.equal(
    (await req("PATCH", `/api/bots/${id}`, { tag_ids: ["ghost"] })).status,
    400,
  );
  const p = await req("PATCH", `/api/bots/${id}`, {
    tag_ids: [a.json.id as string],
  });
  assert.equal(p.status, 200);
  assert.deepEqual(p.json.tag_ids, [a.json.id]);

  const list = await req("GET", "/api/tags");
  const rows = list.json as { id: string; name: string; bot_count: number }[];
  assert.equal(rows.find((t) => t.id === a.json.id)?.bot_count, 1);
  assert.equal(rows.find((t) => t.id === b.json.id)?.bot_count, 0);
  const bots = (await req("GET", "/api/bots")).json as {
    id: string;
    tag_ids?: string[];
  }[];
  assert.deepEqual(bots.find((x) => x.id === id)?.tag_ids, [a.json.id]);

  const renamed = await req("PATCH", `/api/tags/${b.json.id}`, {
    name: "experiments",
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.name, "experiments");

  const del = await req("DELETE", `/api/tags/${a.json.id}`);
  assert.equal(del.status, 200);
  assert.equal((await req("GET", `/api/bots/${id}`)).json.tag_ids.length, 0);
  assert.equal(
    (await req("PATCH", `/api/tags/${a.json.id}`, { name: "x" })).status,
    404,
  );
});

test("bot get/patch/delete lifecycle", async () => {
  const id = await makeBot("lifecycle-bot");
  assert.equal((await req("GET", `/api/bots/${id}`)).status, 200);
  assert.equal((await req("GET", "/api/bots/nope")).status, 404);
  const p = await req("PATCH", `/api/bots/${id}`, {
    name: "renamed",
    instructions: "sp",
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

test("mcp env secret references are validated and export-safe", async () => {
  const secret = await req("POST", "/api/secrets", {
    name: "MCP ref token",
    key: "MCP_REF_TOKEN",
    value: "topsecretvalue123",
  });
  assert.equal(secret.status, 201);

  assert.equal(
    (
      await req("POST", "/api/mcp-servers", {
        name: "mcp-secret-ref",
        command: "node b.js",
        env: { TOKEN: { secret: "missing" } },
      })
    ).status,
    400,
  );

  const created = await req("POST", "/api/mcp-servers", {
    name: "mcp-secret-ref",
    command: "node b.js",
    env: { TOKEN: { secret: "MCP ref token" }, LITERAL: "plain" },
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.json.env, {
    TOKEN: { secret: "MCP ref token" },
    LITERAL: "plain",
  });
  assert.ok(!JSON.stringify(created.json).includes("topsecretvalue123"));

  await req("DELETE", `/api/secrets/${secret.json.id}`);
  const stale = await req("PATCH", `/api/mcp-servers/${created.json.id}`, {
    command: "node c.js",
  });
  assert.equal(stale.status, 400);
  assert.match(String(stale.json.error), /unknown secret "MCP ref token"/);

  const recreated = await req("POST", "/api/secrets", {
    name: "MCP ref token",
    key: "MCP_REF_TOKEN_2",
    value: "topsecretvalue456",
  });
  assert.equal(recreated.status, 201);
  const repointed = await req("PATCH", `/api/mcp-servers/${created.json.id}`, {
    env: { TOKEN: { secret: "MCP ref token" }, LITERAL: "plain" },
  });
  assert.equal(repointed.status, 200);
  assert.deepEqual(repointed.json.env, {
    TOKEN: { secret: "MCP ref token" },
    LITERAL: "plain",
  });
  assert.ok(!JSON.stringify(repointed.json).includes("topsecretvalue456"));

  await req("DELETE", `/api/mcp-servers/${created.json.id}`);
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
  const listRes = await authedRequest(`/api/bots/${bot}/triggers`);
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

test("templates CRUD with validation", async () => {
  assert.equal((await req("POST", "/api/templates", {})).status, 400);
  const created = await req("POST", "/api/templates", {
    name: "Nightly",
    description: "night sweep",
    instructions: "be brief",
    triggers: [{ message: "run the sweep", schedule: "@every 30m" }],
  });
  assert.equal(created.status, 201);
  const id = created.json.id as string;
  assert.deepEqual((created.json.triggers as unknown[]).length, 1);
  assert.equal(
    (await req("POST", "/api/templates", { name: "Nightly" })).status,
    409,
  );
  assert.equal(
    (
      await req("POST", "/api/templates", {
        name: "Bad",
        triggers: [{ message: "x", schedule: "nope" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await req("POST", "/api/templates", { name: "Bad", role_id: "zzz" }))
      .status,
    400,
  );
  const patched = await req("PATCH", `/api/templates/${id}`, {
    instructions: "be terse",
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.instructions, "be terse");
  assert.equal(patched.json.description, "night sweep");
  assert.equal(
    (await req("PATCH", "/api/templates/zzz", { name: "x" })).status,
    404,
  );
  const list = (await (
    await authedRequest("/api/templates")
  ).json()) as unknown[];
  assert.ok(Array.isArray(list) && list.length === 1);
  assert.equal((await req("DELETE", `/api/templates/${id}`)).status, 200);
  assert.equal((await req("DELETE", `/api/templates/${id}`)).status, 404);
});

test("bot watchdog hours validate and persist", async () => {
  const created = await req("POST", "/api/bots", {
    name: "watchdog-settings",
    watchdog_hours: 24,
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.watchdog_hours, 24);

  for (const value of [721, 0, 5.5, "5"]) {
    const res = await req("PATCH", `/api/bots/${created.json.id}`, {
      watchdog_hours: value,
    });
    assert.equal(res.status, 400);
  }

  const cleared = await req("PATCH", `/api/bots/${created.json.id}`, {
    watchdog_hours: null,
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.watchdog_hours, null);
});

test("control mcp over json-rpc with api key auth", async () => {
  const created = await req("POST", "/api/api-keys", { name: "mcp" });
  const value = created.json.value as string;
  const post = (body: unknown, auth = true) =>
    app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: `Bearer ${value}` } : {}),
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await post({ jsonrpc: "2.0", method: "ping" }, false)).status,
    401,
  );

  const unknownKey = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer bots_${"0".repeat(40)}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "ping" }),
  });
  assert.equal(unknownKey.status, 401);

  const init = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26" },
  });
  assert.equal(init.status, 200);
  const initBody = (await init.json()) as { result: Record<string, unknown> };
  assert.equal(initBody.result.protocolVersion, "2025-03-26");

  const tools = (await (
    await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })
  ).json()) as { result: { tools: { name: string }[] } };
  assert.ok(tools.result.tools.some((t) => t.name === "bots_list"));

  const call = (await (
    await post({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "bots_list", arguments: {} },
    })
  ).json()) as { result: { isError: boolean; content: { text: string }[] } };
  assert.equal(call.result.isError, false);
  assert.ok(Array.isArray(JSON.parse(call.result.content[0].text)));

  const badTool = (await (
    await post({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "nope", arguments: {} },
    })
  ).json()) as { error?: unknown };
  assert.ok(badTool.error);

  const off = await req("PUT", "/api/settings", {
    control_mcp_enabled: false,
  });
  assert.equal(off.status, 200);
  assert.equal(
    (await post({ jsonrpc: "2.0", id: 5, method: "ping" })).status,
    404,
  );
  await req("PUT", "/api/settings", { control_mcp_enabled: true });
});

test("openapi.json documents the API", async () => {
  const res = await authedRequest("/api/openapi.json");
  assert.equal(res.status, 200);
  const doc = (await res.json()) as Record<string, unknown>;
  assert.equal(doc.openapi, "3.1.0");
  const paths = doc.paths as Record<string, unknown>;
  assert.ok("/api/bots" in paths && "/api/api-keys" in paths);
});

test("api keys: create, list, bearer auth, revoke", async () => {
  assert.equal((await req("POST", "/api/api-keys", {})).status, 400);
  const created = await req("POST", "/api/api-keys", { name: "cli" });
  assert.equal(created.status, 201);
  const value = created.json.value as string;
  const id = created.json.id as string;
  assert.match(value, /^bots_[0-9a-f]{40}$/);
  const listRes = await authedRequest("/api/api-keys");
  const keys = (await listRes.json()) as Record<string, unknown>[];
  assert.ok(keys.some((k) => k.name === "cli" && k.value === undefined));
  const authed = await authedRequest("/api/bots", {
    headers: { authorization: `Bearer ${value}` },
  });
  assert.equal(authed.status, 200);
  const bad = await authedRequest("/api/bots", {
    headers: {
      authorization: "Bearer bots_0000000000000000000000000000000000000000",
    },
  });
  assert.equal(bad.status, 401);

  const keyManagement = async (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        authorization: `Bearer ${value}`,
        cookie: "",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  for (const [method, path, body] of [
    ["GET", "/api/api-keys"],
    ["POST", "/api/api-keys", { name: "stolen-persistence" }],
    ["DELETE", `/api/api-keys/${id}`],
  ] as const) {
    const denied = await keyManagement(method, path, body);
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), {
      error: "session authentication required",
    });
  }

  assert.equal((await req("DELETE", `/api/api-keys/${id}`)).status, 200);
  assert.equal(
    (
      await authedRequest("/api/bots", {
        headers: { authorization: `Bearer ${value}` },
      })
    ).status,
    401,
  );
  assert.equal((await req("DELETE", "/api/api-keys/nope")).status, 404);
});

test("runs and message endpoints on a fresh bot", async () => {
  const bot = await makeBot("quiet-bot");
  const runsRes = await authedRequest(`/api/bots/${bot}/runs`);
  assert.deepEqual(await runsRes.json(), []);
  const msgsRes = await authedRequest(`/api/bots/${bot}/messages`);
  assert.ok(Array.isArray(await msgsRes.json()));
  assert.equal((await req("DELETE", `/api/bots/${bot}/messages`)).status, 200);
});

test("trigger names: optional, validated, editable", async () => {
  const bot = await makeBot("named-triggers");
  const created = await req("POST", `/api/bots/${bot}/triggers`, {
    message: "sweep",
    schedule: "@every 1h",
    name: "nightly sweep",
  });
  assert.equal(created.status, 201);
  const id = created.json.id as string;
  assert.equal(created.json.name, "nightly sweep");

  const plain = await req("POST", `/api/bots/${bot}/triggers`, {
    message: "m",
    schedule: "@every 2h",
  });
  assert.equal(plain.status, 201);
  assert.equal(plain.json.name, null);

  const patched = await req("PATCH", `/api/triggers/${id}`, {
    name: "renamed",
  });
  assert.equal(patched.json.name, "renamed");
  const cleared = await req("PATCH", `/api/triggers/${id}`, { name: null });
  assert.equal(cleared.json.name, null);

  assert.equal(
    (
      await req("POST", `/api/bots/${bot}/triggers`, {
        message: "m",
        schedule: "@every 1h",
        name: "x".repeat(121),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req("POST", `/api/bots/${bot}/triggers`, {
        message: "m",
        schedule: "@every 1h",
        name: 7,
      })
    ).status,
    400,
  );

  const list = await (await authedRequest(`/api/bots/${bot}/triggers`)).json();
  assert.ok(Array.isArray(list) && list.every((t) => "name" in t));
});

test("accepting new work un-interrupts a bot", async () => {
  setSetting("default_provider_id", "p1");
  setSetting("default_model", "m1");
  const bot = await makeBot("resumable");
  insertRun({
    id: "r1",
    bot_id: bot,
    status: "error",
    trigger: "chat",
    started_at: 1000,
    finished_at: 2000,
    output: null,
    error: "interrupted",
  });
  assert.ok(latestErrorBotIds().has(bot));

  const red = (
    (await (await authedRequest("/api/bots")).json()) as {
      id: string;
      health: string;
    }[]
  ).find((b) => b.id === bot);
  assert.equal(red?.health, "red");

  supersedeInterruptedRuns(bot);
  assert.ok(!latestErrorBotIds().has(bot));
  const blue = (
    (await (await authedRequest("/api/bots")).json()) as {
      id: string;
      health: string;
    }[]
  ).find((b) => b.id === bot);
  assert.equal(blue?.health, "blue");
});

test("chat turns expose thinking and tool calls with results", async () => {
  const id = await makeBot("chatty");
  appendMessages(id, null, [
    { role: "user", payload: { content: "[chat 2026-10-19]\nhi" } },
    {
      role: "assistant",
      payload: {
        content: [
          { type: "thinking", thinking: "let me check" },
          {
            type: "toolCall",
            id: "c1",
            name: "shell",
            arguments: { cmd: "ls" },
          },
          { type: "text", text: "**done**" },
        ],
      },
    },
    {
      role: "toolResult",
      payload: {
        role: "toolResult",
        toolCallId: "c1",
        toolName: "shell",
        content: [{ type: "text", text: "files" }],
        isError: false,
      },
    },
  ]);
  const res = await req("GET", `/api/bots/${id}/messages`);
  assert.equal(res.status, 200);
  const turns = res.json as {
    role: string;
    text: string;
    thinking?: string;
    tool_calls?: { name: string; input: unknown; output?: string }[];
  }[];
  assert.deepEqual(
    turns.map((t) => t.role),
    ["user", "assistant"],
  );
  assert.equal(turns[0].text, "hi");
  assert.equal(turns[1].thinking, "let me check");
  assert.equal(turns[1].tool_calls?.[0]?.name, "shell");
  assert.deepEqual(turns[1].tool_calls?.[0]?.input, { cmd: "ls" });
  assert.equal(turns[1].tool_calls?.[0]?.output, "files");
});

test("trigger-injected turns are flagged with their source", async () => {
  const id = await makeBot("tickbot");
  appendMessages(id, null, [
    {
      role: "user",
      payload: { content: "[schedule 2026-10-19T00:00:00Z]\nrun the thing" },
    },
    {
      role: "user",
      payload: { content: "[manual 2026-10-19T00:01:00Z]\nby hand" },
    },
    {
      role: "user",
      payload: { content: "[webhook 2026-10-19T00:02:00Z]\nevent body" },
    },
    {
      role: "user",
      payload: { content: "[chat 2026-10-19T00:03:00Z]\nhello from chat" },
    },
  ]);
  const res = await req("GET", `/api/bots/${id}/messages`);
  assert.equal(res.status, 200);
  const turns = res.json as {
    role: string;
    text: string;
    injected?: boolean;
    source?: string;
  }[];
  assert.deepEqual(
    turns.map((t) => [t.text, t.injected ?? false, t.source ?? null]),
    [
      ["run the thing", true, "schedule"],
      ["by hand", true, "manual"],
      ["event body", true, "webhook"],
      ["hello from chat", false, null],
    ],
  );
});

test("POST /api/stop-all interrupts nothing and arms the pause", async () => {
  const res = await authedRequest("/api/stop-all", { method: "POST" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { stopped: 0 });
  const p = await authedRequest("/api/pause");
  assert.equal((await p.json()).paused, true);
  await authedRequest("/api/pause", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paused: false }),
  });
});

test("POST /api/stop-all requires auth", async () => {
  const res = await app.request("/api/stop-all", { method: "POST" });
  assert.equal(res.status, 401);
});
