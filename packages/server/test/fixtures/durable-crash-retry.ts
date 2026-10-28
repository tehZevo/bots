import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import type {
  ConversationId,
  SubmissionId,
  TaskInspection,
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
  until?: number;
}

const storagePath = join(stateDir, "harness.sqlite");
const callsPath = join(stateDir, "model-calls.log");
const statePath = join(stateDir, "state.json");
const model = { provider: "faux", modelId: "retry-model" };
const restored =
  phase === "resume"
    ? (JSON.parse(readFileSync(statePath, "utf8")) as CrashState)
    : undefined;

const clock = restored?.until === undefined ? 0 : restored.until + 1_000;

const models = createModels();
const faux = fauxProvider({
  provider: "faux",
  models: [{ id: "retry-model" }],
});
models.setProvider(faux.provider);
const registry = createRegistry();

function retryCheckpoint(tasks: readonly TaskInspection[]) {
  for (const task of tasks) {
    const state = task.record.state as { status: string; checkpoint?: unknown };
    if (state.status !== "pending" && state.status !== "running") continue;
    const checkpoint = state.checkpoint as Record<string, unknown> | undefined;
    if (checkpoint?.phase === "retry") {
      return {
        attempt: Number(checkpoint.attempt),
        until: Number(checkpoint.until),
      };
    }
  }
  return undefined;
}

async function waitForRetry(harness: Harness) {
  for (let waited = 0; ; waited += 25) {
    if (waited > 10_000) throw new Error("retry was never scheduled");
    const checkpoint = retryCheckpoint(
      (await harness.inspect(BACKGROUND_CONTEXT)).tasks,
    );
    if (checkpoint !== undefined) return checkpoint;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
}

const storage = await openNodeSqliteStorage(storagePath);
const harness = await Harness.open(
  storage,
  {
    models,
    registry,
    now: () => clock,
    settings: {
      stream: { maxRetries: 0 },
      retry: { enabled: true, maxRetries: 1, baseDelayMs: 60_000 },
    },
  },
  BACKGROUND_CONTEXT,
);
harness.resume();

if (phase === "start") {
  faux.setResponses([
    () => {
      appendFileSync(callsPath, "model\n");
      return fauxAssistantMessage("", {
        stopReason: "error",
        errorMessage: "429 rate limit",
      });
    },
  ]);
  const conversation = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    BACKGROUND_CONTEXT,
  );
  await conversation.configure({ model }, BACKGROUND_CONTEXT);
  const submission = await conversation.submit(
    { type: "input", content: "retry the provider" },
    BACKGROUND_CONTEXT,
  );
  writeFileSync(
    statePath,
    JSON.stringify({
      conversationId: String(conversation.id),
      submissionId: String(submission.id),
    }),
  );

  const retry = await waitForRetry(harness);
  writeFileSync(
    statePath,
    JSON.stringify({
      conversationId: String(conversation.id),
      submissionId: String(submission.id),
      until: retry.until,
    }),
  );
  process.kill(process.pid, "SIGKILL");
} else {
  if (restored === undefined || restored.until === undefined) {
    throw new Error("retry state is incomplete");
  }

  faux.setResponses([
    () => {
      appendFileSync(callsPath, "model\n");
      return fauxAssistantMessage("recovered");
    },
  ]);
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

    const view = await conversation.context(BACKGROUND_CONTEXT);
    let finalText = "";
    let assistantMessages = 0;
    for (const message of view.messages) {
      if (message.role !== "assistant") continue;
      assistantMessages++;
      if (!Array.isArray(message.content)) continue;
      for (const block of message.content) {
        if ((block as { type?: string; text?: string }).type === "text") {
          finalText = (block as { text: string }).text;
        }
      }
    }

    process.stdout.write(
      `${JSON.stringify({ status: settled.status, calls: readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean).length, assistantMessages, finalText })}\n`,
    );
  } finally {
    if (timeout) clearTimeout(timeout);
    await harness.close(BACKGROUND_CONTEXT);
    await storage.close(BACKGROUND_CONTEXT);
  }
}
