import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DEV_FAKE_LLM = "1";

const {
  applyFakeDirective,
  clearFakePlansForBot,
  FAKE_MODEL_ID,
  FAKE_PROVIDER_ID,
  fakeOpenAiModel,
  fakeToolResultOverride,
  parseFakeDirective,
  queueFakeInput,
  registerFakeProvider,
  stripFakeDirective,
} = await import("../src/fake-llm.ts");
const { createModels } = await import("@earendil-works/pi-ai/models");

interface FakeStreamResult {
  stopReason?: string;
  errorMessage?: string;
  content: unknown[];
  usage?: { input?: number; output?: number };
}

type FakeProvider = {
  streamSimple(
    model: unknown,
    context: unknown,
    options?: unknown,
  ): { result(): Promise<FakeStreamResult> };
};

function textOf(message: FakeStreamResult): string {
  return message.content
    .map((block) => {
      const item = block as { type?: unknown; text?: unknown };
      return item.type === "text" && typeof item.text === "string"
        ? item.text
        : "";
    })
    .join("");
}

function contextFor(anchor: string, continuation = false): unknown {
  const messages = [
    { role: "system", content: 'You are "Test Bot".\n' },
    { role: "user", content: anchor },
  ];
  if (continuation) {
    messages.push({
      role: "assistant",
      content: [{ type: "toolCall" }],
    } as never);
    messages.push({ role: "toolResult", content: [] } as never);
  }
  return { messages };
}

function provider(): FakeProvider {
  const models = createModels();
  registerFakeProvider(models);
  const registered = models.getProvider(FAKE_PROVIDER_ID);
  assert.ok(registered, "fake provider should be registered");
  return registered as unknown as FakeProvider;
}

test("fake directives parse and strip without affecting ordinary text", () => {
  const parsed = parseFakeDirective(
    '[[fake]] {"reply":"hi","tool_calls":[{"name":"shell","output":"done"}],"fail_http":429,"fail_times":2,"tokens_in":10} [[/fake]]',
  );
  assert.deepEqual(parsed, {
    reply: "hi",
    tool_calls: [{ name: "shell", output: "done" }],
    fail_http: 429,
    fail_times: 2,
    tokens_in: 10,
  });
  assert.equal(
    stripFakeDirective('[[fake]] {"reply":"x"} [[/fake]]\nhello'),
    "hello",
  );

  const applied = applyFakeDirective("plain question");
  assert.equal(applied.text, "plain question");
  assert.equal(applied.directive, null);
});

test("fake provider streams a default echo with usage", async () => {
  const anchor = "[chat test-default]\nplain";
  queueFakeInput({
    botId: "default-bot",
    botName: "Echo Bot",
    content: anchor,
  });
  const message = await provider()
    .streamSimple(fakeOpenAiModel(), contextFor(anchor))
    .result();

  assert.equal(message.stopReason, "stop");
  assert.equal(textOf(message), "FAKE OK (Echo Bot)");
  assert.deepEqual(
    { input: message.usage?.input, output: message.usage?.output },
    { input: 50, output: 50 },
  );
});

test("fake provider fails the configured number of requests before succeeding", async () => {
  const botId = "retry-bot";
  const anchor = "[chat test-retry]\nfail then reply";
  queueFakeInput({
    botId,
    botName: "Retry Bot",
    content: anchor,
    directive: {
      fail_http: 429,
      fail_times: 2,
      delay_ms: 0,
      reply: "recovered",
    },
  });

  const first = await provider()
    .streamSimple(fakeOpenAiModel(), contextFor(anchor))
    .result();
  assert.equal(first.stopReason, "error");
  assert.match(first.errorMessage ?? "", /HTTP 429/);

  const second = await provider()
    .streamSimple(fakeOpenAiModel(), contextFor(anchor))
    .result();
  assert.equal(second.stopReason, "error");
  assert.match(second.errorMessage ?? "", /HTTP 429/);

  const third = await provider()
    .streamSimple(fakeOpenAiModel(), contextFor(anchor))
    .result();
  assert.equal(third.stopReason, "stop");
  assert.equal(textOf(third), "recovered");
});

test("fake provider emits real tool turns and overrides matching output", async () => {
  const botId = "tool-bot";
  const anchor = "[chat test-tool]\nuse the fake shell";
  queueFakeInput({
    botId,
    botName: "Tool Bot",
    content: anchor,
    directive: {
      delay_ms: 0,
      tool_calls: [{ name: "shell", output: "scripted output" }],
      reply: "tool finished",
    },
  });

  const first = await provider()
    .streamSimple(fakeOpenAiModel(), contextFor(anchor))
    .result();
  assert.equal(first.stopReason, "toolUse");
  const call = first.content.find(
    (block) => (block as { type?: unknown }).type === "toolCall",
  ) as { name?: string } | undefined;
  assert.equal(call?.name, "shell");

  const overridden = fakeToolResultOverride(
    botId,
    { name: "shell" },
    {
      output: [{ type: "text", text: "real command output" }],
    },
  );
  const blocks = overridden?.output as { text?: string }[] | undefined;
  assert.equal(blocks?.[0]?.text, "scripted output");

  const second = await provider()
    .streamSimple(fakeOpenAiModel(), contextFor(anchor, true))
    .result();
  assert.equal(second.stopReason, "stop");
  assert.equal(textOf(second), "tool finished");
});

test("fake provider hangs until interrupted", async () => {
  const botId = "hang-bot";
  const anchor = "[chat test-hang]\nwait forever";
  queueFakeInput({
    botId,
    botName: "Hang Bot",
    content: anchor,
    directive: { hang: true },
  });

  const controller = new AbortController();
  const pending = provider()
    .streamSimple(fakeOpenAiModel(), contextFor(anchor), {
      signal: controller.signal,
    })
    .result();
  setTimeout(() => controller.abort(), 10);
  const message = await pending;

  assert.equal(message.stopReason, "aborted");
  clearFakePlansForBot(botId);
});

test("fake model id is registered through the fake provider", () => {
  const models = createModels();
  registerFakeProvider(models);
  assert.ok(models.getModel(FAKE_PROVIDER_ID, FAKE_MODEL_ID));
});
