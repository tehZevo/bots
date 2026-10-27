import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const DATA = mkdtempSync(join(tmpdir(), "bots-ws-"));
process.env.DATA_DIR = DATA;
process.env.DATABASE_PATH = join(DATA, "t.db");

const { createApp } = await import("../src/api.ts");
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
  body: JSON.stringify({ email: "w@example.com", password: "dev-session-1" }),
});
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const BOT = (
  await json(
    await authedRequest("/api/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "ws-bot" }),
    }),
  )
).id as string;
const EMPTY_BOT = (
  await json(
    await authedRequest("/api/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "ws-empty" }),
    }),
  )
).id as string;

const ws = join(DATA, "workspaces", BOT);
mkdirSync(join(ws, "notes"), { recursive: true });
writeFileSync(join(ws, "a.txt"), "hello");
writeFileSync(join(ws, "big.bin"), Buffer.from([0, 1, 2, 255]));
writeFileSync(join(ws, "notes", "todo.md"), "# todo\n");
writeFileSync(join(DATA, "outside.txt"), "outside secret");
symlinkSync(join(DATA, "outside.txt"), join(ws, "escape"));

test("root listing sorts folders first then names with size and mtime", async () => {
  const data = await json(await authedRequest(`/api/bots/${BOT}/workspace`));
  assert.equal(data.path, "");
  const entries = data.entries as {
    name: string;
    type: string;
    size_bytes: number;
    modified_at: number;
  }[];
  assert.deepEqual(
    entries.map((e) => e.name),
    ["notes", "a.txt", "big.bin", "escape"],
  );
  const a = entries.find((e) => e.name === "a.txt");
  assert.equal(a?.type, "file");
  assert.equal(a?.size_bytes, 5);
  assert.ok(typeof a?.modified_at === "number" && a.modified_at > 0);
});

test("subdirectory listing keeps the requested path", async () => {
  const data = await json(
    await authedRequest(`/api/bots/${BOT}/workspace?path=notes`),
  );
  assert.equal(data.path, "notes");
  assert.deepEqual(
    (data.entries as { name: string }[]).map((e) => e.name),
    ["todo.md"],
  );
});

test("bot without a workspace directory lists empty", async () => {
  assert.deepEqual(
    await json(await authedRequest(`/api/bots/${EMPTY_BOT}/workspace`)),
    {
      path: "",
      entries: [],
    },
  );
});

test("file endpoint returns bytes with the file name preserved", async () => {
  const res = await authedRequest(
    `/api/bots/${BOT}/workspace/file?path=notes/todo.md`,
  );
  assert.equal(res.status, 200);
  assert.match(
    res.headers.get("content-disposition") ?? "",
    /filename="todo\.md"/,
  );
  assert.equal(await res.text(), "# todo\n");
});

test("traversal and absolute paths are refused with 400", async () => {
  for (const path of ["../../etc/passwd", "/etc/passwd", "a/../../../x"]) {
    const res = await authedRequest(
      `/api/bots/${BOT}/workspace?path=${encodeURIComponent(path)}`,
    );
    assert.equal(res.status, 400, path);
  }
});

test("symlink escapes are refused with 400", async () => {
  const res = await authedRequest(
    `/api/bots/${BOT}/workspace/file?path=escape`,
  );
  assert.equal(res.status, 400);
});

test("unknown paths answer 404, unknown bots too", async () => {
  assert.equal(
    (await authedRequest(`/api/bots/${BOT}/workspace?path=nope.txt`)).status,
    404,
  );
  assert.equal(
    (await authedRequest(`/api/bots/${BOT}/workspace/file?path=notes`)).status,
    404,
  );
  assert.equal(
    (await authedRequest("/api/bots/does-not-exist/workspace")).status,
    404,
  );
});
