import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-fake-durable-")),
  "t.db",
);
process.env.DEV_FAKE_LLM = "1";

const { BACKGROUND_CONTEXT } = await import("@earendil-works/chord/context");
const { createModels } = await import("@earendil-works/pi-ai/models");
const { createRegistry, Harness } = await import("@earendil-works/pi-durable");
const { openNodeSqliteStorage } = await import(
  "@earendil-works/pi-durable/storage/sqlite/node"
);
const {
  clearFakePlansForBot,
  FAKE_MODEL_ID,
  FAKE_PROVIDER_ID,
  queueFakeInput,
  registerFakeProvider,
} = await import("../src/fake-llm.ts");
const { toolRedactionHooks } = await import("../src/durable-tools.ts");

interface HarnessRunResult {
  status: string;
  assistantTexts: string[];
  allTexts: string[];
  toolCallNames: string[];
  assistantUsages: Array<{ input?: number; output?: number }>;
}

function textFromMessage(message: unknown): string {
  const msg = message as { content?: unknown };
  if (typeof msg.content === "string") return msg.content;
  if (!Array.isArray(msg.content)) return "";
  return msg.content
    .map((block) => {
      const item = block as { type?: unknown; text?: unknown };
      return item.type === "text" && typeof item.text === "string"
        ? item.text
        : "";
    })
    .join("\n");
}

async function runFakeHarness(input: {
  botId: string;
  anchor: string;
  directive?: Parameters<typeof queueFakeInput>[0]["directive"];
}): Promise<HarnessRunResult> {
  const stateDir = mkdtempSync(join(tmpdir(), "bots-fake-durable-run-"));
  const storagePath = join(stateDir, "harness.sqlite");
  const extensionName = `fake-test:${input.botId}`;
  const models = createModels();
  registerFakeProvider(models);
  const registry = createRegistry<never>();

  queueFakeInput({
    botId: input.botId,
    botName: "Durable Fake Bot",
    content: input.anchor,
    directive: input.directive ?? { delay_ms: 0, reply: "durable fake reply" },
  });

  const tool = {
    name: "shell",
    description: "Test shell tool",
    parameters: { type: "object", properties: {} },
    replay: "unsafe",
    async execute() {
      return { output: [{ type: "text", text: "real command output" }] };
    },
  } as never;

  registry.install({
    name: extensionName,
    tools: [tool],
    hooks: toolRedactionHooks(input.botId),
  });

  const storage = await openNodeSqliteStorage(storagePath);
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      settings: {
        extensions: [{ name: extensionName }],
        stream: { maxRetries: 0 },
        retry: { enabled: true, maxRetries: 1, baseDelayMs: 1 },
      },
    },
    BACKGROUND_CONTEXT,
  );
  harness.resume();

  try {
    const conversation = await harness.createConversation(
      { ownership: { kind: "ownerless" } },
      BACKGROUND_CONTEXT,
    );
    await conversation.configure(
      { model: { provider: FAKE_PROVIDER_ID, modelId: FAKE_MODEL_ID } },
      BACKGROUND_CONTEXT,
    );
    const submission = await conversation.submit(
      { type: "input", content: input.anchor },
      BACKGROUND_CONTEXT,
    );
    const settled = await submission.wait(BACKGROUND_CONTEXT);
    const view = await conversation.context(BACKGROUND_CONTEXT);

    return {
      status: settled.status,
      assistantTexts: view.messages
        .filter(
          (message) => (message as { role?: string }).role === "assistant",
        )
        .map(textFromMessage),
      assistantUsages: view.messages
        .filter(
          (message) => (message as { role?: string }).role === "assistant",
        )
        .map((message) => {
          const usage = (
            message as { usage?: { input?: number; output?: number } }
          ).usage;
          return { input: usage?.input, output: usage?.output };
        }),
      allTexts: view.messages.map(textFromMessage),
      toolCallNames: view.messages.flatMap((message) => {
        const content = (message as { content?: unknown }).content;
        if (!Array.isArray(content)) return [];
        return content
          .map((block) => {
            const item = block as { type?: unknown; name?: unknown };
            return item.type === "toolCall" && typeof item.name === "string"
              ? item.name
              : "";
          })
          .filter(Boolean);
      }),
    };
  } finally {
    await harness.close(BACKGROUND_CONTEXT);
    await storage.close(BACKGROUND_CONTEXT);
    clearFakePlansForBot(input.botId);
  }
}

test("fake provider drives a durable tool turn and overrides real output", async () => {
  const result = await runFakeHarness({
    botId: "durable-tool-bot",
    anchor: "[chat durable-tool]\nuse the scripted shell",
    directive: {
      delay_ms: 0,
      thinking: true,
      tool_calls: [{ name: "shell", output: "scripted durable output" }],
      reply: "finished with scripted output",
    },
  });

  assert.equal(result.status, "done");
  assert.deepEqual(result.toolCallNames, ["shell"]);
  assert.ok(
    result.assistantUsages.some(
      (usage) => usage.input === 50 && usage.output === 50,
    ),
    "fake assistant messages should carry default token usage",
  );
  assert.ok(
    result.allTexts.some((text) => text.includes("scripted durable output")),
    `expected scripted tool output in ${JSON.stringify(result.allTexts)}`,
  );
  assert.ok(
    !result.allTexts.some((text) => text.includes("real command output")),
    "the real tool result should be replaced before transcript projection",
  );
});

test("fake provider HTTP failures exercise durable retry and finish successfully", async () => {
  const result = await runFakeHarness({
    botId: "durable-retry-bot",
    anchor: "[chat durable-retry]\nfail once then reply",
    directive: {
      fail_http: 429,
      fail_times: 1,
      delay_ms: 0,
      reply: "recovered after retry",
    },
  });

  assert.equal(result.status, "done");
  assert.ok(
    result.assistantTexts.some((text) =>
      text.includes("recovered after retry"),
    ),
  );
});
