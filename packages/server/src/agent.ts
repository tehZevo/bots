import { randomUUID } from "node:crypto";
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
  getRole,
  insertRun,
  loadMessages,
} from "./db.ts";
import { type ResolvedLlm, resolveDefault } from "./llm.ts";
import { buildTools } from "./tools.ts";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful autonomous bot.";

function effectiveSystemPrompt(bot: BotRow): string {
  const role = bot.role_id ? getRole(bot.role_id) : undefined;
  const parts = [bot.system_prompt.trim(), role?.instructions.trim()].filter(
    Boolean,
  );
  return parts.join("\n\n") || DEFAULT_SYSTEM_PROMPT;
}
const LLM_ROLES = new Set(["user", "assistant", "toolResult"]);

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

function makeStreamFn(llm: ResolvedLlm): StreamFn {
  return (model, context, options) =>
    openaiStreamSimple(model as never, context, {
      ...options,
      apiKey: llm.apiKey,
    });
}

async function summarize(
  messages: AgentMessage[],
  llm: ResolvedLlm,
): Promise<string> {
  const response = await openaiStreamSimple(
    llm.model,
    normalizeContext({
      messages: [
        {
          role: "user",
          content: `Summarize the following agent conversation into a compact running memory. Preserve durable facts, decisions, open threads, and anything the bot must remember for future runs.\n\n${toTranscriptText(messages)}`,
          timestamp: Date.now(),
        },
      ],
    }),
    { apiKey: llm.apiKey },
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

function lastAssistantText(messages: readonly AgentMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as Message;
    if (message.role !== "assistant") continue;
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { text: string }).text)
      .join("\n");
    if (text) return text;
  }
  return null;
}

interface LiveLoop {
  agent: Agent;
  runId: string;
  stopped: boolean;
}

const liveLoops = new Map<string, LiveLoop>();

export interface InjectResult {
  runId: string;
  steered: boolean;
}

function startLoop(
  bot: BotRow,
  runId: string,
  firstMessage: AgentMessage,
  llm: ResolvedLlm,
) {
  const model = llm.model;
  const history = loadMessages(bot.id)
    .map((row) => JSON.parse(row.payload) as AgentMessage)
    .filter((message) => LLM_ROLES.has((message as Message).role));

  let savedCount = history.length;
  const persistNew = (messages: readonly AgentMessage[]): void => {
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
  };

  const agent = new Agent({
    streamFn: makeStreamFn(llm),
    getApiKey: () => llm.apiKey,
    steeringMode: "all",
    initialState: {
      systemPrompt: effectiveSystemPrompt(bot),
      model,
      tools: buildTools(bot.id),
      messages: history,
    },
    transformContext: async (messages) => {
      const budget =
        config.compaction.tokenThreshold ??
        Math.floor(model.contextWindow * config.compaction.ratio);
      if (
        estimateTokens(messages) < budget ||
        messages.length <= config.compaction.keepRecent + 2
      ) {
        return messages;
      }
      const keep = messages.slice(-config.compaction.keepRecent);
      const drop = messages.slice(0, -config.compaction.keepRecent);
      try {
        const summary = await summarize(drop, llm);
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

  const loop: LiveLoop = { agent, runId, stopped: false };
  liveLoops.set(bot.id, loop);

  void (async () => {
    try {
      await agent.prompt(firstMessage);
      while (!loop.stopped && agent.hasQueuedMessages()) await agent.continue();
      persistNew(agent.state.messages);
      if (loop.stopped) {
        finishRun(
          runId,
          "error",
          lastAssistantText(agent.state.messages),
          "interrupted",
        );
        return;
      }
      const messages = agent.state.messages;
      const text = lastAssistantText(messages);
      if (agent.state.errorMessage) {
        finishRun(runId, "error", text, agent.state.errorMessage);
      } else {
        finishRun(runId, "ok", text, null);
      }
    } catch (err) {
      let partial: string | null = null;
      try {
        partial = lastAssistantText(agent.state.messages);
      } catch {
        // state unreadable; report without partial output
      }
      finishRun(
        runId,
        "error",
        partial,
        loop.stopped
          ? "interrupted"
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      liveLoops.delete(bot.id);
    }
  })();
}

export function isLoopActive(botId: string): boolean {
  return liveLoops.has(botId);
}

export function injectMessage(
  bot: BotRow,
  text: string,
  kind: "schedule" | "manual" | "chat" | "webhook",
): InjectResult {
  const message = {
    role: "user",
    content: `[${kind} ${new Date().toISOString()}]\n${text}`,
    timestamp: Date.now(),
  } as AgentMessage;
  const live = liveLoops.get(bot.id);
  if (live) {
    live.agent.steer(message);
    return { runId: live.runId, steered: true };
  }
  const runId = randomUUID();
  const llm = resolveDefault(bot.model_id);
  if (!llm) {
    insertRun({
      id: runId,
      bot_id: bot.id,
      status: "error",
      trigger: kind,
      started_at: Date.now(),
      finished_at: Date.now(),
      output: null,
      error: "no model configured",
    });
    return { runId, steered: false };
  }
  insertRun({
    id: runId,
    bot_id: bot.id,
    status: "running",
    trigger: kind,
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });
  startLoop(bot, runId, message, llm);
  return { runId, steered: false };
}

export function interruptBot(botId: string): boolean {
  const live = liveLoops.get(botId);
  if (!live) return false;
  live.stopped = true;
  live.agent.abort();
  liveLoops.delete(botId);
  return true;
}

export function resetBotRuntime(botId: string): void {
  const live = liveLoops.get(botId);
  if (live) {
    live.agent.abort();
    liveLoops.delete(botId);
  }
}
