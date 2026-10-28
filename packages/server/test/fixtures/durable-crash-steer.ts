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

interface CrashState {
  conversationId: string;
  submissionId: string;
  steerSubmissionId: string;
}

const storagePath = join(stateDir, "harness.sqlite");
const executionsPath = join(stateDir, "tool-executions.log");
const startedPath = join(stateDir, "started");
const statePath = join(stateDir, "state.json");
const model = { provider: "faux", modelId: "steer-model" };

const models = createModels();
const faux = fauxProvider({
  provider: "faux",
  models: [{ id: "steer-model" }],
});
models.setProvider(faux.provider);
const registry = createRegistry<ToolRegistration>();

registry.install({
  name: "steer-test",
  tools: [
    {
      name: "hang_probe",
      description: "A side-effecting tool that remains in flight.",
      parameters: { type: "object", properties: {} },
      replay: "unsafe",
      async execute() {
        appendFileSync(executionsPath, "executed\n");
        writeFileSync(startedPath, "started\n");
        await new Promise(() => undefined);
        return { output: [{ type: "text", text: "never" }] };
      },
    } as unknown as ToolRegistration,
  ],
});

const restored =
  phase === "resume"
    ? (JSON.parse(readFileSync(statePath, "utf8")) as CrashState)
    : undefined;
if (phase === "resume") {
  faux.setResponses([fauxAssistantMessage("recovered")]);
}

const storage = await openNodeSqliteStorage(storagePath);
const harness = await Harness.open(
  storage,
  {
    models,
    registry,
    settings: {
      extensions: [{ name: "steer-test" }],
      stream: { maxRetries: 0 },
      retry: { enabled: false, maxRetries: 0, baseDelayMs: 1 },
    },
  },
  BACKGROUND_CONTEXT,
);

if (phase === "start") {
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("hang_probe", {}), {
      stopReason: "toolUse",
    }),
  ]);
}
harness.resume();

if (phase === "start") {
  const conversation = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    BACKGROUND_CONTEXT,
  );
  await conversation.configure({ model }, BACKGROUND_CONTEXT);
  const submission = await conversation.submit(
    { type: "input", content: "run the probe", requestId: "run" },
    BACKGROUND_CONTEXT,
  );

  for (let waited = 0; !existsSync(startedPath); waited += 25) {
    if (waited > 10_000) throw new Error("tool execution never started");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }

  const steer = await conversation.submit(
    {
      type: "input",
      content: "steer please",
      whenBusy: "steer",
      requestId: "steer",
    },
    BACKGROUND_CONTEXT,
  );

  for (let waited = 0; ; waited += 25) {
    if (waited > 10_000) throw new Error("steer was never committed");
    const record = await storage.submissionByRequest(
      conversation.id,
      "steer",
      BACKGROUND_CONTEXT,
    );
    if (record?.status === "queued" || record?.status === "placed") break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }

  writeFileSync(
    statePath,
    JSON.stringify({
      conversationId: String(conversation.id),
      submissionId: String(submission.id),
      steerSubmissionId: String(steer.id),
    }),
  );
  process.kill(process.pid, "SIGKILL");
} else {
  if (restored === undefined) throw new Error("steer state is missing");

  const conversation = await harness.conversation(
    Number(restored.conversationId) as unknown as ConversationId,
    BACKGROUND_CONTEXT,
  );
  if (!conversation) throw new Error("conversation disappeared");

  let timeout: NodeJS.Timeout | undefined;
  try {
    const submission = await harness.submission(
      restored.submissionId as unknown as SubmissionId,
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

    await conversation.waitForIdle(BACKGROUND_CONTEXT);
    const steerRecord = await storage.submissionByRequest(
      conversation.id,
      "steer",
      BACKGROUND_CONTEXT,
    );
    const view = await conversation.context(BACKGROUND_CONTEXT);
    let finalText = "";
    let steerMessages = 0;
    for (const message of view.messages) {
      if (message.role === "assistant" && Array.isArray(message.content)) {
        for (const block of message.content) {
          if ((block as { type?: string; text?: string }).type === "text") {
            finalText = (block as { text: string }).text;
          }
        }
      }
      const content =
        typeof message.content === "string" ? message.content : undefined;
      if (message.role === "user" && content?.includes("steer please")) {
        steerMessages++;
      } else if (message.role === "user" && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (
            (block as { type?: string; text?: string }).text?.includes(
              "steer please",
            )
          ) {
            steerMessages++;
          }
        }
      }
    }

    process.stdout.write(
      `${JSON.stringify({ status: settled.status, executions: readFileSync(executionsPath, "utf8").trim().split("\n").filter(Boolean).length, steerStatus: steerRecord?.status ?? null, steerMessages, finalText })}\n`,
    );
  } finally {
    if (timeout) clearTimeout(timeout);
    await harness.close(BACKGROUND_CONTEXT);
    await storage.close(BACKGROUND_CONTEXT);
  }
}
