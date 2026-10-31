import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-approvals-")),
  "t.db",
);

const dbm = await import("../src/db.ts");
const approvals = await import("../src/approvals.ts");
const durableTools = await import("../src/durable-tools.ts");

for (const id of [
  "gate-approve",
  "gate-deny",
  "gate-mcp",
  "gate-interrupt",
  "gate-state",
  "api-bot",
]) {
  dbm.insertBot({
    id,
    name: id,
    instructions: "",
    enabled: 1,
    created_at: Date.now(),
  } as never);
}

const apiMod = await import("../src/api.ts");
process.env.ALLOW_REGISTRATION = "true";
const app = apiMod.createApp();

function fakeTool(name: string, ran: () => unknown) {
  return {
    name,
    execute: async () => ({
      content: [{ type: "text", text: ran() }],
    }),
  };
}

async function firstPending(botId: string) {
  for (let i = 0; i < 50; i++) {
    const [row] = dbm.listApprovals({ botId, status: "pending" });
    if (row) return row;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error("no pending approval appeared");
}

test("no flagged capabilities means the gate is skipped entirely", () => {
  assert.equal(durableTools.makeApprovalGate("b0", new Set(), []), undefined);
});

test("a flagged tool pauses until approved, then runs", async () => {
  const botId = "gate-approve";
  const gate = durableTools.makeApprovalGate(botId, new Set(["shell"]), []);
  assert.ok(gate);
  let calls = 0;
  const [tool] = durableTools.wrapLegacyTools(
    [
      fakeTool("shell", () => {
        calls++;
        return "ran";
      }),
    ],
    gate,
  );
  const pending = tool.execute(
    { command: "ls" } as never,
    { callId: "c1" } as never,
  );
  const row = await firstPending(botId);
  assert.equal(row.tool_name, "shell");
  assert.match(row.args_summary ?? "", /ls/);
  assert.equal(calls, 0, "side effect deferred until decision");
  approvals.resolveApproval(row.id, true);
  const result = await pending;
  assert.equal(calls, 1);
  assert.deepEqual(result.output, [{ type: "text", text: "ran" }]);
});

test("denying a flagged tool returns a denial without running it", async () => {
  const botId = "gate-deny";
  const gate = durableTools.makeApprovalGate(botId, new Set(["shell"]), []);
  let calls = 0;
  const [tool] = durableTools.wrapLegacyTools(
    [
      fakeTool("shell", () => {
        calls++;
        return "ran";
      }),
    ],
    gate,
  );
  const pending = tool.execute({} as never, { callId: "c2" } as never);
  const row = await firstPending(botId);
  approvals.resolveApproval(row.id, false);
  const result = await pending;
  assert.equal(calls, 0);
  assert.deepEqual(result.details, { denied: true });
});

test("a flagged MCP server gates every <server>_<tool> it exposes", async () => {
  const botId = "gate-mcp";
  const gate = durableTools.makeApprovalGate(botId, new Set(["srv-1"]), [
    { id: "srv-1", name: "my tools" },
  ]);
  assert.ok(gate);
  let calls = 0;
  const [tool] = durableTools.wrapLegacyTools(
    [
      fakeTool("my_tools_lookup", () => {
        calls++;
        return "hit";
      }),
    ],
    gate,
  );
  const pending = tool.execute({ q: "x" } as never, { callId: "c3" } as never);
  const row = await firstPending(botId);
  assert.equal(row.tool_name, "my_tools_lookup");
  approvals.resolveApproval(row.id, true);
  await pending;
  assert.equal(calls, 1);

  // A different server's tool is untouched.
  const [other] = durableTools.wrapLegacyTools(
    [fakeTool("unrelated_tool", () => "ok")],
    gate,
  );
  const r = await other.execute({} as never, { callId: "c4" } as never);
  assert.deepEqual(r.output, [{ type: "text", text: "ok" }]);
});

test("denying pending approvals for a bot releases its waiters as denied", async () => {
  const botId = "gate-interrupt";
  const gate = durableTools.makeApprovalGate(botId, new Set(["shell"]), []);
  let calls = 0;
  const [tool] = durableTools.wrapLegacyTools(
    [
      fakeTool("shell", () => {
        calls++;
        return "ran";
      }),
    ],
    gate,
  );
  const pending = tool.execute({} as never, { callId: "c5" } as never);
  await firstPending(botId);
  approvals.denyPendingForBot(botId);
  const result = await pending;
  assert.equal(calls, 0);
  assert.deepEqual(result.details, { denied: true });
});

test("resolveApproval reports unknown and already-decided outcomes", async () => {
  const botId = "gate-state";
  const waiter = approvals.requestToolApproval(botId, "web_fetch", "{}");
  const row = await firstPending(botId);
  assert.equal(approvals.resolveApproval("missing-id", true), "unknown");
  assert.equal(approvals.resolveApproval(row.id, true), "resolved");
  assert.equal(await waiter, true);
  assert.equal(approvals.resolveApproval(row.id, false), "already-decided");
});

// --- API surface -------------------------------------------------------------

let SESSION = "";
const signup = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "approvals@example.com",
    password: "dev-session-1",
  }),
});
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await app.request(path, {
    method,
    headers: {
      cookie: SESSION,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

test("roles persist and echo approvals; unknown capabilities are rejected", async () => {
  const created = await req("POST", "/api/roles", {
    name: "Careful",
    instructions: "asks first",
    approvals: ["shell", "web_fetch"],
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.json.approvals, ["shell", "web_fetch"]);

  const roleId = String(created.json.id);
  const listed = await req("GET", "/api/roles");
  assert.equal(listed.status, 200);
  const rows = listed.json as unknown as { id: string; approvals: string[] }[];
  const mine = (rows as unknown as { id: string; approvals: string[] }[]).find(
    (r) => r.id === roleId,
  );
  assert.deepEqual(mine?.approvals, ["shell", "web_fetch"]);

  const bad = await req("POST", "/api/roles", {
    name: "Bad",
    instructions: "x",
    approvals: ["not_a_tool"],
  });
  assert.equal(bad.status, 400);
  assert.match(String(bad.json.error), /unknown approval capability/);

  // Patching an unrelated field keeps the flags (they are not silently cleared).
  const patched = await req("PATCH", `/api/roles/${roleId}`, {
    name: "Carefuler",
  });
  assert.equal(patched.status, 200);
  assert.deepEqual(patched.json.approvals, ["shell", "web_fetch"]);

  const cleared = await req("PATCH", `/api/roles/${roleId}`, { approvals: [] });
  assert.deepEqual(cleared.json.approvals, []);
});

test("approvals list filters and decide route validate input", async () => {
  const botId = "api-bot";
  approvals.requestToolApproval(botId, "shell", "{}");
  const row = await firstPending(botId);

  const filtered = await req(
    "GET",
    `/api/approvals?bot=${botId}&status=pending`,
  );
  assert.equal(filtered.status, 200);
  const list = filtered.json as unknown as { id: string; status: string }[];
  assert.ok(list.some((r) => r.id === row.id && r.status === "pending"));

  const badBody = await req("POST", `/api/approvals/${row.id}/decide`, {
    approve: "yes",
  });
  assert.equal(badBody.status, 400);

  const missing = await req("POST", "/api/approvals/nope/decide", {
    approve: true,
  });
  assert.equal(missing.status, 404);

  const decided = await req("POST", `/api/approvals/${row.id}/decide`, {
    approve: true,
  });
  assert.equal(decided.status, 200);
  assert.equal(decided.json.status, "approved");

  const again = await req("POST", `/api/approvals/${row.id}/decide`, {
    approve: false,
  });
  assert.equal(again.status, 409);
});
