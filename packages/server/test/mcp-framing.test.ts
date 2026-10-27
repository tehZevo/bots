import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { connectMcpServer } from "../src/mcp.ts";

const fakeChild = `
import { appendFileSync } from "node:fs";

const log = process.env.MCP_TEST_LOG;
const newline = String.fromCharCode(10);
let buffer = "";

function send(message) {
  process.stdout.write(JSON.stringify(message) + newline);
}

function handle(msg) {
  if (msg.method === "initialize") {
    const response = {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        serverInfo: { name: "fake" },
      },
    };
    const body = JSON.stringify(response);
    process.stdout.write(body.slice(0, 17));
    setTimeout(() => process.stdout.write(body.slice(17) + newline), 5);
  } else if (msg.method === "tools/list") {
    send({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "echo" }] } });
  } else if (msg.method === "tools/call") {
    const args = (msg.params && msg.params.arguments) || {};
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: { content: [{ type: "text", text: String(args.text ?? "") }] },
    });
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf(newline);
  while (index >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + newline.length);
    if (line.trim()) {
      const msg = JSON.parse(line);
      appendFileSync(log, JSON.stringify(msg) + newline);
      handle(msg);
    }
    index = buffer.indexOf(newline);
  }
});
`;

test("connectMcpServer frames JSON-RPC messages over newline-delimited stdio", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bots-mcp-framing-"));
  const script = join(dir, "fake-mcp.mjs");
  const log = join(dir, "frames.log");

  try {
    await writeFile(script, fakeChild);
    const session = await connectMcpServer({
      id: "m1",
      name: "framing",
      transport: "stdio",
      command: process.execPath,
      args: [script],
      env: { MCP_TEST_LOG: log },
      enabled: 1,
      created_at: Date.now(),
    } as Parameters<typeof connectMcpServer>[0]);

    try {
      const tools = await session.listTools();
      assert.deepEqual(
        tools.map((tool) => tool.name),
        ["echo"],
      );
      assert.equal(await session.callTool("echo", { text: "hi" }), "hi");

      const frames = (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const initialize = frames.find((frame) => frame.method === "initialize");
      const initialized = frames.find(
        (frame) => frame.method === "notifications/initialized",
      );
      const toolsList = frames.find((frame) => frame.method === "tools/list");
      const toolCall = frames.find((frame) => frame.method === "tools/call");

      assert.ok(initialize, "initialize request should be framed as one line");
      assert.equal(typeof initialize.id, "number");
      assert.ok(
        initialized && initialized.id === undefined,
        "initialized notification should carry no id",
      );
      assert.ok(toolsList, "tools/list request should be framed as one line");
      assert.equal(typeof toolsList.id, "number");
      assert.ok(toolCall, "tools/call request should be framed as one line");
      assert.equal(typeof toolCall.id, "number");
      assert.equal(toolCall.params.name, "echo");
      assert.deepEqual(toolCall.params.arguments, { text: "hi" });
    } finally {
      session.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
