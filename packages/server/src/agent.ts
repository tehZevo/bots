// Specs: specs/agent-loop/run-execution.md, specs/memory/conversation.md
import type { AgentMessage, StreamFn } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai";
import { streamSimple as openaiStreamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import { config } from "./config.ts";
import {
  appendMessage,
  type BotRow,
  clearMessages,
  finishRun,
  loadMessages,
  updateBot,
} from "./db.ts";
import { resolveModel } from "./llm.ts";
import { buildTools } from "./tools.ts";

export interface RunResult {
  status: "ok" | "error";
  output: string | null;
  error: string | null;
}

function estimateTokens(messages: AgentMessage[]): number {
  let chars = 0;
  for (const message of messages) chars += JSON.stringify(message).length;
  return Math.floor(chars / 4);
}

function toTranscriptText(messages: AgentMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const role = (message as Message).role ?? "unknown";
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") {
      lines.push(`${role}: ${content}`);
    } else if (Array.isArray(content)) {
      for (const block of content as {
        type: string;
        text?: string;
        toolName?: string;
      }[]) {
        if (block.type === "text" && block.text)
          lines.push(`${role}: ${block.text}`);
        if (block.type === "toolCall")
          lines.push(`${role}: [called tool ${block.toolName ?? "?"}]`);
        if (block.type === "toolResult")
          lines.push(
            `tool-result${block.toolName ? ` (${block.toolName})` : ""}: ${(block.text ?? "").slice(0, 500)}`,
          );
      }
    }
  }
  return lines.join("\n").slice(0, 24_000);
}

const streamFn: StreamFn = (model, context, options) =>
  openaiStreamSimple(model as never, context, {
    ...options,
    apiKey: config.llm.apiKey,
  });

async function summarize(messages: AgentMessage[]): Promise<string> {
  const model = resolveModel(null);
  const response = await openaiStreamSimple(
    model,
    normalizeContext({
      messages: [
        {
          role: "user",
          content: `Summarize the following agent conversation into a compact running memory. Preserve durable facts, decisions, open threads, and anything the bot must remember for future runs.\n\n${toTranscriptText(messages)}`,
          timestamp: Date.now(),
        },
      ],
    }),
    { apiKey: config.llm.apiKey },
  ).result();
  const text = response.content
    .filter(
      (block): block is { type: "text"; text: string } => block.type === "text",
    )
    .map((block) => block.text)
    .join("\n");
  if (response.stopReason === "error" || !text)
    throw new Error(response.errorMessage ?? "summarization failed");
  return text;
}

const LLM_ROLES = new Set(["user", "assistant", "toolResult"]);

export async function runBot(
  bot: BotRow,
  runId: string,
  trigger: "schedule" | "manual",
): Promise<RunResult> {
  const model = resolveModel(bot.model_id);
  const history: AgentMessage[] = loadMessages(bot.id)
    .map((row) => JSON.parse(row.payload) as AgentMessage)
    .filter((message) => LLM_ROLES.has((message as Message).role));

  let savedCount = 0;
  const persistNew = (messages: readonly AgentMessage[]): boolean => {
    if (messages.length < savedCount) {
      clearMessages(bot.id);
      savedCount = 0;
    }
    for (let i = savedCount; i < messages.length; i++) {
      const message = messages[i];
      if (!LLM_ROLES.has((message as Message).role)) continue;
      appendMessage(bot.id, runId, (message as Message).role, message);
    }
    savedCount = messages.length;
    return true;
  };

  const agent = new Agent({
    streamFn,
    getApiKey: () => config.llm.apiKey,
    initialState: {
      systemPrompt: bot.system_prompt || "You are a helpful autonomous bot.",
      model,
      tools: buildTools(bot.id),
      messages: history,
    },
    transformContext: async (messages) => {
      if (
        estimateTokens(messages) < config.compaction.tokenThreshold ||
        messages.length <= config.compaction.keepRecent + 2
      ) {
        return messages;
      }
      const keep = messages.slice(-config.compaction.keepRecent);
      const drop = messages.slice(0, -config.compaction.keepRecent);
      try {
        const summary = await summarize(drop);
        const compacted: AgentMessage[] = [
          {
            role: "user",
            content: `[Running memory — compressed summary of ${drop.length} earlier messages]\n${summary}`,
            timestamp: Date.now(),
          } as AgentMessage,
          ...keep,
        ];
        persistNew(compacted);
        return compacted;
      } catch {
        return messages;
      }
    },
  });

  let lastAssistantText: string | null = null;

  try {
    await agent.prompt(
      `[bot run ${new Date().toISOString()} trigger=${trigger}]\n${bot.task}`,
    );
    const messages = agent.state.messages;
    persistNew(messages);

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i] as Message;
      if (message.role !== "assistant") continue;
      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => (block as { text: string }).text)
        .join("\n");
      if (text) {
        lastAssistantText = text;
        break;
      }
    }

    if (agent.state.errorMessage) {
      finishRun(runId, "error", lastAssistantText, agent.state.errorMessage);
      return {
        status: "error",
        output: lastAssistantText,
        error: agent.state.errorMessage,
      };
    }
    finishRun(runId, "ok", lastAssistantText, null);
    updateBot(bot.id, { last_run_at: Date.now() });
    return { status: "ok", output: lastAssistantText, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishRun(runId, "error", lastAssistantText, message);
    return { status: "error", output: lastAssistantText, error: message };
  }
}
