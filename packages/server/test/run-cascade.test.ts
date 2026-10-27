import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const databasePath = join(
  mkdtempSync(join(tmpdir(), "bots-run-cascade-")),
  "legacy.db",
);
process.env.DATABASE_PATH = databasePath;

function seedLegacyDatabase(path: string): void {
  const legacy = new Database(path);
  legacy.exec(`
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      model_id TEXT,
      avatar_shape INTEGER,
      avatar_color INTEGER,
      sound TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    INSERT INTO bots VALUES ('legacy-bot', 'Legacy', '', NULL, NULL, NULL, NULL, 1, 1);

    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      output TEXT,
      error TEXT
    );
    INSERT INTO runs VALUES ('run-valid', 'legacy-bot', 'ok', 'manual', 100, 200, 'done', NULL);

    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      run_id TEXT,
      role TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO messages VALUES (42, 'legacy-bot', 'run-valid', 'user', '{"role":"user","content":"valid"}', 150);
    INSERT INTO messages VALUES (43, 'legacy-bot', 'missing-run', 'user', '{"role":"user","content":"orphan"}', 160);
  `);
  legacy.close();
}

seedLegacyDatabase(databasePath);
const dbm = await import("../src/db.ts");

test("legacy message linkage is migrated to a cascade constraint", () => {
  const foreignKeys = dbm.db
    .prepare("PRAGMA foreign_key_list(messages)")
    .all() as { from: string; table: string }[];
  assert.ok(
    foreignKeys.some((fk) => fk.from === "run_id" && fk.table === "runs"),
  );
  assert.equal(Number(dbm.db.pragma("foreign_keys", { simple: true })), 1);

  assert.deepEqual(
    dbm.listMessagesForRun("run-valid").map((row) => row.id),
    [42],
  );
  const orphan = dbm.db
    .prepare("SELECT run_id FROM messages WHERE id = 43")
    .get() as { run_id: string | null };
  assert.equal(orphan.run_id, null);
});

test("deleting a run removes its transcript and usage", () => {
  dbm.insertRun({
    id: "run-delete",
    bot_id: "legacy-bot",
    status: "ok",
    trigger: "manual",
    started_at: 1000,
    finished_at: 2000,
    output: null,
    error: null,
  });
  dbm.appendMessages("legacy-bot", "run-delete", [
    { role: "user", payload: { role: "user", content: "hello" } },
  ]);
  dbm.recordRunUsage("run-delete", "legacy-bot", Date.now(), {
    input: 3,
    output: 4,
    cache_read: 0,
    cache_write: 0,
  });

  dbm.deleteRun("run-delete");

  assert.equal(dbm.getRun("run-delete"), undefined);
  assert.deepEqual(dbm.listMessagesForRun("run-delete"), []);
  assert.equal(dbm.getRunUsage("run-delete"), null);
  const usage = dbm.db
    .prepare("SELECT COUNT(*) AS count FROM run_usage WHERE run_id = ?")
    .get("run-delete") as { count: number };
  assert.equal(usage.count, 0);
});

test("message rows cannot reference a missing run", () => {
  assert.throws(() => {
    dbm.db
      .prepare(
        `INSERT INTO messages (bot_id, run_id, role, payload, created_at)
         VALUES ('legacy-bot', 'missing-run-2', 'user', '{}', 170)`,
      )
      .run();
  }, /FOREIGN KEY/i);
});

test("deleting a bot removes linked runs and messages", () => {
  dbm.insertBot({
    id: "cascade-bot",
    name: "Cascade",
    instructions: "",
    enabled: 1,
    current_task: null,
    current_task_updated_at: null,
    status: null,
    status_level: null,
    created_at: Date.now(),
  } as never);
  dbm.insertRun({
    id: "bot-cascade-run",
    bot_id: "cascade-bot",
    status: "ok",
    trigger: "manual",
    started_at: 3000,
    finished_at: 4000,
    output: null,
    error: null,
  });
  dbm.appendMessages("cascade-bot", "bot-cascade-run", [
    { role: "assistant", payload: { role: "assistant", content: "done" } },
  ]);
  dbm.recordRunUsage("bot-cascade-run", "cascade-bot", Date.now(), {
    input: 5,
    output: 6,
    cache_read: 0,
    cache_write: 0,
  });

  dbm.deleteBot("cascade-bot");

  assert.deepEqual(dbm.listRuns("cascade-bot"), []);
  assert.deepEqual(dbm.loadMessages("cascade-bot"), []);
  const usage = dbm.db
    .prepare("SELECT COUNT(*) AS count FROM run_usage WHERE bot_id = ?")
    .get("cascade-bot") as { count: number };
  assert.equal(usage.count, 0);
});
