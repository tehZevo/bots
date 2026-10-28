import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-durable-tools-")),
  "t.db",
);

await import("../src/db.ts");
const { baseHarnessTools } = await import("../src/durable-tools.ts");

test("base Harness tools mirror the legacy baseline and conditional tools", () => {
  const names = (botId: string, dm?: (id: string, text: string) => string) =>
    baseHarnessTools(botId, dm).map((tool) => tool.name);

  assert.deepEqual(names("plain-bot").sort(), [
    "set_current_task",
    "set_status",
    "shell",
    "web_fetch",
  ]);
  assert.deepEqual(names("team-bot", () => "delivered").sort(), [
    "send_message",
    "set_current_task",
    "set_status",
    "shell",
    "web_fetch",
  ]);

  const withSkill = baseHarnessTools("skill-bot", undefined, [
    {
      id: "demo",
      name: "Demo",
      description: "Demo skill",
      instructions: "",
      created_at: Date.now(),
      import_info: null,
    },
  ]).map((tool) => tool.name);

  assert.ok(withSkill.includes("read_skill_file"));
});
