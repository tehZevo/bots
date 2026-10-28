import type {
  HookRegistration,
  ToolExecutionApi,
  ToolExecutionResult,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import type { SkillRow } from "./db.ts";
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

export function toolRedactionHooks(botId: string): HookRegistration[] {
  return [
    {
      task: TOOL_TASK_NAME,
      handlers: {
        afterTool(_call: unknown, result: ToolExecutionResult) {
          return redactedToolResult(botId, result);
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
