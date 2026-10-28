import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-durable-recovery-")),
  "t.db",
);

const dbm = await import("../src/db.ts");
const piRuntime = await import("../src/pi-runtime.ts");
const runs = await import("../src/durable-runs.ts");
const chord = await import("@earendil-works/chord/context");
const durable = await import("@earendil-works/pi-durable");
const modelsModule = await import("@earendil-works/pi-ai/models");
const sqlite = await import("@earendil-works/pi-durable/storage/sqlite/node");

test("boot recovery finalizes committed work and sweeps unresumable runs", async () => {
  const now = Date.now();
  dbm.insertBot({
    id: "recover-bot",
    name: "Recover Bot",
    instructions: "",
    model_id: null,
    enabled: 1,
    created_at: now,
  });
  dbm.insertRun({
    id: "committed-run",
    bot_id: "recover-bot",
    status: "running",
    trigger: "manual",
    started_at: now,
    finished_at: null,
    output: null,
    error: null,
  });

  try {
    const storage = await sqlite.openNodeSqliteStorage(
      piRuntime.durableStoragePath(),
    );
    let conversationHarness: durable.Harness | undefined;
    try {
      conversationHarness = await durable.Harness.open(
        storage,
        {
          models: modelsModule.createModels(),
          registry: durable.createRegistry(),
        },
        chord.BACKGROUND_CONTEXT,
      );
      const conversation = await conversationHarness.createConversation(
        { ownership: { kind: "ownerless" } },
        chord.BACKGROUND_CONTEXT,
      );
      dbm.setBotConversation("recover-bot", String(conversation.id));
      dbm.setCurrentRunForBot("recover-bot", "committed-run");

      const submission = await conversation.submit(
        {
          type: "write",
          entry: { kind: "bots.test" },
          requestId: "committed-run",
        },
        chord.BACKGROUND_CONTEXT,
      );
      await submission.wait(chord.BACKGROUND_CONTEXT);
    } finally {
      if (conversationHarness)
        await conversationHarness.close(chord.BACKGROUND_CONTEXT);
      await storage.close(chord.BACKGROUND_CONTEXT);
    }

    const recovered = await runs.recoverDurableRuns();
    assert.equal(recovered.resumed, 0);
    assert.equal(recovered.swept, 0);
    assert.equal(dbm.getRun("committed-run")?.status, "ok");
    assert.equal(dbm.getCurrentRunForBot("recover-bot"), null);

    const again = await runs.recoverDurableRuns();
    assert.equal(again.resumed, 0);
    assert.equal(again.swept, 0);

    dbm.insertBot({
      id: "legacy-bot",
      name: "Legacy Bot",
      instructions: "",
      model_id: null,
      enabled: 1,
      created_at: Date.now(),
    });
    dbm.insertRun({
      id: "legacy-run",
      bot_id: "legacy-bot",
      status: "running",
      trigger: "manual",
      started_at: Date.now(),
      finished_at: null,
      output: null,
      error: null,
    });

    const swept = await runs.recoverDurableRuns();
    assert.equal(swept.resumed, 0);
    assert.equal(swept.swept, 1);
    assert.equal(dbm.getRun("legacy-run")?.status, "error");
    assert.equal(dbm.getCurrentRunForBot("legacy-bot"), null);
  } finally {
    await piRuntime.closeDurableRuntime();
  }
});
