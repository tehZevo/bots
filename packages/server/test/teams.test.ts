import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-teams-")),
  "t.db",
);

const { createApp } = await import("../src/api.ts");
const dbm = await import("../src/db.ts");
const { deliverDm, effectiveSystemPrompt, isLoopActive } = await import(
  "../src/agent.ts"
);
const { buildTools } = await import("../src/tools.ts");
const app = createApp();

process.env.ALLOW_REGISTRATION = "true";
const signupRes = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "t@example.com", password: "team-pass-1" }),
});
const SESSION = (signupRes.headers.get("set-cookie") ?? "").split(";")[0];
function authedRequest(path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: { cookie: SESSION, ...(init?.headers ?? {}) },
  });
}

function makeBot(id: string, name: string): void {
  dbm.insertBot({
    id,
    name,
    instructions: "",
    enabled: 1,
    created_at: Date.now(),
  });
}

test("teams CRUD and membership via API", async () => {
  makeBot("bot-a", "A");
  makeBot("bot-b", "B");

  const created = await authedRequest("/api/teams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "ops" }),
  });
  assert.equal(created.status, 201);
  const team = (await created.json()) as { id: string; members: unknown[] };
  assert.deepEqual(team.members, []);

  assert.equal(
    (
      await authedRequest("/api/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "  " }),
      })
    ).status,
    400,
  );

  const bad = await authedRequest(`/api/teams/${team.id}/members`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bot_id: "nope" }),
  });
  assert.equal(bad.status, 400);

  await authedRequest(`/api/teams/${team.id}/members`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bot_id: "bot-a", leader: true }),
  });
  await authedRequest(`/api/teams/${team.id}/members`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bot_id: "bot-b" }),
  });

  const renamed = await authedRequest(`/api/teams/${team.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "ops-2" }),
  });
  assert.equal(renamed.status, 200);

  const teams = (await (await authedRequest("/api/teams")).json()) as {
    id: string;
    name: string;
    members: { bot_id: string; name: string; leader: boolean }[];
  }[];
  assert.equal(teams.length, 1);
  assert.equal(teams[0].name, "ops-2");
  assert.deepEqual(
    teams[0].members.map((m) => [m.bot_id, m.leader]),
    [
      ["bot-a", true],
      ["bot-b", false],
    ],
  );

  await authedRequest(`/api/teams/${team.id}/members/bot-b`, {
    method: "DELETE",
  });
  const after = (await (
    await authedRequest(`/api/teams/${team.id}`)
  ).json()) as {
    members: unknown[];
  };
  assert.equal(after.members.length, 1);

  assert.equal(
    (await authedRequest(`/api/teams/${team.id}`, { method: "DELETE" })).status,
    200,
  );
  assert.ok(dbm.getBot("bot-a"), "deleting a team keeps its bots");
});

test("teammatesOf lists teammates with role and leadership", () => {
  dbm.insertRole({
    id: "role-lead",
    name: "Coordinator",
    instructions: "",
    mcp_server_ids: [],
    skill_ids: [],
    created_at: Date.now(),
  });
  dbm.updateBot("bot-a", { role_id: "role-lead" });

  const teamId = "team-x";
  dbm.insertTeam({ id: teamId, name: "ops", created_at: Date.now() });
  dbm.setTeamMember(teamId, "bot-a", true);
  dbm.setTeamMember(teamId, "bot-b", false);

  const mates = dbm.teammatesOf("bot-b");
  assert.equal(mates.length, 1);
  assert.equal(mates[0].id, "bot-a");
  assert.equal(mates[0].role_name, "Coordinator");
  assert.deepEqual(mates[0].leader_of, ["ops"]);

  const alone = dbm.teammatesOf("bot-solo");
  makeBot("bot-solo", "Solo");
  assert.deepEqual(alone, []);
});

test("send_message delivery semantics", () => {
  const sender = dbm.getBot("bot-a")!;
  makeBot("bot-c", "C");

  assert.match(deliverDm(sender, "ghost", "hi"), /^not delivered: no bot/);
  assert.match(deliverDm(sender, "bot-a", "hi"), /cannot DM yourself/);
  assert.match(
    deliverDm(dbm.getBot("bot-solo")!, "bot-b", "hi"),
    /shares no team/,
  );
  assert.equal(dbm.listRuns("bot-b").length, 0, "failed DMs wake nobody");

  const result = deliverDm(sender, "bot-b", "ping");
  assert.match(result, /^delivered to B/);
  assert.ok(!isLoopActive("bot-b"));
  const runs = dbm.listRuns("bot-b");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].trigger, "dm");
});

test("send_message tool and Teams section only exist with teammates", () => {
  const soloNames = buildTools("bot-solo").map((t) => t.name);
  assert.ok(!soloNames.includes("send_message"));
  assert.doesNotMatch(
    effectiveSystemPrompt(dbm.getBot("bot-solo")!),
    /## Teams/,
  );

  const teamNames = buildTools("bot-a", () => "delivered").map((t) => t.name);
  assert.ok(teamNames.includes("send_message"));
  const prompt = effectiveSystemPrompt(dbm.getBot("bot-a")!);
  assert.match(prompt, /## Teams/);
  assert.match(prompt, /\bB\b.*id: bot-b/s);
});
