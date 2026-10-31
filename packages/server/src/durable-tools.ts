import type {
  HookRegistration,
  ToolExecutionApi,
  ToolExecutionResult,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import { logAudit } from "./audit.ts";
import type { SkillRow } from "./db.ts";
import { getBot } from "./db.ts";
import { fakeToolResultOverride } from "./fake-llm.ts";
import { redactText } from "./redact.ts";
import { buildTools } from "./tools.ts";

export const TOOL_TASK_NAME = "pi.tool";

function mapToolResult(value: unknown): ToolExecutionResult {
  const result = value as {
    content?: unknown;
    details?: Record<string, unknown>;
  };
  return {
    output: result.content as never,
    details: (result.details ?? {}) as never,
  } satisfies ToolExecutionResult;
}

export function redactedToolResult(
  botId: string,
  result: ToolExecutionResult,
): ToolExecutionResult {
  const output = result.output;
  if (Array.isArray(output)) {
    return {
      ...result,
      output: output.map((block) => {
        const textBlock = block as { type?: string; text?: string };
        return textBlock?.type === "text" && typeof textBlock.text === "string"
          ? ({ ...textBlock, text: redactText(botId, textBlock.text) } as never)
          : block;
      }),
    };
  }
  if (typeof output === "string") {
    return { ...result, output: redactText(botId, output) as never };
  }
  return result;
}

function toolCallSummary(result: ToolExecutionResult): string {
  const out = result?.output;
  let text = "";
  if (typeof out === "string") text = out;
  else if (Array.isArray(out))
    text = out
      .map((b) => (b as { text?: unknown })?.text ?? "")
      .filter((t) => typeof t === "string")
      .join(" ");
  return String(text).replace(/\s+/g, " ").slice(0, 200);
}

export function toolRedactionHooks(botId: string): HookRegistration[] {
  return [
    {
      task: TOOL_TASK_NAME,
      handlers: {
        afterTool(call: unknown, result: ToolExecutionResult) {
          logAudit({
            actor: {
              kind: "bot",
              id: botId,
              name: getBot(botId)?.name ?? botId,
            },
            action: "tool.call",
            targetKind: "tool",
            targetName: (call as { name?: unknown })?.name
              ? String((call as { name?: unknown }).name)
              : null,
            summary: toolCallSummary(result),
          });
          const overridden = fakeToolResultOverride(
            botId,
            call as { name?: unknown },
            result,
          );
          return redactedToolResult(
            botId,
            (overridden ?? result) as ToolExecutionResult,
          );
        },
      },
    },
  ];
}

export function wrapLegacyTools(tools: readonly unknown[]): ToolRegistration[] {
  return tools.map((value) => {
    const base = value as Omit<ToolRegistration, "execute">;
    const legacy = value as { execute(...args: never[]): Promise<unknown> };
    const executeLegacy = legacy.execute.bind(legacy);
    return {
      ...base,
      replay: "unsafe",
      async execute(
        args: never,
        api: ToolExecutionApi,
      ): Promise<ToolExecutionResult> {
        return mapToolResult(await executeLegacy(api.callId as never, args));
      },
    } as ToolRegistration;
  });
}

export function baseHarnessTools(
  botId: string,
  deliverDm?: (recipientBotId: string, text: string) => string,
  grantedSkills: SkillRow[] = [],
): ToolRegistration[] {
  return wrapLegacyTools(buildTools(botId, deliverDm, grantedSkills));
}
