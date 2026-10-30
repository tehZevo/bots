import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "bots-skill-updates-"));
process.env.DATA_DIR = dataDir;
process.env.DATABASE_PATH = join(dataDir, "t.db");
process.env.ALLOW_REGISTRATION = "true";
process.env.BOTS_ALLOW_PRIVATE_NETWORK = "1";
delete process.env.DEV_SEED_AUTH;

const { createApp } = await import("../src/api.ts");
const { getSkill, updateSkill } = await import("../src/db.ts");
const { runDailySkillChecks } = await import("../src/skillupdates.ts");
const app = createApp();

const signup = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "upd@example.com", password: "longenough1" }),
});
const SESSION = signup.headers.get("set-cookie")?.split(";")[0] ?? "";
if (!SESSION) throw new Error(await signup.text());

function authed(path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: { cookie: SESSION, ...(init?.headers ?? {}) },
  });
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

interface SkillResponse {
  id: string;
  name: string;
  description: string;
  instructions: string;
  import_info: string | null;
  update_state?: {
    status: string | null;
    checked_at: number | null;
    modified: boolean;
    pinned: boolean;
  } | null;
}

interface ActionResponse {
  id: string;
  status: string;
  error: string | null;
  skill: SkillResponse | null;
}

const repo = mkdtempSync(join(tmpdir(), "bots-skill-update-repo-"));
function git(args: string[]): void {
  const res = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr || `git ${args[0]} failed`);
}
function head(): string {
  const res = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  });
  if (res.status !== 0) throw new Error(res.stderr || "git rev-parse failed");
  return res.stdout.trim();
}

mkdirSync(join(repo, "skills/alpha/references"), { recursive: true });
writeFileSync(
  join(repo, "skills/alpha/SKILL.md"),
  "---\nname: Alpha Helper\ndescription: Helps with alpha things\n---\nDo the alpha work.\n",
);
writeFileSync(join(repo, "skills/alpha/references/guide.md"), "# reference\n");
mkdirSync(join(repo, "skills/beta"), { recursive: true });
writeFileSync(
  join(repo, "skills/beta/SKILL.md"),
  "---\nname: Beta\ndescription: Beta steps\n---\nBeta steps.\n",
);
git(["init", "-q", "-b", "main"]);
git(["config", "user.email", "t@example.com"]);
git(["config", "user.name", "T"]);
git(["add", "-A"]);
git(["commit", "-qm", "fixture"]);

const repoUrl = `file://${repo}`;
let skillId = "";

test("imported skills start unchecked and can be checked against their source", async () => {
  const imported = await authed("/api/skills/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: repoUrl, folders: ["skills/alpha"] }),
  });
  assert.equal(imported.status, 201);
  const created = await body<{ skills: SkillResponse[] }>(imported);
  skillId = created.skills[0].id;
  assert.equal(created.skills[0].update_state?.status ?? null, null);

  const checked = await authed(`/api/skills/${skillId}/check`, {
    method: "POST",
  });
  assert.equal(checked.status, 200);
  const result = await body<ActionResponse>(checked);
  assert.equal(result.status, "up_to_date");
  assert.ok(result.skill?.update_state?.checked_at);
});

test("branch checks detect upstream changes and update replaces the installed bundle", async () => {
  writeFileSync(
    join(repo, "skills/alpha/SKILL.md"),
    "---\nname: Alpha Helper v2\ndescription: Updated alpha things\n---\nDo the updated alpha work.\n",
  );
  git(["add", "-A"]);
  git(["commit", "-qm", "v2"]);

  const bulk = await authed("/api/skills/check", { method: "POST" });
  assert.equal(bulk.status, 200);
  const checkAll = await body<{
    results: Array<{ id: string; status: string }>;
    skills: SkillResponse[];
  }>(bulk);
  assert.equal(
    checkAll.results.find((x) => x.id === skillId)?.status,
    "update_available",
  );
  const previewed = checkAll.skills.find((skill) => skill.id === skillId);
  assert.equal(previewed?.name, "Alpha Helper");
  assert.match(previewed?.instructions ?? "", /Do the alpha work\./);

  const updated = await authed(`/api/skills/${skillId}/update`, {
    method: "POST",
  });
  assert.equal(updated.status, 200);
  const result = await body<ActionResponse>(updated);
  assert.equal(result.status, "updated");
  assert.equal(result.skill?.name, "Alpha Helper v2");
  assert.match(result.skill?.instructions ?? "", /Do the updated alpha work\./);
  assert.equal(result.skill?.update_state?.modified, false);

  const stored = readFileSync(
    join(dataDir, "skills", skillId, "SKILL.md"),
    "utf8",
  );
  assert.match(stored, /Alpha Helper v2/);
});

test("local edits are marked modified until an update is applied", async () => {
  const edited = await authed(`/api/skills/${skillId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instructions: "Local edit." }),
  });
  assert.equal(edited.status, 200);
  const local = await body<SkillResponse>(edited);
  assert.equal(local.update_state?.modified, true);

  writeFileSync(
    join(repo, "skills/alpha/SKILL.md"),
    "---\nname: Alpha Helper v3\ndescription: Updated alpha things\n---\nDo the third alpha work.\n",
  );
  git(["add", "-A"]);
  git(["commit", "-qm", "v3"]);

  const checked = await authed(`/api/skills/${skillId}/check`, {
    method: "POST",
  });
  assert.equal(checked.status, 200);
  const check = await body<ActionResponse>(checked);
  assert.equal(check.status, "update_available");
  assert.equal(check.skill?.update_state?.modified, true);

  const updated = await authed(`/api/skills/${skillId}/update`, {
    method: "POST",
  });
  assert.equal(updated.status, 200);
  const result = await body<ActionResponse>(updated);
  assert.equal(result.status, "updated");
  assert.equal(result.skill?.name, "Alpha Helper v3");
  assert.match(result.skill?.instructions ?? "", /Do the third alpha work\./);
  assert.equal(result.skill?.update_state?.modified, false);
});

test("tag and commit imports are pinned and never offer an update", async () => {
  const sha = head();
  const imported = await authed("/api/skills/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: `${repoUrl}#${sha}`,
      folders: ["skills/beta"],
    }),
  });
  assert.equal(imported.status, 201);
  const created = await body<{ skills: SkillResponse[] }>(imported);
  const pinnedId = created.skills[0].id;
  assert.equal(created.skills[0].update_state?.pinned, true);

  writeFileSync(
    join(repo, "skills/beta/SKILL.md"),
    "---\nname: Beta v2\ndescription: New beta steps\n---\nNew beta steps.\n",
  );
  git(["add", "-A"]);
  git(["commit", "-qm", "beta v2"]);

  const checked = await authed(`/api/skills/${pinnedId}/check`, {
    method: "POST",
  });
  assert.equal(checked.status, 200);
  const result = await body<ActionResponse>(checked);
  assert.equal(result.status, "up_to_date");
  assert.equal(result.skill?.update_state?.pinned, true);
});

test("unreachable branch sources record source unavailable and daily checks wait a day", async () => {
  rmSync(repo, { recursive: true, force: true });

  const check = await authed(`/api/skills/${skillId}/check`, {
    method: "POST",
  });
  assert.equal(check.status, 200);
  const result = await body<ActionResponse>(check);
  assert.equal(result.status, "source_unavailable");
  assert.match(result.skill?.instructions ?? "", /Do the third alpha work\./);
  assert.ok(existsSync(join(dataDir, "skills", skillId, "SKILL.md")));

  const row = getSkill(skillId);
  const info = JSON.parse(String(row?.import_info)) as Record<string, unknown>;
  info.last_check = { checked_at: 0, status: "source_unavailable" };
  updateSkill(skillId, { import_info: JSON.stringify(info) });

  assert.equal(await runDailySkillChecks(), 1);
  assert.equal(await runDailySkillChecks(), 0);
});

test("detaching keeps content and clears update tracking", async () => {
  const detached = await authed(`/api/skills/${skillId}/detach`, {
    method: "POST",
  });
  assert.equal(detached.status, 200);
  const skill = await body<SkillResponse>(detached);
  assert.equal(skill.import_info, null);
  assert.equal(skill.update_state, null);
  assert.match(skill.instructions, /Do the third alpha work\./);
  assert.ok(existsSync(join(dataDir, "skills", skillId, "SKILL.md")));
});
