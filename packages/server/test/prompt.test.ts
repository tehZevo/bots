import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-prompt-")),
  "t.db",
);

const dbm = await import("../src/db.ts");
const { effectiveSystemPrompt } = await import("../src/agent.ts");

test("every bot prompt keeps work inside the assignment", () => {
  dbm.insertBot({
    id: "scope-bot",
    name: "Scout",
    instructions: "Follow the project playbook.",
    enabled: 1,
    created_at: Date.now(),
  });

  const bot = dbm.getBot("scope-bot");
  assert.ok(bot);
  const prompt = effectiveSystemPrompt(bot);

  assert.match(prompt, /## Assignment/);
  assert.match(prompt, /Work only on that assignment/);
  assert.match(prompt, /Reply once/);
  assert.match(prompt, /current-task and status tools/);
  assert.match(prompt, /Do not wait or poll for more work/);
  assert.doesNotMatch(prompt, /helpful autonomous bot/i);
  assert.ok(
    prompt.indexOf("## Assignment") <
      prompt.indexOf("Follow the project playbook."),
  );
});
