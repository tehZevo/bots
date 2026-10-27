import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-drill-")),
  "t.db",
);

const { createApp } = await import("../src/api.ts");
const dbm = await import("../src/db.ts");
const { recordRetryWait } = await import("../src/runwaits.ts");
const app = createApp();

process.env.ALLOW_REGISTRATION = "true";
let SESSION = "";
function authed(path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: {
      ...(SESSION ? { cookie: SESSION } : {}),
      ...(init?.headers ?? {}),
    },
  });
}
const signup = await authed("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "drill@example.com",
    password: "dev-session-1",
  }),
});
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

dbm.insertBot({
  id: "drill-bot",
  name: "Drill",
  instructions: "",
  enabled: 1,
  created_at: Date.now(),
} as never);
dbm.insertRun({
  id: "run-1",
  bot_id: "drill-bot",
  status: "ok",
  trigger: "manual",
  started_at: 1000,
  finished_at: 2000,
  output: "done",
  error: null,
} as never);
dbm.appendMessages("drill-bot", "run-1", [
  { role: "user", payload: { role: "user", content: "check the deploy" } },
  {
    role: "assistant",
    payload: {
      role: "assistant",
      content: [
        { type: "text", text: "running shell now" },
        {
          type: "toolCall",
          id: "c1",
          name: "shell",
          arguments: { command: "ls" },
        },
      ],
    },
  },
  {
    role: "toolResult",
    payload: {
      role: "toolResult",
      toolCallId: "c1",
      toolName: "shell",
      content: [{ type: "text", text: "exit 0\nREADME" }],
      isError: false,
      durationMs: 250,
    },
  },
]);
// an older run without message linkage
dbm.insertRun({
  id: "run-old",
  bot_id: "drill-bot",
  status: "ok",
  trigger: "chat",
  started_at: 500,
  finished_at: 600,
  output: null,
  error: null,
} as never);
recordRetryWait("run-1", 2100);

test("retry waits mark the first assistant step completed after them", async () => {
  dbm.insertRun({
    id: "run-2",
    bot_id: "drill-bot",
    status: "ok",
    trigger: "manual",
    started_at: 1500,
    finished_at: 2500,
    output: null,
    error: null,
  } as never);
  recordRetryWait("run-2", 1500); // before rows exist => at <= step timestamps
  dbm.appendMessages("drill-bot", "run-2", [
    {
      role: "assistant",
      payload: { role: "assistant", content: [{ type: "text", text: "hi" }] },
    },
  ]);
  const res = await authed("/api/bots/drill-bot/runs/run-2/transcript");
  const body = (await res.json()) as { steps: { retry_wait_ms?: number }[] };
  assert.equal(body.steps[0].retry_wait_ms, 1500);
});

test("transcript returns ordered steps with tool call summaries and timing", async () => {
  const res = await authed("/api/bots/drill-bot/runs/run-1/transcript");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    run: { id: string; status: string };
    steps: Record<string, unknown>[];
  };
  assert.equal(body.run.id, "run-1");
  assert.deepEqual(
    body.steps.map((s) => s.kind),
    ["user", "assistant", "tool_call", "tool_result"],
  );
  const call = body.steps[2];
  assert.equal(call.name, "shell");
  assert.equal(call.args, '{"command":"ls"}');
  const result = body.steps[3];
  assert.equal(result.duration_ms, 250);
  assert.equal(result.is_error, false);
});

test("runs without linkage return empty steps", async () => {
  const res = await authed("/api/bots/drill-bot/runs/run-old/transcript");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { steps: unknown[] };
  assert.deepEqual(body.steps, []);
});

test("unknown run or foreign run id 404s", async () => {
  assert.equal(
    (await authed("/api/bots/drill-bot/runs/nope/transcript")).status,
    404,
  );
  dbm.insertBot({
    id: "other-bot",
    name: "Other",
    instructions: "",
    enabled: 1,
    created_at: Date.now(),
  } as never);
  assert.equal(
    (await authed("/api/bots/other-bot/runs/run-1/transcript")).status,
    404,
  );
});
