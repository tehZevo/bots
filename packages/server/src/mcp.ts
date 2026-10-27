import { spawn } from "node:child_process";
import { type McpServerRow, resolveMcpEnv } from "./db.ts";

const HANDSHAKE_TIMEOUT_MS = 20_000;

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

// specs/mcp/child-env.md — explicit allowlist, never a spread of process.env.
export function mcpChildEnv(server: McpServerRow): Record<string, string> {
  const base: Record<string, string> = {};
  if (typeof process.env.PATH === "string") base.PATH = process.env.PATH;
  if (typeof process.env.HOME === "string") base.HOME = process.env.HOME;
  return { ...base, ...resolveMcpEnv(server.env) };
}

export interface McpSession {
  listTools(): Promise<McpToolDef[]>;
  callTool(name: string, args: unknown): Promise<string>;
  close(): void;
}

export async function connectMcpServer(
  server: McpServerRow,
): Promise<McpSession> {
  if (!server.command.trim()) throw new Error("command is empty");
  const child = spawn(server.command, server.args, {
    env: mcpChildEnv(server),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map<number, (msg: JsonRpcMessage) => void>();
  let nextId = 1;
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += String(chunk);
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        try {
          const msg = JSON.parse(line) as JsonRpcMessage;
          if (typeof msg.id === "number") pending.get(msg.id)?.(msg);
        } catch {
          /* ignore non-JSON lines */
        }
      }
      index = buffer.indexOf("\n");
    }
  });

  type Outgoing = { id?: number; method?: string; params?: unknown };
  const send = (msg: Outgoing): void => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
  };
  const request = (method: string, params: unknown): Promise<JsonRpcMessage> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            `no response to ${method} within ${HANDSHAKE_TIMEOUT_MS} ms`,
          ),
        );
      }, HANDSHAKE_TIMEOUT_MS);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(msg);
      });
      send({ id, method, params });
    });

  const failAll = (message: string) => {
    for (const resolve of pending.values())
      resolve({ jsonrpc: "2.0", error: { code: -1, message } });
  };
  child.on("error", (err) => failAll(`spawn failed: ${err.message}`));
  child.on("close", () => failAll("mcp server exited"));

  const init = await request("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "bots", version: "0.1" },
  });
  if (init.error) throw new Error(init.error.message);
  send({ method: "notifications/initialized" });

  return {
    async listTools() {
      const res = await request("tools/list", {});
      if (res.error) throw new Error(res.error.message);
      const list = (res.result as { tools?: McpToolDef[] })?.tools ?? [];
      return Array.isArray(list) ? list : [];
    },
    async callTool(name, args) {
      const res = await request("tools/call", { name, arguments: args });
      if (res.error) throw new Error(res.error.message);
      const content =
        (res.result as { content?: { type: string; text?: string }[] })
          ?.content ?? [];
      return content
        .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}]`))
        .join("\n");
    },
    close() {
      child.kill();
    },
  };
}

export async function testMcpConnection(
  server: McpServerRow,
): Promise<{ tools: number }> {
  const stderrNote = "";
  const session = await connectMcpServer(server).catch((err: unknown) => {
    throw err;
  });
  try {
    const tools = await session.listTools();
    return { tools: tools.length };
  } finally {
    session.close();
    void stderrNote;
  }
}
