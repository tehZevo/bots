import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-durable-mirror-")),
  "t.db",
);

const dbm = await import("../src/db.ts");
const chord = await import("@earendil-works/chord/context");
const durable = await import("@earendil-works/pi-durable");
const modelsModule = await import("@earendil-works/pi-ai/models");
const conversations = await import("../src/durable-conversations.ts");

test("durable bot conversations seed legacy history and mirror only new entries", async () => {
  dbm.insertBot({
    id: "mirror-bot",
    name: "Mirror Bot",
    instructions: "",
    model_id: null,
    enabled: 1,
    created_at: Date.now(),
  });

  const harness = await durable.Harness.open(
    new durable.MemoryStorage(),
    {
      models: modelsModule.createModels(),
      registry: durable.createRegistry(),
    },
    chord.BACKGROUND_CONTEXT,
  );

  const history = [
    { role: "user", content: "old question", timestamp: 1 } as never,
    {
      role: "assistant",
      content: [{ type: "text", text: "old answer" }],
      timestamp: 2,
    } as never,
  ];
  dbm.appendMessages(
    "mirror-bot",
    null,
    history.map((message) => ({ role: message.role, payload: message })),
  );

  try {
    const conversation = await conversations.ensureBotConversation(
      harness,
      "mirror-bot",
      "gpt-test",
      history,
    );

    assert.deepEqual(
      await conversations.readConversationMessages(conversation),
      history,
    );

    const mirror = new conversations.DurableMessageMirror(conversation);
    await mirror.initialize("mirror-bot");
    assert.equal(await mirror.appendNewMessages("mirror-bot", null), 0);

    await conversations.appendHistoryEntries(conversation, [
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "shell",
        content: [{ type: "text", text: "done" }],
        timestamp: 3,
      } as never,
    ]);

    assert.equal(await mirror.appendNewMessages("mirror-bot", null), 1);
    assert.equal(await mirror.appendNewMessages("mirror-bot", null), 0);
    assert.equal(dbm.loadMessages("mirror-bot").length, 3);

    const again = await conversations.ensureBotConversation(
      harness,
      "mirror-bot",
      "gpt-test",
      [],
    );
    assert.equal(again.id, conversation.id);
    assert.equal(dbm.loadMessages("mirror-bot").length, 3);
  } finally {
    await harness.close(chord.BACKGROUND_CONTEXT);
  }
});
