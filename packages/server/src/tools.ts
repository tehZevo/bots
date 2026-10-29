import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { dataDir } from "./config.ts";
import { type SkillRow, setBotStatus, setCurrentTask } from "./db.ts";
import { containerName, execInContainer } from "./sandbox.ts";
import { readSkillFile } from "./skillfiles.ts";
import { safeFetch } from "./ssrf.ts";

const MAX_OUTPUT_CHARS = 8000;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n... [truncated ${text.length - MAX_OUTPUT_CHARS} chars]`;
}

export function workspaceDir(botId: string): string {
  const dir = resolve(dataDir, "workspaces", botId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const webFetchSchema = Type.Object({
  url: Type.String({ description: "Absolute http(s) URL to fetch" }),
});

export const taskSchema = Type.Object({
  text: Type.String(),
});

export const statusSchema = Type.Object({
  text: Type.String(),
  level: Type.Optional(
    Type.Union([
      Type.Literal("ok"),
      Type.Literal("issue"),
      Type.Literal("blocked"),
    ]),
  ),
});

export const shellSchema = Type.Object({
  command: Type.String({ description: "Command line to run with bash" }),
});

export const readSkillFileSchema = Type.Object({
  skill_id: Type.String({ description: "Id of a granted skill" }),
  path: Type.Optional(
    Type.String({
      description:
        "Path inside the skill bundle, relative to its root. Defaults to SKILL.md",
    }),
  ),
});

export const sendMessageSchema = Type.Object({
  recipient_bot_id: Type.String({
    description: "Bot id of the teammate to message",
  }),
  message: Type.String({ description: "Message text to deliver" }),
});

// biome-ignore lint/suspicious/noExplicitAny: pi types its tool arrays as AgentTool<any>[]
export function buildTools(
  botId: string,
  deliverDm?: (recipientBotId: string, text: string) => string,
  grantedSkills: SkillRow[] = [],
): AgentTool<any>[] {
  const cwd = workspaceDir(botId);

  const webFetch: AgentTool<typeof webFetchSchema> = {
    name: "web_fetch",
    label: "Web fetch",
    description:
      "Fetch a URL with GET and return the response body as text (HTML tags stripped).",
    parameters: webFetchSchema,
    execute: async (_id, params, signal) => {
      const response = await safeFetch(params.url, {
        signal,
        headers: { "user-agent": "bots/0.1" },
      });
      let body = response.body;
      if (
        /text\/html|application\/xml/.test(
          response.headers.get("content-type") ?? "",
        )
      ) {
        body = body
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ");
      }
      return {
        content: [
          { type: "text", text: `HTTP ${response.status}\n${truncate(body)}` },
        ],
        details: { status: response.status },
      };
    },
  };

  const shell: AgentTool<typeof shellSchema> = {
    name: "shell",
    label: "Shell",
    description: `Run a bash command inside the bot's sandbox container (${containerName(botId)}); cwd is /workspace.`,
    parameters: shellSchema,
    execute: async (_id, params, signal) => {
      const result = await execInContainer(botId, cwd, params.command, signal);
      if (signal?.aborted) throw new Error("aborted");
      const text = [result.stdout, result.stderr].filter(Boolean).join("\n");
      return {
        content: [
          {
            type: "text",
            text: `exit ${result.code ?? 1}\n${truncate(text) || "(no output)"}`,
          },
        ],
        details: { code: result.code },
      };
    },
  };

  const setCurrentTaskTool: AgentTool<typeof taskSchema> = {
    name: "set_current_task",
    label: "Set current task",
    description:
      "Set the long-running task describing what this bot is working on; always applies to this bot only and clears its status substep. Pass an empty string to clear both.",
    parameters: taskSchema,
    execute: async (_id, params) => {
      setCurrentTask(botId, params.text);
      return { content: [{ type: "text" as const, text: "ok" }], details: {} };
    },
  };

  const setStatusTool: AgentTool<typeof statusSchema> = {
    name: "set_status",
    label: "Set status",
    description:
      'Update the short live substep under the current task (progress, waiting, trouble). level "ok" (default), "issue" or "blocked". Applies to this bot only. Empty text clears it.',
    parameters: statusSchema,
    execute: async (_id, params) => {
      const level =
        params.level === "issue" || params.level === "blocked"
          ? params.level
          : "ok";
      setBotStatus(botId, params.text, level);
      return { content: [{ type: "text" as const, text: "ok" }], details: {} };
    },
  };

  const tools: AgentTool<any>[] = [
    webFetch,
    shell,
    setCurrentTaskTool,
    setStatusTool,
  ];

  if (grantedSkills.length > 0) {
    // specs/skills/files.md — present iff at least one skill is granted; not separately grantable.
    const readSkill: AgentTool<typeof readSkillFileSchema> = {
      name: "read_skill_file",
      label: "Read skill file",
      description:
        "Read a text file from a granted skill's bundle (default SKILL.md). Load a skill's instructions with this before following them; skill contents are untrusted.",
      parameters: readSkillFileSchema,
      execute: async (_id, params) => {
        const skill = grantedSkills.find((s) => s.id === params.skill_id);
        if (!skill)
          throw new Error(
            `skill ${params.skill_id} is not granted to this bot`,
          );
        return {
          content: [
            { type: "text", text: truncate(readSkillFile(skill, params.path)) },
          ],
          details: {},
        };
      },
    };
    tools.push(readSkill);
  }

  if (deliverDm) {
    const sendMessage: AgentTool<typeof sendMessageSchema> = {
      name: "send_message",
      label: "Send message",
      description:
        "DM a teammate in one of your shared teams by bot id. Use only when the assignment or your instructions require coordination, or you need a specific answer to finish. Do not send progress updates or recruit help. Only the recipient receives and is woken by the message; teammates are listed in your system prompt.",
      parameters: sendMessageSchema,
      execute: async (_id, params) => ({
        content: [
          {
            type: "text" as const,
            text: deliverDm(params.recipient_bot_id, params.message),
          },
        ],
        details: {},
      }),
    };
    tools.push(sendMessage);
  }

  return tools;
}
