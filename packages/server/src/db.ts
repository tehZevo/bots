import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.ts";

export interface BotRow {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model_id: string | null;
  role_id: string | null;
  enabled: number;
  created_at: number;
}

export interface RoleRow {
  id: string;
  name: string;
  instructions: string;
  created_at: number;
}

export interface TriggerRow {
  id: string;
  bot_id: string;
  kind: "schedule";
  message: string;
  schedule: string;
  next_run_at: number | null;
  created_at: number;
}

export interface RunRow {
  id: string;
  bot_id: string;
  status: "running" | "ok" | "error";
  trigger: "schedule" | "manual";
  started_at: number;
  finished_at: number | null;
  output: string | null;
  error: string | null;
}

export interface MessageRow {
  id: number;
  bot_id: string;
  run_id: string | null;
  role: string;
  payload: string;
  created_at: number;
}

mkdirSync(dirname(config.databasePath), { recursive: true });
const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '',
    model_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS triggers (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'schedule',
    message TEXT NOT NULL,
    schedule TEXT NOT NULL,
    next_run_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    trigger TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    output TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    run_id TEXT,
    role TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_bot ON messages (bot_id, id);
  CREATE INDEX IF NOT EXISTS idx_runs_bot ON runs (bot_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_triggers_due ON triggers (next_run_at);
`);

const botColumns = new Set(
  (db.prepare("PRAGMA table_info(bots)").all() as { name: string }[]).map(
    (column) => column.name,
  ),
);
if (botColumns.has("task")) {
  const legacy = db
    .prepare("SELECT id, task, schedule, next_run_at FROM bots")
    .all() as {
    id: string;
    task: string;
    schedule: string;
    next_run_at: number | null;
  }[];
  const insertLegacy = db.prepare(
    `INSERT INTO triggers (id, bot_id, kind, message, schedule, next_run_at, created_at)
     VALUES (?, ?, 'schedule', ?, ?, ?, ?)`,
  );
  for (const row of legacy) {
    if (row.task && row.schedule)
      insertLegacy.run(
        randomUUID(),
        row.id,
        row.task,
        row.schedule,
        row.next_run_at,
        Date.now(),
      );
  }
  for (const column of ["task", "schedule", "next_run_at", "last_run_at"]) {
    if (botColumns.has(column))
      db.prepare(`ALTER TABLE bots DROP COLUMN ${column}`).run();
  }
}

if (!botColumns.has("description"))
  db.prepare(
    "ALTER TABLE bots ADD COLUMN description TEXT NOT NULL DEFAULT ''",
  ).run();

if (!botColumns.has("role_id"))
  db.prepare(
    "ALTER TABLE bots ADD COLUMN role_id TEXT REFERENCES roles(id)",
  ).run();

export function listBots(): BotRow[] {
  return db.prepare("SELECT * FROM bots ORDER BY created_at").all() as BotRow[];
}

export function getBot(id: string): BotRow | undefined {
  return db.prepare("SELECT * FROM bots WHERE id = ?").get(id) as
    | BotRow
    | undefined;
}

export function insertBot(bot: BotRow): void {
  db.prepare(
    `INSERT INTO bots (id, name, description, system_prompt, model_id, role_id, enabled, created_at)
     VALUES (@id, @name, @description, @system_prompt, @model_id, @role_id, @enabled, @created_at)`,
  ).run(bot);
}

export function updateBot(id: string, patch: Partial<BotRow>): void {
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE bots SET ${sets} WHERE id = @id`).run({ ...patch, id });
}

export function deleteBot(id: string): void {
  db.prepare("DELETE FROM triggers WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM runs WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM messages WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM bots WHERE id = ?").run(id);
}

export function listRoles(): RoleRow[] {
  return db
    .prepare("SELECT * FROM roles ORDER BY created_at")
    .all() as RoleRow[];
}

export function getRole(id: string): RoleRow | undefined {
  return db.prepare("SELECT * FROM roles WHERE id = ?").get(id) as
    | RoleRow
    | undefined;
}

export function insertRole(role: RoleRow): void {
  db.prepare(
    `INSERT INTO roles (id, name, instructions, created_at)
     VALUES (@id, @name, @instructions, @created_at)`,
  ).run(role);
}

export function updateRole(id: string, patch: Partial<RoleRow>): void {
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE roles SET ${sets} WHERE id = @id`).run({ ...patch, id });
}

export function deleteRole(id: string): void {
  db.prepare("UPDATE bots SET role_id = NULL WHERE role_id = ?").run(id);
  db.prepare("DELETE FROM roles WHERE id = ?").run(id);
}

export function listTriggers(botId: string): TriggerRow[] {
  return db
    .prepare("SELECT * FROM triggers WHERE bot_id = ? ORDER BY created_at")
    .all(botId) as TriggerRow[];
}

export function getTrigger(id: string): TriggerRow | undefined {
  return db.prepare("SELECT * FROM triggers WHERE id = ?").get(id) as
    | TriggerRow
    | undefined;
}

export function insertTrigger(trigger: TriggerRow): void {
  db.prepare(
    `INSERT INTO triggers (id, bot_id, kind, message, schedule, next_run_at, created_at)
     VALUES (@id, @bot_id, @kind, @message, @schedule, @next_run_at, @created_at)`,
  ).run(trigger);
}

export function updateTrigger(id: string, patch: Partial<TriggerRow>): void {
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE triggers SET ${sets} WHERE id = @id`).run({
    ...patch,
    id,
  });
}

export function deleteTrigger(id: string): void {
  db.prepare("DELETE FROM triggers WHERE id = ?").run(id);
}

export function dueTriggers(now: number): TriggerRow[] {
  return db
    .prepare(
      `SELECT t.* FROM triggers t JOIN bots b ON b.id = t.bot_id
       WHERE b.enabled = 1 AND t.next_run_at IS NOT NULL AND t.next_run_at <= ?`,
    )
    .all(now) as TriggerRow[];
}

export function insertRun(run: RunRow): void {
  db.prepare(
    `INSERT INTO runs (id, bot_id, status, trigger, started_at, finished_at, output, error)
     VALUES (@id, @bot_id, @status, @trigger, @started_at, @finished_at, @output, @error)`,
  ).run(run);
}

export function finishRun(
  id: string,
  status: "ok" | "error",
  output: string | null,
  error: string | null,
): void {
  db.prepare(
    "UPDATE runs SET status = ?, finished_at = ?, output = ?, error = ? WHERE id = ?",
  ).run(status, Date.now(), output, error, id);
}

export function listRuns(botId: string, limit = 50): RunRow[] {
  return db
    .prepare(
      "SELECT * FROM runs WHERE bot_id = ? ORDER BY started_at DESC LIMIT ?",
    )
    .all(botId, limit) as RunRow[];
}

export function appendMessage(
  botId: string,
  runId: string | null,
  role: string,
  payload: unknown,
): void {
  db.prepare(
    "INSERT INTO messages (bot_id, run_id, role, payload, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(botId, runId, role, JSON.stringify(payload), Date.now());
}

export function loadMessages(botId: string): MessageRow[] {
  return db
    .prepare("SELECT * FROM messages WHERE bot_id = ? ORDER BY id")
    .all(botId) as MessageRow[];
}

export function clearMessages(botId: string): void {
  db.prepare("DELETE FROM messages WHERE bot_id = ?").run(botId);
}

export { db };

export function getSetting(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
