import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "bots-skill-data-"));
process.env.DATA_DIR = dataDir;
process.env.DATABASE_PATH = join(dataDir, "t.db");
delete process.env.ALLOW_REGISTRATION;

const { createApp } = await import("../src/api.ts");
const { parseFrontmatter, parseGitSource } = await import(
  "../src/skillimport.ts"
);
const app = createApp();

const signupRes = await app.request("/api/auth/signup", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(process.env.ALLOW_REGISTRATION === "true" ? {} : {}),
  },
  body: JSON.stringify({ email: "sk@example.com", password: "longenough1" }),
});
let SESSION = signupRes.headers.get("set-cookie")?.split(";")[0] ?? "";
if (!SESSION) {
  process.env.ALLOW_REGISTRATION = "true";
  const retry = await app.request("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "sk@example.com", password: "longenough1" }),
  });
  SESSION = retry.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function authed(path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: { cookie: SESSION, ...(init?.headers ?? {}) },
  });
}

// --- fixtures ---------------------------------------------------------------

const repo = mkdtempSync(join(tmpdir(), "bots-skill-repo-"));
function git(args: string[]): void {
  const res = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr || `git ${args[0]} failed`);
}

mkdirSync(join(repo, "skills/alpha/references"), { recursive: true });
writeFileSync(
  join(repo, "skills/alpha/SKILL.md"),
  `---\nname: Alpha Helper\ndescription: Helps with alpha things\nlicense: MIT\nmetadata:\n  team: core\n---\n\nDo the alpha work.\n`,
);
writeFileSync(join(repo, "skills/alpha/references/guide.md"), "# reference\n");
mkdirSync(join(repo, "skills/beta"), { recursive: true });
writeFileSync(
  join(repo, "skills/beta/SKILL.md"),
  `---\nname: Beta\ndescription: Beta skill body source\n---\n\nBeta steps.\n`,
);
mkdirSync(join(repo, "drafts"), { recursive: true });
writeFileSync(
  join(repo, "drafts/SKILL.md"),
  `---\nname: Draft\n---\n\nno description -> not discoverable\n`,
);
git(["init", "-q", "-b", "main"]);
git(["config", "user.email", "t@example.com"]);
git(["config", "user.name", "T"]);
git(["add", "-A"]);
git(["commit", "-qm", "fixture"]);

const repoUrl = `file://${repo}`;

// --- pure helpers -----------------------------------------------------------

test("frontmatter parses required fields and ignores unknown ones", () => {
  const fm = parseFrontmatter(
    '---\nname: "Quoted Name"\ndescription: desc\nunknown_field: x\n---\nBody here\n',
  );
  assert.deepEqual(
    { name: fm?.name, description: fm?.description, body: fm?.body },
    { name: "Quoted Name", description: "desc", body: "Body here\n" },
  );
  assert.equal(fm?.license, null);
});

test("frontmatter rejects missing name or description", () => {
  assert.equal(parseFrontmatter("---\nname: X\n---\nb\n"), null);
  assert.equal(parseFrontmatter("# no frontmatter\n"), null);
});

test("git source grammar covers all spec forms", () => {
  const short = parseGitSource("anthropics/skills");
  assert.equal(short?.cloneUrl, "https://github.com/anthropics/skills.git");
  assert.equal(short?.ownerRepo, "anthropics/skills");

  const withFilter = parseGitSource("anthropics/skills@pdf");
  assert.equal(withFilter?.ownerRepo, "anthropics/skills");
  assert.equal(withFilter?.skillFilter, "pdf");

  const tree = parseGitSource(
    "https://github.com/openai/skills/tree/v2.1/contrib/pdf",
  );
  assert.equal(tree?.ref, "v2.1");
  assert.equal(tree?.subpath, "contrib/pdf");
  assert.equal(tree?.cloneUrl, "https://github.com/openai/skills");

  const pinned = parseGitSource(`${repoUrl}#main`);
  assert.equal(pinned?.ref, "main");
  assert.equal(pinned?.cloneUrl, repoUrl);

  assert.equal(parseGitSource(""), null);
  assert.equal(parseGitSource("git@github.com:x/y.git"), null); // ssh unsupported
});

// --- search -----------------------------------------------------------------

test("skills.sh search proxies results and surfaces failures", async () => {
  const realFetch = globalThis.fetch;
  try {
    assert.equal((await authed("/api/skills/search")).status, 400);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          skills: [
            {
              id: "anthropics/skills/pdf",
              source: "anthropics/skills",
              skillId: "pdf",
              name: "pdf",
              installs: 42,
            },
          ],
        }),
      )) as typeof globalThis.fetch;
    const res = await authed("/api/skills/search?q=pdf");
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      results: { source: string; skill_id: string; installs: number }[];
    };
    assert.deepEqual(body.results[0], {
      id: "anthropics/skills/pdf",
      source: "anthropics/skills",
      skill_id: "pdf",
      name: "pdf",
      installs: 42,
    });

    globalThis.fetch = (async () =>
      new Response("x", { status: 503 })) as typeof globalThis.fetch;
    const bad = await authed("/api/skills/search?q=pdf");
    assert.equal(bad.status, 502);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// --- preview ----------------------------------------------------------------

test("preview discovers SKILL.md bundles with stats and provenance", async () => {
  const res = await authed("/api/skills/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: repoUrl }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    requested_ref: string | null;
    resolved_commit: string;
    skills: { folder: string; name: string; license: string | null }[];
  };
  assert.match(body.resolved_commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(
    body.skills.map((s) => s.folder),
    ["skills/alpha", "skills/beta"],
  );
  assert.equal(body.skills[0].name, "Alpha Helper");
  assert.equal(body.skills[0].license, "MIT");

  const filtered = (await (
    await authed("/api/skills/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: `${repoUrl}@beta` }),
    })
  ).json()) as { skills: { folder: string }[] };
  assert.deepEqual(
    filtered.skills.map((s) => s.folder),
    ["skills/beta"],
  );

  const subpath = (await (
    await authed("/api/skills/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: `${repoUrl}/tree/main/skills` }),
    })
  ).json()) as { requested_ref: string; skills: unknown[] };
  assert.equal(subpath.requested_ref, "main");
  assert.equal(subpath.skills.length, 2);

  const none = await authed("/api/skills/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: `${repoUrl}@nosuch` }),
  });
  assert.equal(none.status, 400);
});

// --- import -----------------------------------------------------------------

test("import stores bundles byte-for-byte with immutable provenance", async () => {
  const preview = (await (
    await authed("/api/skills/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: `${repoUrl}#main` }),
    })
  ).json()) as { resolved_commit: string };

  const res = await authed("/api/skills/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: `${repoUrl}#main`,
      folders: ["skills/alpha"],
    }),
  });
  assert.equal(res.status, 201);
  const created = (await res.json()) as {
    skills: {
      id: string;
      name: string;
      instructions: string;
      import_info: string;
    }[];
  };
  assert.equal(created.skills.length, 1);
  const skill = created.skills[0];
  assert.equal(skill.name, "Alpha Helper");
  assert.equal(skill.instructions, "Do the alpha work.\n");
  const info = JSON.parse(skill.import_info) as Record<string, unknown>;
  assert.equal(info.origin, "git");
  assert.equal(info.requested_ref, "main");
  assert.equal(info.resolved_commit, preview.resolved_commit);
  assert.equal(info.path, "skills/alpha");

  const dir = join(dataDir, "skills", skill.id);
  assert.equal(
    readFileSync(join(dir, "SKILL.md"), "utf8").startsWith(
      "---\nname: Alpha Helper",
    ),
    true,
  );
  assert.equal(
    readFileSync(join(dir, "references/guide.md"), "utf8"),
    "# reference\n",
  );

  const list = (await (await authed("/api/skills")).json()) as unknown[];
  assert.equal(list.length, 1);
});

test("import rejects oversized or unknown selections and saves nothing", async () => {
  writeFileSync(join(repo, "drafts/big.md"), Buffer.alloc(6 * 1024 * 1024, 7));
  git(["add", "-A"]);
  git(["commit", "-qm", "big file in drafts bundle"]);

  const oversized = await authed("/api/skills/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: repoUrl, folders: ["drafts"] }),
  });
  // drafts has no valid frontmatter so it is not selectable at all
  assert.equal(oversized.status, 400);

  const unknown = await authed("/api/skills/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: repoUrl, folders: ["nope/nothing"] }),
  });
  assert.equal(unknown.status, 400);

  const list = (await (await authed("/api/skills")).json()) as unknown[];
  assert.equal(list.length, 1);

  // make alpha oversized and confirm the whole import is refused atomically
  writeFileSync(
    join(repo, "skills/alpha/references/huge.bin"),
    Buffer.alloc(6 * 1024 * 1024, 9),
  );
  git(["add", "-A"]);
  git(["commit", "-qm", "oversize alpha"]);
  const tooBig = await authed("/api/skills/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: repoUrl, folders: ["skills/alpha"] }),
  });
  assert.equal(tooBig.status, 400);
  assert.match(((await tooBig.json()) as { error: string }).error, /exceeds/);
  const after = (await (await authed("/api/skills")).json()) as unknown[];
  assert.equal(after.length, 1);

  rmSync(join(repo, "skills/alpha/references/huge.bin"));
});

test("deleting a skill removes its stored bundle", async () => {
  const created = (await (
    await authed("/api/skills/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: repoUrl, folders: ["skills/beta"] }),
    })
  ).json()) as { skills: { id: string }[] };
  const id = created.skills[0].id;
  assert.ok(readFileSync(join(dataDir, "skills", id, "SKILL.md"), "utf8"));
  await authed(`/api/skills/${id}`, { method: "DELETE" });
  let gone = false;
  try {
    readFileSync(join(dataDir, "skills", id, "SKILL.md"));
  } catch {
    gone = true;
  }
  assert.ok(gone, "bundle directory removed with the skill");
});
