import { spawn } from "node:child_process";
import type { McpServerRow } from "./db.ts";

const HANDSHAKE_TIMEOUT_MS = 20_000;

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export async function testMcpConnection(
  server: McpServerRow,
): Promise<{ tools: number }> {
  if (!server.command.trim()) throw new Error("command is empty");
  const child = spawn(server.command, server.args, {
    env: { ...process.env, ...server.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
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

  child.on("error", (err) => {
    for (const resolve of pending.values())
      resolve({
        jsonrpc: "2.0",
        error: { code: -1, message: `spawn failed: ${err.message}` },
      });
  });

  try {
    const init = await request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "bots", version: "0.1" },
    });
    if (init.error) throw new Error(init.error.message);
    send({ method: "notifications/initialized" });
    const tools = await request("tools/list", {});
    if (tools.error) throw new Error(tools.error.message);
    const list = (tools.result as { tools?: unknown[] })?.tools ?? [];
    return { tools: Array.isArray(list) ? list.length : 0 };
  } catch (err) {
    const detail = stderr.trim() ? ` — ${stderr.trim().slice(0, 300)}` : "";
    throw new Error(
      err instanceof Error ? `${err.message}${detail}` : `test failed${detail}`,
    );
  } finally {
    child.kill();
  }
}
