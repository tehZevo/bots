import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-search-test-")),
  "t.db",
);

const { createApp } = await import("../src/api.ts");
const { buildSearchResults } = await import("../src/search.ts");
const app = createApp();

process.env.ALLOW_REGISTRATION = "true";
const signup = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "search@example.com",
    password: "dev-session-1",
  }),
});
const SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

interface SearchResultJson {
  id: string;
  name: string;
  subtitle: string | null;
}

interface SearchGroupJson {
  type: string;
  total: number;
  matches: SearchResultJson[];
}

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await app.request(path, {
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

function groups(json: Record<string, unknown>): Map<string, SearchGroupJson> {
  const list = (json.groups ?? []) as SearchGroupJson[];
  return new Map(list.map((group) => [group.type, group]));
}

test("search is session-only", async () => {
  assert.equal((await app.request("/api/search?q=zeta")).status, 401);
});

test("GET /api/search groups case-insensitive substring matches", async () => {
  const role = await req("POST", "/api/roles", {
    name: "zeta-role",
    instructions: "keep zeta operations terse",
  });
  assert.equal(role.status, 201);

  const bot = await req("POST", "/api/bots", {
    name: "zeta-bot",
    instructions: "search the deploy log",
  });
  assert.equal(bot.status, 201);
  assert.equal(
    (
      await req("PATCH", `/api/bots/${bot.json.id as string}`, {
        role_id: role.json.id as string,
      })
    ).status,
    200,
  );

  const skill = await req("POST", "/api/skills", {
    name: "zeta-skill",
    description: "skill description zeta",
    instructions: "do the thing",
  });
  assert.equal(skill.status, 201);

  const project = await req("POST", "/api/projects", {
    name: "zeta-project",
    description: "project context zeta",
    body: "shared prompt",
  });
  assert.equal(project.status, 201);

  const tag = await req("POST", "/api/tags", { name: "zeta-tag" });
  assert.equal(tag.status, 201);

  const team = await req("POST", "/api/teams", { name: "zeta-team" });
  assert.equal(team.status, 201);

  const template = await req("POST", "/api/templates", {
    name: "zeta-template",
    description: "template summary zeta",
    instructions: "starter prompt",
  });
  assert.equal(template.status, 201);

  const result = await req(
    "GET",
    `/api/search?q=${encodeURIComponent("ZETA")}`,
  );
  assert.equal(result.status, 200);
  const byType = groups(result.json);

  const botGroup = byType.get("bots");
  assert.ok(botGroup?.matches.some((match) => match.id === bot.json.id));
  assert.equal(
    botGroup?.matches.find((match) => match.id === bot.json.id)?.subtitle,
    "zeta-role",
  );

  for (const [type, id] of [
    ["roles", role.json.id],
    ["skills", skill.json.id],
    ["projects", project.json.id],
    ["tags", tag.json.id],
    ["teams", team.json.id],
    ["templates", template.json.id],
  ] as const) {
    assert.ok(
      byType.get(type)?.matches.some((match) => match.id === id),
      `expected ${type} search result`,
    );
  }

  assert.equal(byType.get("tags")?.matches[0]?.subtitle, "0 bots");
  assert.equal(byType.get("teams")?.matches[0]?.subtitle, "0 bots");
});

test("GET /api/search filters and validates types", async () => {
  const scoped = await req(
    "GET",
    `/api/search?q=zeta&types=${encodeURIComponent("tags,bots")}`,
  );
  assert.equal(scoped.status, 200);
  assert.deepEqual([...groups(scoped.json).keys()], ["tags", "bots"]);

  const bad = await req(
    "GET",
    `/api/search?q=zeta&types=${encodeURIComponent("runs")}`,
  );
  assert.equal(bad.status, 400);
});

test("search caps groups and skips empty queries", () => {
  const result = buildSearchResults({
    q: "cap",
    types: ["bots"],
    data: {
      bots: Array.from({ length: 10 }, (_, index) => ({
        id: `bot-${index}`,
        name: `cap-bot-${index}`,
        instructions: "",
        role_id: null,
      })),
      roles: [],
      skills: [],
      projects: [],
      tags: [],
      teams: [],
      templates: [],
    },
  });
  assert.equal(result[0]?.total, 10);
  assert.equal(result[0]?.matches.length, 8);

  const empty = buildSearchResults({
    q: "   ",
    types: ["bots"],
    data: {
      bots: [
        { id: "bot-1", name: "anything", instructions: "", role_id: null },
      ],
      roles: [],
      skills: [],
      projects: [],
      tags: [],
      teams: [],
      templates: [],
    },
  });
  assert.equal(empty[0]?.total, 0);
  assert.deepEqual(empty[0]?.matches, []);
});

test("search separates active bots from archived bots", () => {
  const result = buildSearchResults({
    q: "split",
    types: ["bots", "archived_bots"],
    data: {
      bots: [
        {
          id: "active-bot",
          name: "split-active",
          instructions: "",
          role_id: null,
          archived: 0,
        },
        {
          id: "archived-bot",
          name: "split-archived",
          instructions: "",
          role_id: null,
          archived: 1,
        },
      ],
      roles: [],
      skills: [],
      projects: [],
      tags: [],
      teams: [],
      templates: [],
    },
  });

  assert.deepEqual(
    result.map((group) => [group.type, group.matches.map((m) => m.id)]),
    [
      ["bots", ["active-bot"]],
      ["archived_bots", ["archived-bot"]],
    ],
  );
});
