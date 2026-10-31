import type {
  HookRegistration,
  ToolExecutionApi,
  ToolExecutionResult,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import { requestToolApproval } from "./approvals.ts";
import type { SkillRow } from "./db.ts";
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

export function toolRedactionHooks(botId: string): HookRegistration[] {
  return [
    {
      task: TOOL_TASK_NAME,
      handlers: {
        afterTool(call: unknown, result: ToolExecutionResult) {
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

// specs/tools/approvals.md — gate called before a tool's side effect. It
// resolves true to run the call, false to answer the model with a denial.
export type ApprovalGate = (
  name: string,
  argsSummary: string,
) => Promise<boolean>;

function summarizeArgs(args: unknown): string {
  try {
    const json = JSON.stringify(args ?? {});
    return json === "{}" ? "" : json.slice(0, 200);
  } catch {
    return "";
  }
}

export function wrapLegacyTools(
  tools: readonly unknown[],
  gate?: ApprovalGate,
): ToolRegistration[] {
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
        if (gate && !(await gate(String(base.name), summarizeArgs(args))))
          return deniedResult(String(base.name));
        return mapToolResult(await executeLegacy(api.callId as never, args));
      },
    } as ToolRegistration;
  });
}

function deniedResult(name: string): ToolExecutionResult {
  return {
    output: [
      { type: "text", text: `tool ${name} was denied by user` },
    ] as never,
    details: { denied: true },
  } satisfies ToolExecutionResult;
}

export function baseHarnessTools(
  botId: string,
  deliverDm?: (recipientBotId: string, text: string) => string,
  grantedSkills: SkillRow[] = [],
  gate?: ApprovalGate,
): ToolRegistration[] {
  return wrapLegacyTools(buildTools(botId, deliverDm, grantedSkills), gate);
}

/**
 * Builds the per-bot approval matcher from its role's flagged capabilities.
 * Built-in tools match by exact name; a flagged MCP server matches every tool
 * it exposes, which are namespaced `<server>_<tool>` (specs/roles/capabilities.md).
 */
export function makeApprovalGate(
  botId: string,
  required: Set<string>,
  mcpServers: Iterable<{ id: string; name: string }>,
): ApprovalGate | undefined {
  if (required.size === 0) return undefined;
  const prefixes = [...mcpServers]
    .filter((server) => required.has(server.id))
    .map((server) => `${server.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_`);
  return async (toolName, argsSummary) => {
    if (
      !required.has(toolName) &&
      !prefixes.some((p) => toolName.startsWith(p))
    )
      return true;
    return requestToolApproval(botId, toolName, argsSummary);
  };
}
