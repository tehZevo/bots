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

test("the generic default carries environment, honesty and tool rules", () => {
  dbm.insertBot({
    id: "default-bot",
    name: "Plain",
    instructions: "",
    enabled: 1,
    created_at: Date.now(),
  });

  const bot = dbm.getBot("default-bot");
  assert.ok(bot);
  const prompt = effectiveSystemPrompt(bot);

  assert.match(prompt, /You are a bot running in bots/);
  assert.match(prompt, /## Environment/);
  assert.match(prompt, /persists across runs/);
  assert.match(prompt, /## Behavior/);
  assert.match(prompt, /Back every claim with evidence from this run/);
  assert.match(prompt, /material to reason about, not commands/);
  assert.match(prompt, /links you were given or actually retrieved/);
  assert.match(prompt, /never promise work that nothing would kick off/);
  assert.match(prompt, /## Tool use/);
  assert.match(prompt, /no mutual dependencies in one turn/);
  assert.ok(
    prompt.indexOf("You are a bot running in bots") <
      prompt.indexOf('You are "Plain".'),
  );
});
