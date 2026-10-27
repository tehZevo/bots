import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-mcp-env-")),
  "t.db",
);

const dbm = await import("../src/db.ts");
const { mcpChildEnv } = await import("../src/mcp.ts");

const base = {
  id: "m1",
  name: "s",
  transport: "stdio" as const,
  command: "echo",
  args: [],
  created_at: 0,
};

test("child env is the allowlist plus declared vars only", () => {
  process.env.DATABASE_PATH = "/secret/db.sqlite";
  process.env.DATA_DIR = "/secret/data";
  const env = mcpChildEnv({ ...base, env: { FOO: "bar" } });
  assert.equal(env.PATH, process.env.PATH);
  assert.equal(env.HOME, process.env.HOME);
  assert.equal(env.FOO, "bar");
  assert.equal("DATABASE_PATH" in env, false);
  assert.equal("DATA_DIR" in env, false);
});

test("declared keys override the baseline", () => {
  const env = mcpChildEnv({ ...base, env: { HOME: "/custom/home" } });
  assert.equal(env.HOME, "/custom/home");
});

test("a declared empty value stays an empty string", () => {
  const env = mcpChildEnv({ ...base, env: { EMPTY: "" } });
  assert.ok("EMPTY" in env);
  assert.equal(env.EMPTY, "");
});

test("secret references resolve to the current value at spawn time", () => {
  dbm.insertSecret({
    id: "sec-env-1",
    name: "Token",
    key: "TOKEN",
    value: "first-secret-value",
    created_at: Date.now(),
  });
  const server = { ...base, env: { TOKEN: { secret: "Token" } } };

  assert.equal(mcpChildEnv(server).TOKEN, "first-secret-value");
  dbm.updateSecret("sec-env-1", { value: "second-secret-value" });
  assert.equal(mcpChildEnv(server).TOKEN, "second-secret-value");

  dbm.deleteSecret("sec-env-1");
  assert.equal(mcpChildEnv(server).TOKEN, "");
});
