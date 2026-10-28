import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Message } from "@earendil-works/pi-ai";
import type {
  Conversation,
  ConversationId,
  EntryId,
  EntryRecord,
  Harness,
} from "@earendil-works/pi-durable";
import {
  appendMessages,
  deleteBotConversation,
  getBotConversation,
  setBotConversation,
} from "./db.ts";
import { BOTS_PROVIDER_ID } from "./pi-provider.ts";

const LLM_ROLES = new Set(["user", "assistant", "toolResult"]);
const PAGE_SIZE = 1000;

export const HISTORY_ENTRY_KIND = "bots.history";

function isLlmMessage(message: Message): boolean {
  return LLM_ROLES.has(message.role);
}

async function scanEntries(
  conversation: Conversation,
): Promise<readonly EntryRecord[]> {
  const entries: EntryRecord[] = [];
  let cursor: Awaited<ReturnType<Conversation["entries"]>>["next"];
  do {
    const page = await conversation.entries(
      { order: "ascending" },
      PAGE_SIZE,
      cursor,
      BACKGROUND_CONTEXT,
    );
    entries.push(...page.items);
    cursor = page.next;
  } while (cursor !== undefined);
  return entries;
}

export async function appendHistoryEntries(
  conversation: Conversation,
  messages: readonly Message[],
): Promise<void> {
  if (messages.length === 0) return;
  await conversation.commit(async (tx) => {
    for (const message of messages) {
      await tx.appendEntry(conversation.id, {
        kind: HISTORY_ENTRY_KIND,
        model: [message],
      });
    }
  }, BACKGROUND_CONTEXT);
}

export async function ensureBotConversation(
  harness: Harness,
  botId: string,
  modelId: string,
  history: readonly Message[] = [],
): Promise<Conversation> {
  const mapping = getBotConversation(botId);
  if (mapping) {
    const existing = await harness.conversation(
      Number(mapping) as unknown as ConversationId,
      BACKGROUND_CONTEXT,
    );
    if (existing) return existing;
    deleteBotConversation(botId);
  }

  const conversation = await harness.createConversation(
    {
      ownership: { kind: "ownerless" },
      agent: { model: { provider: BOTS_PROVIDER_ID, modelId } },
    },
    BACKGROUND_CONTEXT,
  );
  setBotConversation(botId, String(conversation.id));
  await appendHistoryEntries(conversation, history.filter(isLlmMessage));
  return conversation;
}

export async function readConversationMessages(
  conversation: Conversation,
): Promise<Message[]> {
  const entries = await scanEntries(conversation);
  const messages: Message[] = [];
  for (const entry of entries) {
    if (!entry.model) continue;
    for (const message of entry.model) {
      if (isLlmMessage(message)) messages.push(message);
    }
  }
  return messages;
}

export class DurableMessageMirror {
  private readonly seen = new Set<string>();

  constructor(private readonly conversation: Conversation) {}

  async initialize(): Promise<void> {
    for (const entry of await scanEntries(this.conversation)) {
      this.seen.add(entry.id as unknown as string);
    }
  }

  async appendNewMessages(
    botId: string,
    runId: string | null,
  ): Promise<number> {
    const entries = await scanEntries(this.conversation);
    const fresh: { role: string; payload: unknown }[] = [];
    for (const entry of entries) {
      if (this.seen.has(entry.id as unknown as string)) continue;
      this.seen.add(entry.id as unknown as string);
      for (const message of entry.model ?? []) {
        if (!isLlmMessage(message)) continue;
        fresh.push({ role: message.role, payload: message });
      }
    }
    if (fresh.length > 0) appendMessages(botId, runId, fresh);
    return fresh.length;
  }
}

export function lastAssistantTextFromMessages(
  messages: readonly Message[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { text: string }).text)
      .join("\n");
    if (text) return text;
  }
  return null;
}

export type { EntryId };
