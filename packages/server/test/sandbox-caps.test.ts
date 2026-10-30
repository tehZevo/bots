import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-caps-test-")),
  "t.db",
);

const { createApp } = await import("../src/api.ts");
const app = createApp();

process.env.ALLOW_REGISTRATION = "true";
let SESSION = "";

function authed(path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: {
      ...(SESSION ? { cookie: SESSION } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

const signup = await authed("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "caps@example.com", password: "dev-caps-1" }),
});
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

test("hardeningArgs pins user, caps and ceilings (specs/machines/sandbox.md)", async () => {
  const { hardeningArgs } = await import("../src/sandbox.ts");
  const args = hardeningArgs({ uid: 1000, gid: 1000 });
  assert.ok(args.includes("--user"));
  assert.equal(args[args.indexOf("--user") + 1], "1000:1000");
  assert.ok(args.includes("--cap-drop=ALL"));
  assert.ok(args.includes("--security-opt=no-new-privileges"));
  assert.ok(args.includes("--pids-limit=256"));
  // defaults: 1 GiB memory, 1 CPU
  assert.equal(args[args.indexOf("--memory") + 1], "1024m");
  assert.equal(args[args.indexOf("--cpus") + 1], "1");
});

test("resource caps are server-wide settings with validation", async () => {
  const res = await authed("/api/settings").then((r) => r.json());
  assert.equal(res.sandbox_memory_mb, 1024);
  assert.equal(res.sandbox_cpu, 1);

  const put = await authed("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sandbox_memory_mb: 512, sandbox_cpu: 1.5 }),
  });
  assert.equal(put.status, 200);

  const after = await authed("/api/settings").then((r) => r.json());
  assert.equal(after.sandbox_memory_mb, 512);
  assert.equal(after.sandbox_cpu, 1.5);

  const { hardeningArgs } = await import("../src/sandbox.ts");
  const args = hardeningArgs({ uid: 0, gid: 0 });
  assert.equal(args[args.indexOf("--memory") + 1], "512m");
  assert.equal(args[args.indexOf("--cpus") + 1], "1.5");

  for (const body of [
    { sandbox_memory_mb: 32 },
    { sandbox_memory_mb: 1.5 },
    { sandbox_cpu: 0 },
    { sandbox_cpu: 64 },
  ]) {
    const bad = await authed("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(bad.status, 400, JSON.stringify(body));
  }
});
