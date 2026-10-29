import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "bots-config-backup-"));
process.env.DATA_DIR = dataDir;
process.env.DATABASE_PATH = join(dataDir, "t.db");

const { createApp } = await import("../src/api.ts");
const app = createApp();

process.env.ALLOW_REGISTRATION = "true";
let SESSION = "";
const signup = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "backup@example.com",
    password: "dev-session-1",
  }),
});
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; json: unknown }> {
  const res = await app.request(path, {
    method,
    headers: {
      cookie: SESSION,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(headers ?? {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

function object(value: unknown): Json {
  assert.ok(isRecord(value), "expected an object");
  return value;
}

function array(value: unknown): Json[] {
  assert.ok(Array.isArray(value), "expected an array");
  return value as Json[];
}

function named(rowsValue: unknown, name: string): Json {
  const found = array(rowsValue).find((row) => row.name === name);
  assert.ok(found, `${name} is missing`);
  return found;
}

function one(
  rows: Json[],
  predicate: (row: Json) => boolean,
  label: string,
): Json {
  const found = rows.find(predicate);
  assert.ok(found, `${label} is missing`);
  return found;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function secretValue(name: string): Promise<string> {
  const secrets = await req("GET", "/api/secrets");
  const row = named(secrets.json, name);
  const revealed = await req("GET", `/api/secrets/${String(row.id)}/value`);
  return String(object(revealed.json).value);
}

test("config backup exports every configured kind without secret values", async () => {
  const skillCreate = await req("POST", "/api/skills", {
    name: "backup-skill",
    description: "bundle test",
    instructions: "do the task",
  });
  assert.equal(skillCreate.status, 201);
  const skillId = String(object(skillCreate.json).id);
  mkdirSync(join(dataDir, "skills", skillId), { recursive: true });
  writeFileSync(join(dataDir, "skills", skillId, "SKILL.md"), "# original\n");
  mkdirSync(join(dataDir, "skills", skillId, "nested"), { recursive: true });
  writeFileSync(
    join(dataDir, "skills", skillId, "nested", "helper.txt"),
    "helper contents",
  );

  const mcp = await req("POST", "/api/mcp-servers", {
    name: "backup-mcp",
    command: "node server.js",
    args: ["--stdio"],
    env: { LITERAL: "plain" },
  });
  assert.equal(mcp.status, 201);

  const role = await req("POST", "/api/roles", {
    name: "backup-role",
    instructions: "use granted tools",
    mcp_server_ids: [String(object(mcp.json).id)],
    skill_ids: [skillId],
  });
  assert.equal(role.status, 201);

  const project = await req("POST", "/api/projects", {
    name: "backup-project",
    description: "shared context",
    body: "project instructions",
  });
  assert.equal(project.status, 201);

  const tag = await req("POST", "/api/tags", { name: "backup-tag" });
  assert.equal(tag.status, 201);

  const secret = await req("POST", "/api/secrets", {
    name: "Backup token",
    key: "TOKEN",
    value: "abc",
  });
  assert.equal(secret.status, 201);

  const team = await req("POST", "/api/teams", { name: "backup-team" });
  assert.equal(team.status, 201);
  const teamId = String(object(team.json).id);

  const bot = await req("POST", "/api/bots", {
    name: "backup-bot",
    instructions: "run the backup job",
    enabled: true,
    sound: "bell",
    token_budget: 5000,
    watchdog_hours: 3,
  });
  assert.equal(bot.status, 201);
  const botId = String(object(bot.json).id);

  assert.equal(
    (
      await req("PUT", `/api/teams/${teamId}/members`, {
        bot_id: botId,
        leader: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req("PATCH", `/api/teams/${teamId}`, {
        project_ids: [String(object(project.json).id)],
        secret_ids: [String(object(secret.json).id)],
      })
    ).status,
    200,
  );

  assert.equal(
    (
      await req("PATCH", `/api/bots/${botId}`, {
        role_id: String(object(role.json).id),
        tag_ids: [String(object(tag.json).id)],
        project_ids: [String(object(project.json).id)],
        secret_ids: [String(object(secret.json).id)],
      })
    ).status,
    200,
  );

  const template = await req("POST", "/api/templates", {
    name: "backup-template",
    description: "template test",
    instructions: "template body",
    role_id: String(object(role.json).id),
    triggers: [{ message: "ping", schedule: "@every 5m" }],
  });
  assert.equal(template.status, 201);

  const key = await req("POST", "/api/api-keys", { name: "backup-key" });
  assert.equal(key.status, 201);
  assert.match(String(object(key.json).value), /^bots_[0-9a-f]{40}$/);

  const exported = await req("GET", "/api/backup/config");
  assert.equal(exported.status, 200);
  const snapshot = object(exported.json);
  assert.equal(snapshot.version, 1);

  const botEntry = named(snapshot.bots, "backup-bot");
  assert.deepEqual(botEntry.tag_names, ["backup-tag"]);
  assert.deepEqual(botEntry.project_names, ["backup-project"]);
  assert.deepEqual(botEntry.secret_names, ["Backup token"]);
  assert.deepEqual(botEntry.teams, [{ name: "backup-team", leader: true }]);
  assert.equal(botEntry.role_name, "backup-role");

  const roleEntry = named(snapshot.roles, "backup-role");
  assert.deepEqual(roleEntry.mcp_server_names, ["backup-mcp"]);
  assert.deepEqual(roleEntry.skill_names, ["backup-skill"]);

  const skillEntry = named(snapshot.skills, "backup-skill");
  assert.deepEqual(
    array(skillEntry.files).map((file) => file.path),
    ["nested/helper.txt", "SKILL.md"],
  );

  const mcpEntry = named(snapshot.mcp_servers, "backup-mcp");
  assert.deepEqual(mcpEntry.env, { LITERAL: "plain" });

  const teamEntry = named(snapshot.teams, "backup-team");
  assert.deepEqual(teamEntry.project_names, ["backup-project"]);
  assert.deepEqual(teamEntry.secret_names, ["Backup token"]);

  const templateEntry = named(snapshot.templates, "backup-template");
  assert.equal(templateEntry.role_name, "backup-role");
  assert.deepEqual(templateEntry.triggers, [
    { message: "ping", schedule: "@every 5m" },
  ]);

  const secretEntry = named(snapshot.secrets, "Backup token");
  assert.equal(secretEntry.key, "TOKEN");
  assert.equal("value" in secretEntry, false);

  const keyEntry = named(snapshot.api_keys, "backup-key");
  assert.match(String(keyEntry.hash), /^[0-9a-f]{64}$/);

  const included = object(
    (await req("GET", "/api/backup/config?include_values=true")).json,
  );
  assert.equal(named(included.secrets, "Backup token").value, "abc");

  process.env.BACKUP_TEST_SNAPSHOT = JSON.stringify(snapshot);
});

test("config restore updates by name and restores bundle contents atomically", async () => {
  const snapshot = object(JSON.parse(process.env.BACKUP_TEST_SNAPSHOT ?? "{}"));
  const teamRow = one(
    array((await req("GET", "/api/teams")).json),
    (team) => team.name === "backup-team",
    "backup-team",
  );
  const botRow = named((await req("GET", "/api/bots")).json, "backup-bot");

  assert.equal(
    (
      await req(
        "DELETE",
        `/api/teams/${String(teamRow.id)}/members/${String(botRow.id)}`,
      )
    ).status,
    200,
  );

  const restored = await req("POST", "/api/backup/config", snapshot);
  assert.equal(restored.status, 200);
  const result = object(restored.json);
  const report = object(result.report);
  for (const kind of [
    "bots",
    "roles",
    "skills",
    "mcp_servers",
    "projects",
    "tags",
    "teams",
    "templates",
    "secrets",
    "api_keys",
  ]) {
    const counts = object(report[kind]);
    assert.equal(counts.created, 0, `${kind} created`);
    assert.equal(counts.updated, 1, `${kind} updated`);
  }

  const teamsAfter = one(
    array((await req("GET", "/api/teams")).json),
    (team) => team.name === "backup-team",
    "backup-team after restore",
  );
  assert.ok(
    array(teamsAfter.members).some((member) => member.name === "backup-bot"),
  );

  const modified = clone(snapshot);
  const skillEntry = named(modified.skills, "backup-skill");
  const bundleFile = one(
    array(skillEntry.files),
    (file) => file.path === "SKILL.md",
    "SKILL.md bundle file",
  );
  bundleFile.data = Buffer.from("# updated\n").toString("base64");
  assert.equal((await req("POST", "/api/backup/config", modified)).status, 200);

  const skillRow = named(
    (await req("GET", "/api/skills")).json,
    "backup-skill",
  );
  assert.equal(
    readFileSync(
      join(dataDir, "skills", String(skillRow.id), "SKILL.md"),
      "utf8",
    ),
    "# updated\n",
  );
});

test("secret values are preserved when omitted and replaced only when included", async () => {
  const snapshot = object(JSON.parse(process.env.BACKUP_TEST_SNAPSHOT ?? "{}"));
  const preserve = clone(snapshot);
  named(preserve.secrets, "Backup token").key = "TOKEN2";
  assert.equal((await req("POST", "/api/backup/config", preserve)).status, 200);
  assert.equal(await secretValue("Backup token"), "abc");

  const included = object(
    (await req("GET", "/api/backup/config?include_values=true")).json,
  );
  named(included.secrets, "Backup token").value = "restored-secret";
  assert.equal((await req("POST", "/api/backup/config", included)).status, 200);
  assert.equal(await secretValue("Backup token"), "restored-secret");
});

test("config restore validates the whole file before applying it", async () => {
  const snapshot = object(JSON.parse(process.env.BACKUP_TEST_SNAPSHOT ?? "{}"));
  const invalid = clone(snapshot);
  array(invalid.bots).push({
    name: "invalid-restore-bot",
    project_names: ["ghost-project"],
  });

  const rejected = await req("POST", "/api/backup/config", invalid);
  assert.equal(rejected.status, 400);
  assert.match(String(object(rejected.json).error), /unknown projects/);
  const bots = array((await req("GET", "/api/bots")).json);
  assert.equal(
    bots.some((bot) => bot.name === "invalid-restore-bot"),
    false,
  );
});

test("new secrets require values and generated API keys are returned once", async () => {
  const missing = {
    version: 1,
    secrets: [{ name: "Required restore token", key: "REQUIRED_TOKEN" }],
  };
  const rejected = await req("POST", "/api/backup/config", missing);
  assert.equal(rejected.status, 400);
  assert.deepEqual(object(rejected.json).missing_secret_names, [
    "Required restore token",
  ]);

  const supplied = {
    config: missing,
    secret_values: { "Required restore token": "shh" },
  };
  const imported = await req("POST", "/api/backup/config", supplied);
  assert.equal(imported.status, 200);
  assert.equal(await secretValue("Required restore token"), "shh");

  const generated = {
    version: 1,
    api_keys: [{ name: "Generated restore key" }],
  };
  const created = object(
    (await req("POST", "/api/backup/config", generated)).json,
  );
  const values = object(created.api_key_values);
  const rawGenerated = String(values["Generated restore key"]);
  assert.match(rawGenerated, /^bots_[0-9a-f]{40}$/);

  const authed = await app.request("/api/bots", {
    headers: { authorization: `Bearer ${rawGenerated}` },
  });
  assert.equal(authed.status, 200);
});

test("config backup routes reject API-key authentication", async () => {
  const keyCreate = await req("POST", "/api/api-keys", {
    name: "route-test-key",
  });
  assert.equal(keyCreate.status, 201);
  const rawKey = String(object(keyCreate.json).value);

  for (const [method, path] of [
    ["GET", "/api/backup/config"],
    ["POST", "/api/backup/config"],
  ] as const) {
    const res = await app.request(path, {
      method,
      headers: { authorization: `Bearer ${rawKey}` },
    });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
      error: "session authentication required",
    });
  }
});

test("config backup preserves the archived flag", async () => {
  const created = await req("POST", "/api/bots", {
    name: "backup-archive-bot",
    enabled: true,
  });
  assert.equal(created.status, 201);
  const botId = String(object(created.json).id);

  assert.equal((await req("POST", `/api/bots/${botId}/archive`)).status, 200);

  let exported = object((await req("GET", "/api/backup/config")).json);
  assert.equal(named(exported.bots, "backup-archive-bot").archived, true);
  const hidden = array((await req("GET", "/api/bots")).json);
  assert.equal(
    hidden.some((bot) => bot.name === "backup-archive-bot"),
    false,
  );

  assert.equal(
    (
      await req("POST", "/api/backup/config", {
        version: 1,
        bots: [{ name: "backup-archive-bot", enabled: true, archived: false }],
      })
    ).status,
    200,
  );
  const restored = named(
    (await req("GET", "/api/bots")).json,
    "backup-archive-bot",
  );
  assert.equal(Number(restored.archived), 0);

  assert.equal(
    (
      await req("POST", "/api/backup/config", {
        version: 1,
        bots: [{ name: "backup-archive-bot", enabled: true, archived: true }],
      })
    ).status,
    200,
  );
  exported = object((await req("GET", "/api/backup/config")).json);
  assert.equal(named(exported.bots, "backup-archive-bot").archived, true);
});
