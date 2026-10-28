import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-durable-extensions-")),
  "t.db",
);

const dbm = await import("../src/db.ts");
const chord = await import("@earendil-works/chord/context");
const durable = await import("@earendil-works/pi-durable");
const modelsModule = await import("@earendil-works/pi-ai/models");
const provider = await import("../src/pi-provider.ts");
const extensions = await import("../src/durable-extensions.ts");

test("durable bot extension installs prompt, base tools, and MCP selection", async () => {
  dbm.insertBot({
    id: "extension-bot",
    name: "Extension Bot",
    instructions: "be terse",
    model_id: null,
    enabled: 1,
    created_at: Date.now(),
  });
  const bot = dbm.getBot("extension-bot");
  assert.ok(bot);

  const registry = durable.createRegistry();
  const botExtension = extensions.installBotExtension(registry, bot);
  const harness = await durable.Harness.open(
    new durable.MemoryStorage(),
    { models: modelsModule.createModels(), registry },
    chord.BACKGROUND_CONTEXT,
  );

  try {
    const conversation = await harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: { provider: provider.BOTS_PROVIDER_ID, modelId: "gpt-test" },
          extensions: [botExtension],
        },
      },
      chord.BACKGROUND_CONTEXT,
    );

    let agent = await conversation.agent(chord.BACKGROUND_CONTEXT);
    assert.deepEqual(agent.tools.map((tool) => tool.name).sort(), [
      "set_current_task",
      "set_status",
      "shell",
      "web_fetch",
    ]);
    const prompt = await agent.sections[0].render(
      undefined as never,
      chord.BACKGROUND_CONTEXT,
    );
    assert.match(prompt ?? "", /Extension Bot/);

    const mcp = await extensions.installMcpExtension(registry, bot);
    assert.equal(mcp.sessions.length, 0);
    await conversation.configure(
      {
        extensions: extensions.selectExtensions(botExtension, mcp.extension),
      },
      chord.BACKGROUND_CONTEXT,
    );

    agent = await conversation.agent(chord.BACKGROUND_CONTEXT);
    assert.deepEqual(
      agent.extensions.map((extension) => extension.name),
      [`bots:${bot.id}`, `bots-mcp:${bot.id}`],
    );

    extensions.uninstallExtension(registry, mcp.extension.name);
    await conversation.configure(
      { extensions: [botExtension] },
      chord.BACKGROUND_CONTEXT,
    );
    agent = await conversation.agent(chord.BACKGROUND_CONTEXT);
    assert.deepEqual(agent.tools.map((tool) => tool.name).sort(), [
      "set_current_task",
      "set_status",
      "shell",
      "web_fetch",
    ]);
  } finally {
    await harness.close(chord.BACKGROUND_CONTEXT);
  }
});
