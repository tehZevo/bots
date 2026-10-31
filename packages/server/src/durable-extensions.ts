import type {
  Extension,
  Registry,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import {
  approvalRequiredFor,
  type BotRow,
  getRole,
  listMcpServers,
  teammatesOf,
} from "./db.ts";
import {
  baseHarnessTools,
  makeApprovalGate,
  toolRedactionHooks,
  wrapLegacyTools,
} from "./durable-tools.ts";
import { connectRoleTools, type McpSession } from "./mcp.ts";
import { effectiveSystemPrompt } from "./prompt.ts";
import { grantedSkills } from "./skillfiles.ts";

export function botExtensionName(botId: string): string {
  return `bots:${botId}`;
}

export function mcpExtensionName(botId: string): string {
  return `bots-mcp:${botId}`;
}

export function selectExtensions(
  ...selected: readonly (Extension<ToolRegistration> | undefined | null)[]
): Extension<ToolRegistration>[] {
  return selected.filter(
    (extension): extension is Extension<ToolRegistration> => !!extension,
  );
}

// specs/tools/approvals.md — flags come from the bot's role grants and are
// read when the loop installs its extensions (capability-change rule).
function approvalGateFor(bot: BotRow) {
  const required = approvalRequiredFor(bot.id);
  if (required.size === 0) return undefined;
  const role = bot.role_id ? getRole(bot.role_id) : undefined;
  const granted = listMcpServers().filter((server) =>
    (role?.mcp_server_ids ?? []).includes(server.id),
  );
  return makeApprovalGate(bot.id, required, granted);
}

export function installBotExtension(
  registry: Registry<ToolRegistration>,
  bot: BotRow,
  deliverDm?: (recipientBotId: string, text: string) => string,
): Extension<ToolRegistration> {
  const dm =
    deliverDm ??
    (teammatesOf(bot.id).length > 0
      ? () => "not delivered: runtime"
      : undefined);
  const extension: Extension<ToolRegistration> = {
    name: botExtensionName(bot.id),
    tools: baseHarnessTools(
      bot.id,
      dm,
      grantedSkills(bot),
      approvalGateFor(bot),
    ),
    hooks: toolRedactionHooks(bot.id),
    sections: [
      {
        key: "bots",
        tag: false,
        render: () => effectiveSystemPrompt(bot),
      },
    ],
  };
  registry.install(extension);
  return extension;
}

export async function installMcpExtension(
  registry: Registry<ToolRegistration>,
  bot: BotRow,
): Promise<{ extension: Extension<ToolRegistration>; sessions: McpSession[] }> {
  const mcp = await connectRoleTools(bot);
  const extension: Extension<ToolRegistration> = {
    name: mcpExtensionName(bot.id),
    tools: wrapLegacyTools(mcp.tools, approvalGateFor(bot)),
    hooks: toolRedactionHooks(bot.id),
  };
  registry.install(extension);
  return { extension, sessions: mcp.sessions };
}

export function uninstallExtension(
  registry: Registry<ToolRegistration>,
  name: string,
): void {
  registry.uninstall({ name });
}
