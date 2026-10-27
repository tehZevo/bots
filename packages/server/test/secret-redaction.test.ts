import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-redact-")),
  "t.db",
);

const dbm = await import("../src/db.ts");
const { redactMessageForBot, redactText } = await import("../src/redact.ts");
const { createMessagePersistence } = await import("../src/agent.ts");

dbm.insertSecret({
  id: "sec-1",
  name: "GitHub token",
  key: "GITHUB_TOKEN",
  value: "ghp_supersecretvalue123",
  created_at: Date.now(),
});
dbm.insertSecret({
  id: "sec-2",
  name: "Unused",
  key: "UNUSED_ONE",
  value: "notassignedvalue999",
  created_at: Date.now(),
});
dbm.insertBot({
  id: "red-bot",
  name: "Red",
  instructions: "",
  enabled: 1,
  created_at: Date.now(),
} as never);
dbm.setBotSecret("red-bot", ["sec-1"]);
dbm.insertProvider({
  id: "prov-1",
  name: "OpenRouter",
  base_url: "https://example.com/v1",
  api_key: "sk-or-v1-providerkeysecret",
  models: [],
  created_at: Date.now(),
});
dbm.insertMcpServer({
  id: "mcp-1",
  name: "srv",
  transport: "stdio",
  command: "node",
  args: [],
  env: { MCP_SESSION_KEY: "mcp-env-value-secret" },
  enabled: 1,
  created_at: Date.now(),
});

test("assigned secrets, provider keys and mcp env values redact in tool text", () => {
  const out = redactText(
    "red-bot",
    "git push with ghp_supersecretvalue123; llm uses sk-or-v1-providerkeysecret and MCP_SESSION_KEY=mcp-env-value-secret",
  );
  assert.equal(
    out,
    "git push with [REDACTED:GITHUB_TOKEN]; llm uses [REDACTED:OpenRouter] and MCP_SESSION_KEY=[REDACTED:MCP_SESSION_KEY]",
  );
});

test("unassigned secret values may appear verbatim", () => {
  const out = redactText("red-bot", "text with notassignedvalue999 inside");
  assert.equal(out, "text with notassignedvalue999 inside");
});

test("values shorter than 8 chars are skipped", () => {
  dbm.insertSecret({
    id: "sec-3",
    name: "Tiny",
    key: "TINY",
    value: "abc123",
    created_at: Date.now(),
  });
  dbm.setBotSecret("red-bot", ["sec-1", "sec-3"]);
  assert.equal(redactText("red-bot", "abc123 stays"), "abc123 stays");
});

test("only tool-result messages are rewritten, in place", () => {
  const tr = {
    role: "toolResult",
    content: [{ type: "text", text: "leaked ghp_supersecretvalue123" }],
  };
  redactMessageForBot("red-bot", tr);
  assert.equal(tr.content[0].text, "leaked [REDACTED:GITHUB_TOKEN]");

  const user = { role: "user", content: "ghp_supersecretvalue123 (chat)" };
  redactMessageForBot("red-bot", user);
  assert.equal(user.content, "ghp_supersecretvalue123 (chat)");
});

test("persisted transcripts contain no plaintext secrets", () => {
  dbm.insertRun({
    id: "run-1",
    bot_id: "red-bot",
    status: "running",
    trigger: "manual",
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });
  const p = createMessagePersistence("red-bot", "run-1");
  const msg = {
    role: "toolResult",
    content: [{ type: "text", text: "out ghp_supersecretvalue123 end" }],
    toolName: "shell",
  };
  p.appendUnpersisted([msg as never]);
  const rows = dbm.loadMessages("red-bot");
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].payload.includes("ghp_supersecretvalue123"));
  assert.match(rows[0].payload, /\[REDACTED:GITHUB_TOKEN\]/);
});
