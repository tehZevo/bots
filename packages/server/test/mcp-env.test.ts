import assert from "node:assert/strict";
import { test } from "node:test";

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
