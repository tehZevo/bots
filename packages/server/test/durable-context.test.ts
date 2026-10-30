import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-durable-context-")),
  "t.db",
);

const dbm = await import("../src/db.ts");
const piRuntime = await import("../src/pi-runtime.ts");
const conversations = await import("../src/durable-conversations.ts");
const agent = await import("../src/agent.ts");
const chord = await import("@earendil-works/chord/context");

test("context estimates use the durable active context", async () => {
  dbm.insertBot({
    id: "stats-bot",
    name: "Stats Bot",
    instructions: "",
    model_id: null,
    enabled: 1,
    created_at: Date.now(),
  });

  try {
    const harness = await piRuntime.initDurableRuntime();
    const conversation = await harness.createConversation(
      { ownership: { kind: "ownerless" } },
      chord.BACKGROUND_CONTEXT,
    );
    dbm.setBotConversation("stats-bot", String(conversation.id));
    await conversations.appendHistoryEntries(conversation, [
      { role: "user", content: "durable context test", timestamp: Date.now() },
    ]);

    const bot = dbm.getBot("stats-bot");
    assert.ok(bot);
    assert.equal(dbm.loadMessages("stats-bot").length, 0);

    const breakdown = await agent.estimateContext(bot);
    assert.ok(breakdown.categories.conversation > 0);
  } finally {
    await piRuntime.closeDurableRuntime();
  }
});
