import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import {
  appendMessages,
  type BotRow,
  loadMessages,
  replaceMessages,
  teammatesOf,
} from "./db.ts";
import { activeContextMessages } from "./durable-conversations.ts";
import {
  deliverDm as _deliverDm,
  injectMessage as _injectMessage,
  interruptBot as _interruptBot,
  isLoopActive as _isLoopActive,
  resetBotRuntime as _resetBotRuntime,
  resumePendingInjections as _resumePendingInjections,
  stopAllLoops as _stopAllLoops,
} from "./durable-runs.ts";
import { resolveDefault } from "./llm.ts";
import { effectiveSystemPrompt } from "./prompt.ts";
import { redactMessageForBot } from "./redact.ts";
import { grantedSkills } from "./skillfiles.ts";
import { buildTools } from "./tools.ts";

export type { InjectResult } from "./durable-runs.ts";
export { effectiveSystemPrompt };

const LLM_ROLES = new Set(["user", "assistant", "toolResult"]);

export interface ContextBreakdown {
  context_window: number | null;
  categories: {
    system_prompt: number;
    tools: number;
    conversation: number;
  };
  used: number;
  free: number | null;
}

// specs/context/usage-breakdown.md — estimator-based split, never calls the model.
export async function estimateContext(bot: BotRow): Promise<ContextBreakdown> {
  const prompt = estimateTokens([
    {
      role: "system",
      content: effectiveSystemPrompt(bot),
      timestamp: 0,
    } as unknown as AgentMessage,
  ]);
  const dm = teammatesOf(bot.id).length > 0 ? () => "ok" : undefined;
  const toolDefs = buildTools(bot.id, dm, grantedSkills(bot)).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
  const tools = Math.floor(JSON.stringify(toolDefs).length / 4);
  const durableHistory = await activeContextMessages(bot.id);
  const history: AgentMessage[] =
    durableHistory ??
    loadMessages(bot.id)
      .map((row) => JSON.parse(row.payload) as AgentMessage)
      .filter((message) => LLM_ROLES.has((message as Message).role));
  const conversation = estimateTokens(history);
  const used = prompt + tools + conversation;
  const llm = resolveDefault(bot.model_id);
  const window = llm ? llm.model.contextWindow : null;
  return {
    context_window: window,
    categories: { system_prompt: prompt, tools, conversation },
    used,
    free: window == null ? null : Math.max(0, window - used),
  };
}

export function createMessagePersistence(botId: string, runId: string | null) {
  let persisted = new WeakSet<AgentMessage>();

  return {
    markPersisted(messages: readonly AgentMessage[]): void {
      for (const message of messages) persisted.add(message);
    },

    appendUnpersisted(messages: readonly AgentMessage[]): void {
      const seen = new Set<AgentMessage>();
      const entries: { role: string; payload: unknown }[] = [];
      for (const message of messages) {
        const role = (message as Message).role;
        if (!LLM_ROLES.has(role) || persisted.has(message) || seen.has(message))
          continue;
        seen.add(message);
        redactMessageForBot(botId, message);
        entries.push({ role, payload: message });
      }
      if (entries.length === 0) return;
      appendMessages(botId, runId, entries);
      for (const entry of entries) persisted.add(entry.payload as AgentMessage);
    },

    replacePersisted(messages: readonly AgentMessage[]): void {
      const replacement = new WeakSet<AgentMessage>();
      const entries: { role: string; payload: unknown }[] = [];
      for (const message of messages) {
        const role = (message as Message).role;
        if (!LLM_ROLES.has(role) || replacement.has(message)) continue;
        replacement.add(message);
        redactMessageForBot(botId, message);
        entries.push({ role, payload: message });
      }
      replaceMessages(botId, runId, entries);
      persisted = replacement;
    },
  };
}

function estimateTokens(messages: AgentMessage[]): number {
  let chars = 0;
  for (const message of messages) chars += JSON.stringify(message).length;
  return Math.floor(chars / 4);
}

export const deliverDm = _deliverDm;
export const injectMessage = _injectMessage;
export const interruptBot = _interruptBot;
export const isLoopActive = _isLoopActive;
export const resetBotRuntime = _resetBotRuntime;
export const resumePendingInjections = _resumePendingInjections;
export const stopAllLoops = _stopAllLoops;
