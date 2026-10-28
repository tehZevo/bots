import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import type {
  ConversationId,
  SubmissionId,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

const [phase, stateDir = process.cwd()] = process.argv.slice(2);
if (phase !== "start" && phase !== "resume") {
  throw new Error(`unknown phase: ${String(phase)}`);
}

const storagePath = join(stateDir, "harness.sqlite");
const executionsPath = join(stateDir, "tool-executions.log");
const startedPath = join(stateDir, "started");
const statePath = join(stateDir, "state.json");
const model = { provider: "faux", modelId: "probe-model" };

const models = createModels();
const faux = fauxProvider({
  provider: "faux",
  models: [{ id: "probe-model" }],
});
models.setProvider(faux.provider);
const registry = createRegistry<ToolRegistration>();

const probe: ToolRegistration = {
  name: "crash_probe",
  description: "A side-effecting tool that is deliberately interrupted.",
  parameters: { type: "object", properties: {} },
  replay: "unsafe",
  async execute() {
    appendFileSync(executionsPath, "executed\n");
    writeFileSync(startedPath, "started\n");
    process.kill(process.pid, "SIGKILL");
    await new Promise(() => undefined);
    return { output: [{ type: "text", text: "never" }] };
  },
} as unknown as ToolRegistration;

registry.install({ name: "crash-test", tools: [probe] });

const storage = await openNodeSqliteStorage(storagePath);
const harness = await Harness.open(
  storage,
  {
    models,
    registry,
    settings: {
      extensions: [{ name: "crash-test" }],
      stream: { maxRetries: 0 },
      retry: { enabled: false, maxRetries: 0, baseDelayMs: 1 },
    },
  },
  BACKGROUND_CONTEXT,
);
harness.resume();

if (phase === "start") {
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("crash_probe", {}), {
      stopReason: "toolUse",
    }),
  ]);
  const conversation = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    BACKGROUND_CONTEXT,
  );
  await conversation.configure({ model }, BACKGROUND_CONTEXT);
  const submission = await conversation.submit(
    { type: "input", content: "run the probe" },
    BACKGROUND_CONTEXT,
  );
  writeFileSync(
    statePath,
    JSON.stringify({
      conversationId: String(conversation.id),
      submissionId: String(submission.id),
    }),
  );

  for (let waited = 0; !existsSync(startedPath); waited += 25) {
    if (waited > 10_000) throw new Error("tool execution never started");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
} else {
  faux.setResponses([fauxAssistantMessage("recovered")]);
  const state = JSON.parse(readFileSync(statePath, "utf8")) as {
    conversationId: string;
    submissionId: string;
  };
  const conversation = await harness.conversation(
    Number(state.conversationId) as unknown as ConversationId,
    BACKGROUND_CONTEXT,
  );
  if (!conversation) throw new Error("conversation disappeared");

  let timeout: NodeJS.Timeout | undefined;
  try {
    const submission = await harness.submission(
      state.submissionId as unknown as SubmissionId,
      BACKGROUND_CONTEXT,
    );
    if (!submission) throw new Error("submission disappeared");
    const settled = await Promise.race([
      submission.wait(BACKGROUND_CONTEXT),
      new Promise<never>((_, rejectTimeout) => {
        timeout = setTimeout(
          () => rejectTimeout(new Error("recovery timed out")),
          10_000,
        );
      }),
    ]);
    const contextView = await conversation.context(BACKGROUND_CONTEXT);
    let finalText = "";
    for (const message of contextView.messages) {
      if (message.role !== "assistant" || !Array.isArray(message.content))
        continue;
      for (const block of message.content) {
        if ((block as { type?: string; text?: string }).type === "text") {
          finalText = (block as { text: string }).text;
        }
      }
    }
    process.stdout.write(
      `${JSON.stringify({ status: settled.status, executions: readFileSync(executionsPath, "utf8").trim().split("\n").filter(Boolean).length, finalText })}\n`,
    );
  } finally {
    if (timeout) clearTimeout(timeout);
    await harness.close(BACKGROUND_CONTEXT);
    await storage.close(BACKGROUND_CONTEXT);
  }
}
