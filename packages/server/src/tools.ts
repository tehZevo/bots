import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { dataDir } from "./config.ts";

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

const webFetchSchema = Type.Object({
  url: Type.String({ description: "Absolute http(s) URL to fetch" }),
});

const shellSchema = Type.Object({
  command: Type.String({ description: "Command line to run with bash" }),
});

export function buildTools(botId: string): AgentTool<any>[] {
  const cwd = workspaceDir(botId);

  const webFetch: AgentTool<typeof webFetchSchema> = {
    name: "web_fetch",
    label: "Web fetch",
    description:
      "Fetch a URL with GET and return the response body as text (HTML tags stripped).",
    parameters: webFetchSchema,
    execute: async (_id, params, signal) => {
      if (!/^https?:\/\//.test(params.url))
        throw new Error("URL must start with http:// or https://");
      const response = await fetch(params.url, {
        signal: signal ?? AbortSignal.timeout(30_000),
        headers: { "user-agent": "bots/0.1" },
        redirect: "follow",
      });
      let body = await response.text();
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
    description: `Run a shell command in the bot's workspace directory (${cwd}). Not sandboxed yet.`,
    parameters: shellSchema,
    execute: async (_id, params, signal) => {
      const result = await new Promise<{
        stdout: string;
        stderr: string;
        code: number;
      }>((resolvePromise, reject) => {
        execFile(
          "bash",
          ["-lc", params.command],
          { cwd, timeout: 60_000, signal, maxBuffer: 1024 * 1024 },
          (err, stdout, stderr) => {
            if (signal?.aborted) return reject(new Error("aborted"));
            const code =
              err && typeof err.code === "number" ? err.code : err ? 1 : 0;
            resolvePromise({ stdout, stderr, code });
          },
        );
      });
      const text = [result.stdout, result.stderr].filter(Boolean).join("\n");
      return {
        content: [
          {
            type: "text",
            text: `exit ${result.code}\n${truncate(text) || "(no output)"}`,
          },
        ],
        details: { code: result.code },
      };
    },
  };

  return [webFetch, shell];
}
