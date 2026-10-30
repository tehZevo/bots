export interface ToolCallTurn {
  name: string;
  input: unknown;
  output?: string;
}

export interface ChatTurn {
  role: string;
  text: string;
  thinking?: string;
  tool_calls?: ToolCallTurn[];
  injected?: boolean;
  source?: string;
}

function blocksOf(message: unknown): Record<string, unknown>[] {
  const content = (message as { content?: unknown } | null)?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? (content as Record<string, unknown>[]) : [];
}

function textOf(blocks: readonly Record<string, unknown>[]): string {
  return blocks
    .filter((block) => block?.type === "text")
    .map((block) => String(block.text ?? ""))
    .join("");
}

export function chatTurnsFromMessages(
  messages: readonly unknown[],
  liveOutputs?: ReadonlyMap<string, string>,
): ChatTurn[] {
  const turns: ChatTurn[] = [];
  const callsById = new Map<string, ToolCallTurn>();

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const role = (message as { role?: unknown }).role;
    const blocks = blocksOf(message);

    if (role === "toolResult") {
      const call = callsById.get(
        String((message as { toolCallId?: unknown }).toolCallId ?? ""),
      );
      if (call) {
        const output = textOf(blocks);
        call.output = (message as { isError?: boolean }).isError
          ? `error: ${output}`
          : output;
      }
      continue;
    }

    if (role === "assistant") {
      const turn: ChatTurn = { role: "assistant", text: "" };
      for (const block of blocks) {
        if (block?.type === "text") turn.text += String(block.text ?? "");
        else if (block?.type === "thinking") {
          turn.thinking = `${turn.thinking ?? ""}${String(block.thinking ?? "")}`;
        } else if (block?.type === "toolCall") {
          const call: ToolCallTurn = {
            name: String(block.name ?? "?"),
            input: block.arguments ?? {},
          };
          (turn.tool_calls ??= []).push(call);
          callsById.set(String(block.id), call);
        }
      }
      if (turn.text.trim() || turn.thinking?.trim() || turn.tool_calls) {
        turns.push(turn);
      }
      continue;
    }

    const raw = textOf(blocks);
    const injectedSource = /^\[(schedule|manual|webhook) [^\]]*\]\n/.exec(raw);
    const text = raw.replace(
      /^\[(schedule|manual|chat|webhook) [^\]]*\]\n/,
      "",
    );
    if (!text.trim()) continue;
    turns.push(
      injectedSource
        ? { role: "user", text, injected: true, source: injectedSource[1] }
        : { role: "user", text },
    );
  }

  if (liveOutputs) {
    for (const [callId, output] of liveOutputs) {
      const call = callsById.get(callId);
      if (call && call.output === undefined && output !== "")
        call.output = output;
    }
  }

  return turns;
}
