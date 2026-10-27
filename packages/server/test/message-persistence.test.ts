import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-persistence-")),
  "t.db",
);

const db = await import("../src/db.ts");
const { createMessagePersistence } = await import("../src/agent.ts");

function message(role: string, text: string) {
  return {
    role,
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  } as unknown as AgentMessage;
}

test("new runs persist only messages added after the loaded history", () => {
  const botId = "sync-bot";
  db.insertBot({
    id: botId,
    name: botId,
    instructions: "",
    model_id: null,
    role_id: null,
    enabled: 1,
    current_task: null,
    current_task_updated_at: null,
    status: null,
    status_level: null,
    created_at: Date.now(),
  });

  db.insertRun({
    id: "run-1",
    bot_id: botId,
    status: "running",
    trigger: "manual",
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });

  const firstRun = createMessagePersistence(botId, "run-1");
  const firstUser = message("user", "first prompt");
  const firstAssistant = message("assistant", "first reply");
  firstRun.appendUnpersisted([firstUser, firstAssistant]);

  const loadedHistory = db
    .loadMessages(botId)
    .map((row) => JSON.parse(row.payload));
  const secondRun = createMessagePersistence(botId, "run-2");
  secondRun.markPersisted(loadedHistory);

  db.insertRun({
    id: "run-2",
    bot_id: botId,
    status: "running",
    trigger: "manual",
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });

  const secondUser = message("user", "second prompt");
  const secondAssistant = message("assistant", "second reply");
  secondRun.appendUnpersisted([
    {
      role: "system",
      content: "",
      timestamp: Date.now(),
    } as unknown as AgentMessage,
    loadedHistory[0],
    loadedHistory[1],
    secondUser,
    secondAssistant,
  ]);

  const rows = db.loadMessages(botId);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.role),
    ["user", "assistant", "user", "assistant"],
  );
});

test("replacement persistence preserves the current task and status", () => {
  const botId = "compact-bot";
  db.insertBot({
    id: botId,
    name: botId,
    instructions: "",
    model_id: null,
    role_id: null,
    enabled: 1,
    current_task: null,
    current_task_updated_at: null,
    status: null,
    status_level: null,
    created_at: Date.now(),
  });

  db.setCurrentTask(botId, "working");
  db.setBotStatus(botId, "blocked", "issue");

  db.insertRun({
    id: "run-compact",
    bot_id: botId,
    status: "running",
    trigger: "manual",
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });

  const persistence = createMessagePersistence(botId, "run-compact");
  persistence.replacePersisted([message("assistant", "summary")]);

  assert.equal(db.loadMessages(botId).length, 1);
  assert.equal(db.getBot(botId)?.current_task, "working");
  assert.equal(db.getBot(botId)?.status, "blocked");
});
