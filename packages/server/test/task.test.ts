import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "bots-test-")), "t.db");

const db = await import("../src/db.ts");

function makeBot(name: string): string {
  const id = crypto.randomUUID();
  db.insertBot({
    id,
    name,
    description: "",
    system_prompt: "",
    model_id: null,
    role_id: null,
    enabled: 1,
    created_at: Date.now(),
    current_task: null,
    current_task_updated_at: null,
  });
  return id;
}

test("setCurrentTask stores trimmed text with a timestamp", () => {
  const id = makeBot("task-bot");
  db.setCurrentTask(id, "  Shipping the report  ");
  const bot = db.getBot(id);
  assert.equal(bot?.current_task, "Shipping the report");
  assert.ok(bot?.current_task_updated_at);
});

test("empty or whitespace task clears to null", () => {
  const id = makeBot("clear-bot");
  db.setCurrentTask(id, "work");
  db.setCurrentTask(id, "   ");
  assert.equal(db.getBot(id)?.current_task, null);
});
