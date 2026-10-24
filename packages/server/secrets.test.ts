import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bot-secrets-")),
  "t.db",
);
process.env.ALLOW_REGISTRATION = "true";

const { createApp } = await import("./src/api.ts");
const app = createApp();

let SESSION = "";

async function call(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; body: any; headers: Headers }> {
  const r = await app.request(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(SESSION ? { cookie: SESSION } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: any = null;
  try {
    parsed = await r.json();
  } catch {
    parsed = null;
  }
  return { status: r.status, body: parsed, headers: r.headers };
}

// Authenticate once and reuse the session cookie for every request.
const signup = await call("/api/auth/signup", "POST", {
  email: `tester-${Date.now()}@example.com`,
  password: "test-password-123",
});
assert.equal(signup.status, 201);
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0];

// ---------------------------------------------------------------------------
// Secrets CRUD + validation
// ---------------------------------------------------------------------------
test("secret create hides value and exposes it only via /value", async () => {
  const created = await call("/api/secrets", "POST", {
    name: `openai-${Date.now()}`,
    key: "OPENAI_API_KEY",
    value: "sk-secret-value",
  });
  assert.equal(created.status, 201);
  assert.ok(created.body.id);
  // create response must NOT leak the plaintext value
  assert.notEqual(created.body.value, "sk-secret-value");

  const detail = await call(`/api/secrets/${created.body.id}`);
  assert.equal(detail.status, 200);
  assert.notEqual(detail.body.value, "sk-secret-value");

  // dedicated reveal route (lowercase /value) returns the plaintext
  const revealed = await call(`/api/secrets/${created.body.id}/value`);
  assert.equal(revealed.status, 200);
  assert.equal(revealed.body.value, "sk-secret-value");
});

test("secret rejects invalid env-var keys and missing fields", async () => {
  for (const badKey of ["1BAD", "A-B", "with space"]) {
    const r = await call("/api/secrets", "POST", {
      name: `bad-${badKey}`,
      key: badKey,
      value: "x",
    });
    assert.equal(r.status, 400, `key '${badKey}' should be rejected`);
  }

  // missing required fields (no name)
  const noName = await call("/api/secrets", "POST", {
    key: "OK_KEY",
    value: "x",
  });
  assert.equal(noName.status, 400);
});

test("secret update rotates the stored value", async () => {
  const created = await call("/api/secrets", "POST", {
    name: `rot-${Date.now()}`,
    key: "ROTATE_KEY",
    value: "first-value",
  });
  assert.equal(created.status, 201);

  const patched = await call(`/api/secrets/${created.body.id}`, "PATCH", {
    value: "second-value",
  });
  assert.equal(patched.status, 200);

  const revealed = await call(`/api/secrets/${created.body.id}/value`);
  assert.equal(revealed.status, 200);
  assert.equal(revealed.body.value, "second-value");
});

// ---------------------------------------------------------------------------
// Bot + team secret assignment and precedence
// ---------------------------------------------------------------------------
test("bot can be assigned secrets via PATCH (secret_ids)", async () => {
  const sec = await call("/api/secrets", "POST", {
    name: `bots-${Date.now()}`,
    key: "BOT_LEVEL_KEY",
    value: "bot-level",
  });
  assert.equal(sec.status, 201);

  const bot = await call("/api/bots", "POST", { name: `bot-${Date.now()}` });
  assert.equal(bot.status, 201);

  // assigning secrets does not require the bot's name
  const assigned = await call(`/api/bots/${bot.body.id}`, "PATCH", {
    secret_ids: [sec.body.id],
  });
  assert.equal(assigned.status, 200);

  const detail = await call(`/api/bots/${bot.body.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.secret_ids, [sec.body.id]);
});

test("team can be assigned secrets via PATCH (requires name)", async () => {
  const sec = await call("/api/secrets", "POST", {
    name: `teams-${Date.now()}`,
    key: "TEAM_LEVEL_KEY",
    value: "team-level",
  });
  assert.equal(sec.status, 201);

  const teamName = `team-${Date.now()}`;
  const team = await call("/api/teams", "POST", { name: teamName });
  assert.equal(team.status, 201);

  // secrets-only PATCH is rejected — a team PATCH must include the name
  const noName = await call(`/api/teams/${team.body.id}`, "PATCH", {
    secret_ids: [sec.body.id],
  });
  assert.equal(noName.status, 400);

  const assigned = await call(`/api/teams/${team.body.id}`, "PATCH", {
    name: teamName,
    secret_ids: [sec.body.id],
  });
  assert.equal(assigned.status, 200);
  assert.deepEqual(assigned.body.secret_ids, [sec.body.id]);

  // add a bot as a member of the team (inherits team secrets)
  const bot = await call("/api/bots", "POST", { name: `member-${Date.now()}` });
  assert.equal(bot.status, 201);
  const member = await call(`/api/teams/${team.body.id}/members`, "PUT", {
    bot_id: bot.body.id,
  });
  assert.equal(member.status, 200);
});
