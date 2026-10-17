import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.ts";

export interface BotRow {
  id: string;
  name: string;
  system_prompt: string;
  task: string;
  schedule: string;
  model_id: string | null;
  enabled: number;
  next_run_at: number | null;
  last_run_at: number | null;
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
    system_prompt TEXT NOT NULL DEFAULT '',
    task TEXT NOT NULL,
    schedule TEXT NOT NULL,
    model_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    next_run_at INTEGER,
    last_run_at INTEGER,
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

  CREATE INDEX IF NOT EXISTS idx_messages_bot ON messages (bot_id, id);
  CREATE INDEX IF NOT EXISTS idx_runs_bot ON runs (bot_id, started_at DESC);
`);

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
    `INSERT INTO bots (id, name, system_prompt, task, schedule, model_id, enabled, next_run_at, last_run_at, created_at)
     VALUES (@id, @name, @system_prompt, @task, @schedule, @model_id, @enabled, @next_run_at, @last_run_at, @created_at)`,
  ).run(bot);
}

export function updateBot(id: string, patch: Partial<BotRow>): void {
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE bots SET ${sets} WHERE id = @id`).run({ ...patch, id });
}

export function deleteBot(id: string): void {
  db.prepare("DELETE FROM runs WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM messages WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM bots WHERE id = ?").run(id);
}

export function dueBots(now: number): BotRow[] {
  return db
    .prepare(
      "SELECT * FROM bots WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?",
    )
    .all(now) as BotRow[];
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
