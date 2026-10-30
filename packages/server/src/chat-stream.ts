import type {
  AgentEvent,
  EntryRecord,
  MessageChange,
  SnapshotEvent,
} from "@earendil-works/pi-durable";
import { type ChatTurn, chatTurnsFromMessages } from "./chat-transcript.ts";

const LLM_ROLES = new Set(["user", "assistant", "toolResult"]);

export interface ChatStreamState {
  turns: ChatTurn[];
  working: boolean;
}

function clone<T>(value: T): T {
  return structuredClone(value) as T;
}

function assistantContent(
  message: Record<string, unknown>,
): Record<string, unknown>[] {
  const content = Array.isArray(message.content) ? message.content : [];
  return content as Record<string, unknown>[];
}

export class ChatStreamReducer {
  private entries: EntryRecord[] = [];
  private readonly seenEntries = new Set<string>();
  private pendingMessage?: Record<string, unknown>;
  private readonly liveOutputs = new Map<string, string>();
  private runActive = false;
  private generationActive = false;
  private queuedInputs = 0;

  setEntries(entries: Iterable<EntryRecord>): void {
    this.entries = [];
    this.seenEntries.clear();
    for (const entry of entries) this.addEntry(entry);
  }

  addEntry(entry: EntryRecord): void {
    const id = String(entry.id);
    if (this.seenEntries.has(id)) return;
    this.seenEntries.add(id);
    this.entries.push(entry);
  }

  applySnapshot(snapshot: SnapshotEvent): void {
    this.runActive = Boolean(snapshot.run);
    this.generationActive = Boolean(snapshot.generation);
    this.queuedInputs = snapshot.inbox.length;
    this.liveOutputs.clear();
    for (const tool of snapshot.tools) {
      if (tool.output !== undefined)
        this.liveOutputs.set(tool.callId, tool.output);
    }
    if (snapshot.generation?.message) {
      this.pendingMessage = clone(
        snapshot.generation.message as unknown as Record<string, unknown>,
      );
    } else {
      this.pendingMessage = undefined;
    }
  }

  applyEvent(event: AgentEvent): void {
    switch (event.type) {
      case "snapshot":
        this.applySnapshot(event);
        break;
      case "run_start":
        this.runActive = true;
        this.liveOutputs.clear();
        break;
      case "run_end":
        this.runActive = false;
        this.generationActive = false;
        this.queuedInputs = 0;
        this.pendingMessage = undefined;
        break;
      case "message_start": {
        const message = event.message as unknown as Record<string, unknown>;
        if (message.role === "assistant") {
          this.pendingMessage = clone(message);
          this.generationActive = true;
        }
        break;
      }
      case "message_update": {
        this.applyMessageUpdate(event.changes);
        this.generationActive = true;
        break;
      }
      case "message_end":
        this.addEntry(event.entry);
        this.pendingMessage = undefined;
        break;
      case "entry_appended":
        this.addEntry(event.entry);
        break;
      case "tool_execution_start":
        if (!event.parentToolCallId) {
          this.runActive = true;
          if (!this.liveOutputs.has(event.toolCallId))
            this.liveOutputs.set(event.toolCallId, "");
        }
        break;
      case "tool_execution_update":
        if (!event.parentToolCallId && event.output) {
          const patch = event.output;
          let current = this.liveOutputs.get(event.toolCallId) ?? "";
          if ("set" in patch) {
            current = patch.set;
          } else {
            if (patch.trimStart) {
              current = current.slice(Math.max(0, patch.trimStart));
            }
            current += patch.append ?? "";
          }
          this.liveOutputs.set(event.toolCallId, current);
        }
        break;
      case "inbox_update":
        this.queuedInputs = event.items.length;
        break;
    }
  }

  state(): ChatStreamState {
    const messages: unknown[] = [];
    for (const entry of this.entries) {
      for (const message of entry.model ?? []) {
        if (LLM_ROLES.has((message as { role?: string }).role ?? "")) {
          messages.push(message);
        }
      }
    }
    if (this.pendingMessage) messages.push(this.pendingMessage);
    return {
      turns: chatTurnsFromMessages(messages, this.liveOutputs),
      working: this.runActive || this.generationActive || this.queuedInputs > 0,
    };
  }

  private applyMessageUpdate(changes: readonly MessageChange[]): void {
    if (!this.pendingMessage) {
      this.pendingMessage = { role: "assistant", content: [] };
    } else {
      const message = { ...this.pendingMessage };
      message.content = [...assistantContent(this.pendingMessage)];
      this.pendingMessage = message;
    }

    for (const change of changes) {
      if (change.type === "message") {
        this.pendingMessage = clone(
          change.message as unknown as Record<string, unknown>,
        );
        continue;
      }

      const content = assistantContent(this.pendingMessage);
      while (content.length <= change.contentIndex) content.push({});

      if (change.type === "text_start" || change.type === "thinking_start") {
        content[change.contentIndex] = clone(
          change.block as unknown as Record<string, unknown>,
        );
      } else if (change.type === "toolcall_start") {
        const block = clone(change.block as unknown as Record<string, unknown>);
        if (!block.arguments) block.arguments = {};
        content[change.contentIndex] = block;
      } else if (change.type === "block") {
        content[change.contentIndex] = clone(
          change.block as unknown as Record<string, unknown>,
        );
      } else if (change.type === "text_delta") {
        const existing = content[change.contentIndex];
        if (existing?.type === "text") {
          existing.text = String(existing.text ?? "") + change.delta;
        } else {
          content[change.contentIndex] = { type: "text", text: change.delta };
        }
      } else if (change.type === "thinking_delta") {
        const existing = content[change.contentIndex];
        if (existing?.type === "thinking") {
          existing.thinking = String(existing.thinking ?? "") + change.delta;
        } else {
          content[change.contentIndex] = {
            type: "thinking",
            thinking: change.delta,
          };
        }
      } else if (change.type === "toolcall_delta") {
        const existing = content[change.contentIndex];
        if (!existing || existing.type !== "toolCall") {
          content[change.contentIndex] = {
            type: "toolCall",
            id: "",
            name: "",
            arguments: {},
          };
        }
      }

      this.pendingMessage.content = content;
    }
  }
}
