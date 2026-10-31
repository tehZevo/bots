import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-audit-test-")),
  "t.db",
);

const { createApp } = await import("../src/api.ts");
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

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

interface AuditEntry {
  id: number;
  actor_kind: string;
  actor_name: string;
  action: string;
  target_kind: string;
  target_id: string | null;
  target_name: string | null;
  summary: string | null;
}

async function audit(query = ""): Promise<AuditEntry[]> {
  const res = await authed(`/api/audit${query}`);
  assert.equal(res.status, 200);
  return json<AuditEntry[]>(res);
}

const signup = await authed("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "auditor@example.com",
    password: "dev-audit-1",
  }),
});
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

test("sign-in is recorded with the user's email as actor", async () => {
  const entries = await audit("?type=auth");
  assert.ok(
    entries.some(
      (e) =>
        e.action === "auth.login" && e.actor_name === "auditor@example.com",
    ),
    JSON.stringify(entries),
  );
});

test("bot and trigger lifecycle actions append entries", async () => {
  const botRes = await authed("/api/bots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Auditbot" }),
  });
  assert.equal(botRes.status, 201);
  const botId = (await json<{ id: string }>(botRes)).id;
  const trigRes = await authed(`/api/bots/${botId}/triggers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "schedule",
      schedule: "@every 1h",
      message: "ping",
    }),
  });
  assert.equal(trigRes.status, 201);

  const created = await audit("?type=bot&q=Auditbot");
  assert.ok(
    created.some(
      (e) =>
        e.action === "bot.create" &&
        e.target_id === botId &&
        e.actor_kind === "user",
    ),
  );
  const trig = await audit("?type=trigger");
  assert.ok(
    trig.some(
      (e) =>
        e.action === "trigger.create" && (e.summary ?? "").includes("Auditbot"),
    ),
  );

  await authed("/api/stop-all", { method: "POST" });
  const stopped = await audit("?actor=user&type=global");
  assert.ok(stopped.some((e) => e.action === "global.stop_all"));
});

test("entries survive deletion of their target and keep recorded names", async () => {
  const botId = (await audit("?type=bot&q=Auditbot")).find(
    (e) => e.action === "bot.create",
  )?.target_id;
  assert.ok(botId);
  await authed(`/api/bots/${botId}`, { method: "DELETE" });
  const entries = await audit(`?q=${botId}`);
  assert.ok(
    entries.some(
      (e) => e.action === "bot.delete" && e.target_name === "Auditbot",
    ),
  );
});

test("no edit or delete API exists for audit rows", async () => {
  const del = await authed("/api/audit/1", { method: "DELETE" });
  assert.equal(del.status, 404);
  const patch = await authed("/api/audit/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(patch.status, 404);
});

test("summaries are redacted with assigned secret values", async () => {
  const sec = await authed("/api/secrets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "AUDIT_TOKEN",
      key: "AUDIT_TOKEN",
      value: "sup3rsecretvalue",
    }),
  });
  assert.equal(sec.status, 201);
  const redactBot = await authed("/api/bots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Redactbot" }),
  });
  assert.equal(redactBot.status, 201);
  const botId = (await json<{ id: string }>(redactBot)).id;
  const secId = (await json<{ id: string }>(sec)).id;
  await authed(`/api/bots/${botId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret_ids: [secId] }),
  });
  const { logAudit } = await import("../src/audit.ts");
  logAudit({
    actor: { kind: "bot", id: botId, name: "Redactbot" },
    action: "tool.call",
    targetKind: "tool",
    targetName: "shell",
    summary: "ran with token sup3rsecretvalue in env",
  });
  const entries = await audit("?type=tool");
  const entry = entries.find((e) => e.summary?.includes("AUDIT_TOKEN"));
  assert.ok(entry, JSON.stringify(entries.slice(0, 3)));
  assert.ok(
    !entries.some((e) => (e.summary ?? "").includes("sup3rsecretvalue")),
  );
});

test("retention purge removes old entries and records the purge itself", async () => {
  const { insertAuditRow, queryAuditRows } = await import("../src/db.ts");
  insertAuditRow({
    created_at: Date.now() - 10 * 86_400_000,
    actor_kind: "system",
    actor_name: "system",
    action: "audit.seed_old",
    target_kind: "test",
    summary: "old entry",
  });
  const put = await authed("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audit_retention_days: 3 }),
  });
  assert.equal(put.status, 200);
  const echoRes = await authed("/api/settings");
  const echo = JSON.parse(await echoRes.text()) as {
    audit_retention_days?: number;
    error?: string;
  };
  assert.equal(echo.audit_retention_days, 3);

  const { runAuditSweep } = await import("../src/audit.ts");
  runAuditSweep();

  assert.equal(queryAuditRows({ q: "old entry" }).length, 0);
  const purges = queryAuditRows({ actor: "system" });
  assert.ok(
    purges.some(
      (e) => e.action === "audit.purge" && (e.summary ?? "").includes("purged"),
    ),
  );
});
