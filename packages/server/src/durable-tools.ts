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

export function baseHarnessTools(
  botId: string,
  deliverDm?: (recipientBotId: string, text: string) => string,
  grantedSkills: SkillRow[] = [],
): ToolRegistration[] {
  return buildTools(botId, deliverDm, grantedSkills).map((tool) => {
    const base = tool as unknown as Omit<ToolRegistration, "execute">;
    const executeLegacy = tool.execute.bind(tool);
    return {
      ...base,
      replay: "unsafe",
      async execute(
        args: never,
        api: ToolExecutionApi,
      ): Promise<ToolExecutionResult> {
        return mapToolResult(await executeLegacy(api.callId, args));
      },
    } as ToolRegistration;
  });
}
