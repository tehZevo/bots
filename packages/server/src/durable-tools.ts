import type {
  ToolExecutionApi,
  ToolExecutionResult,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import type { SkillRow } from "./db.ts";
import { buildTools } from "./tools.ts";

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
