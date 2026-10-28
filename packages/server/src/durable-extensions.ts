import type {
  Extension,
  Registry,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import { type BotRow, teammatesOf } from "./db.ts";
import {
  baseHarnessTools,
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
    tools: baseHarnessTools(bot.id, dm, grantedSkills(bot)),
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
    tools: wrapLegacyTools(mcp.tools),
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
