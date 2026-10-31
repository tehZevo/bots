import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-inbox-")),
  "t.db",
);

const { createApp } = await import("../src/api.ts");
const db = await import("../src/db.ts");
const app = createApp();

process.env.ALLOW_REGISTRATION = "true";
const signupRes = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "t@example.com", password: "inbox-pass-1" }),
});
const SESSION = (signupRes.headers.get("set-cookie") ?? "").split(";")[0];

function authedRequest(path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: { cookie: SESSION, ...(init?.headers ?? {}) },
  });
}

interface InboxItem {
  id: string;
  kind: string;
  bot_id: string | null;
  target_path: string | null;
  notification_id?: string | null;
}

async function inboxItems(): Promise<InboxItem[]> {
  return (await authedRequest("/api/inbox")).json() as Promise<InboxItem[]>;
}

test("inbox follows the latest run and suppresses duplicate notifications", async () => {
  const botId = randomUUID();
  db.insertBot({
    id: botId,
    name: "Failing",
    instructions: "",
    enabled: 1,
    created_at: Date.now(),
  });

  const failedAt = Date.now() - 2000;
  db.insertRun({
    id: randomUUID(),
    bot_id: botId,
    status: "error",
    trigger: "manual",
    started_at: failedAt,
    finished_at: failedAt + 1000,
    output: null,
    error: "boom line one\nsecond line",
  });
  db.createNotification({
    kind: "run_error",
    title: "Failing: run failed",
    body: "boom line one",
    botId,
    runId: "ignored",
  });

  let items = await inboxItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "run_error");
  assert.equal(items[0].bot_id, botId);
  assert.match(items[0].target_path ?? "", new RegExp(`bot=${botId}`));

  const notification = db
    .listNotifications()
    .find((n) => n.kind === "run_error");
  assert.ok(notification);
  assert.equal(
    (
      await authedRequest(`/api/notifications/${notification.id}/read`, {
        method: "POST",
      })
    ).status,
    200,
  );
  items = await inboxItems();
  assert.equal(items.length, 1);

  const unrelatedNotificationId = randomUUID();
  db.createNotification({
    kind: "notice",
    title: "Unrelated",
    body: "Look at this",
    botId,
    dedupeKey: `inbox-test:${unrelatedNotificationId}`,
  });
  items = await inboxItems();
  assert.equal(items.length, 2);
  const notificationItem = items.find((item) => item.kind === "notification");
  assert.ok(notificationItem?.notification_id);

  assert.equal(
    (
      await authedRequest(
        `/api/notifications/${notificationItem.notification_id}/read`,
        { method: "POST" },
      )
    ).status,
    200,
  );
  items = await inboxItems();
  assert.equal(items.length, 1);

  const succeededAt = Date.now();
  db.insertRun({
    id: randomUUID(),
    bot_id: botId,
    status: "ok",
    trigger: "manual",
    started_at: succeededAt,
    finished_at: succeededAt + 1000,
    output: "done",
    error: null,
  });
  items = await inboxItems();
  assert.deepEqual(items, []);
});

test("inbox includes an armed spend breaker without a notification duplicate", async () => {
  db.createNotification({
    kind: "breaker",
    title: "Spend circuit breaker tripped",
    body: "over cap",
    dedupeKey: `breaker:${Date.now()}`,
  });
  db.setBreakerArmed(true);

  let items = await inboxItems();
  assert.equal(items.filter((item) => item.kind === "breaker").length, 1);
  const breaker = items.find((item) => item.kind === "breaker");
  assert.ok(breaker);
  assert.equal(breaker.target_path, "/settings?tab=system");

  db.setBreakerArmed(false);
  items = await inboxItems();
  assert.equal(items.length, 1);
  const breakerNotification = items[0];
  assert.equal(breakerNotification.kind, "notification");
  assert.ok(breakerNotification.notification_id);

  assert.equal(
    (
      await authedRequest(
        `/api/notifications/${breakerNotification.notification_id}/read`,
        { method: "POST" },
      )
    ).status,
    200,
  );
  items = await inboxItems();
  assert.deepEqual(items, []);
});

test("pending tool approvals appear once and can be decided away", async () => {
  const botId = randomUUID();
  db.insertBot({
    id: botId,
    name: "Warden",
    instructions: "",
    enabled: 1,
    created_at: Date.now(),
  } as never);
  const approvals = await import("../src/approvals.ts");
  approvals.requestToolApproval(botId, "shell", '{"command":"rm -rf /tmp/x"}');

  let items = await inboxItems();
  const rows = items.filter((item) => item.kind === "approval");
  assert.equal(rows.length, 1, "one row, not duplicated by its notification");
  assert.equal(rows[0].bot_id, botId);
  assert.ok(rows[0].approval_id);
  assert.match(rows[0].id, /^approval:/);

  // A waiting call outranks that bot's older run failure for the single row.
  db.insertRun({
    id: randomUUID(),
    bot_id: botId,
    status: "error",
    trigger: "manual",
    started_at: Date.now() - 60_000,
    finished_at: Date.now() - 59_000,
    output: "",
    error: "boom",
  } as never);
  items = await inboxItems();
  assert.equal(
    items.filter((item) => item.bot_id === botId)[0]?.kind,
    "approval",
  );

  approvals.resolveApproval(String(rows[0].approval_id), true);
  items = await inboxItems();
  assert.deepEqual(
    items.filter((item) => item.kind === "approval"),
    [],
  );
});
