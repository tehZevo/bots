import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.ts";

export interface BotRow {
  id: string;
  name: string;
  instructions: string;
  model_id: string | null;
  role_id: string | null;
  machine_id: string | null;
  avatar_shape: number | null;
  avatar_color: number | null;
  sound: string | null;
  enabled: number;
  current_task: string | null;
  current_task_updated_at: number | null;
  status: string | null;
  status_level: "ok" | "issue" | "blocked" | null;
  created_at: number;
}

export interface RoleRow {
  id: string;
  name: string;
  instructions: string;
  mcp_server_ids: string[];
  skill_ids: string[];
  created_at: number;
}

export interface TriggerRow {
  id: string;
  bot_id: string;
  kind: "schedule" | "webhook";
  name: string | null;
  message: string;
  schedule: string;
  next_run_at: number | null;
  secret: string | null;
  enabled: number;
  created_at: number;
}

export interface RunRow {
  id: string;
  bot_id: string;
  status: "running" | "ok" | "error";
  trigger: "schedule" | "manual" | "chat" | "webhook";
  started_at: number;
  finished_at: number | null;
  output: string | null;
  error: string | null;
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  bot_id: string | null;
  dedupe_key: string | null;
  read: number;
  created_at: number;
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
    instructions TEXT NOT NULL DEFAULT '',
    model_id TEXT,
    avatar_shape INTEGER,
    avatar_color INTEGER,
    sound TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS triggers (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'schedule',
    name TEXT,
    message TEXT NOT NULL,
    schedule TEXT NOT NULL,
    next_run_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    machine_id TEXT REFERENCES machines(id),
    role_id TEXT REFERENCES roles(id),
    triggers TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
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

  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    models TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    bot_id TEXT REFERENCES bots(id) ON DELETE CASCADE,
    dedupe_key TEXT UNIQUE,
    "read" INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_bot ON messages (bot_id, id);
  CREATE INDEX IF NOT EXISTS idx_runs_bot ON runs (bot_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_triggers_due ON triggers (next_run_at);
  CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);
`);

db.prepare(
  `DELETE FROM messages WHERE id NOT IN (
     SELECT MIN(id) FROM messages GROUP BY bot_id, role, payload
   )`,
).run();

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

const trigCols = new Set(
  (db.prepare("PRAGMA table_info(triggers)").all() as { name: string }[]).map(
    (c) => c.name,
  ),
);
if (!trigCols.has("enabled")) {
  db.prepare(
    "ALTER TABLE triggers ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1",
  ).run();
}

const roleCols = new Set(
  (db.prepare("PRAGMA table_info(roles)").all() as { name: string }[]).map(
    (c) => c.name,
  ),
);
if (!roleCols.has("mcp_server_ids")) {
  db.prepare(
    "ALTER TABLE roles ADD COLUMN mcp_server_ids TEXT NOT NULL DEFAULT '[]'",
  ).run();
}
if (!roleCols.has("skill_ids")) {
  db.prepare(
    "ALTER TABLE roles ADD COLUMN skill_ids TEXT NOT NULL DEFAULT '[]'",
  ).run();
}

if (!botColumns.has("instructions")) {
  db.prepare(
    "ALTER TABLE bots ADD COLUMN instructions TEXT NOT NULL DEFAULT ''",
  ).run();
  const legacy = new Set(
    (db.prepare("PRAGMA table_info(bots)").all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  const parts: string[] = [];
  if (legacy.has("description") && legacy.has("system_prompt")) {
    parts.push(
      `UPDATE bots SET instructions = TRIM(CASE
         WHEN TRIM(description) <> '' AND TRIM(system_prompt) <> ''
           THEN description || char(10) || char(10) || system_prompt
         WHEN TRIM(description) <> '' THEN description
         ELSE system_prompt END)`,
    );
  } else if (legacy.has("description")) {
    parts.push("UPDATE bots SET instructions = TRIM(description)");
  } else if (legacy.has("system_prompt")) {
    parts.push("UPDATE bots SET instructions = TRIM(system_prompt)");
  }
  for (const stmt of parts) db.prepare(stmt).run();
  for (const col of ["description", "system_prompt"] as const) {
    if (
      new Set(
        (db.prepare("PRAGMA table_info(bots)").all() as { name: string }[]).map(
          (c) => c.name,
        ),
      ).has(col)
    )
      db.prepare(`ALTER TABLE bots DROP COLUMN ${col}`).run();
  }
}

const tplCols = new Set(
  (db.prepare("PRAGMA table_info(templates)").all() as { name: string }[]).map(
    (c) => c.name,
  ),
);
if (!tplCols.has("instructions")) {
  if (tplCols.has("system_prompt"))
    db.prepare(
      "ALTER TABLE templates RENAME COLUMN system_prompt TO instructions",
    ).run();
  else
    db.prepare(
      "ALTER TABLE templates ADD COLUMN instructions TEXT NOT NULL DEFAULT ''",
    ).run();
}

if (!botColumns.has("avatar_shape"))
  db.prepare("ALTER TABLE bots ADD COLUMN avatar_shape INTEGER").run();

if (!botColumns.has("avatar_color"))
  db.prepare("ALTER TABLE bots ADD COLUMN avatar_color INTEGER").run();

if (!botColumns.has("sound"))
  db.prepare("ALTER TABLE bots ADD COLUMN sound TEXT").run();

if (!botColumns.has("status")) {
  db.prepare("ALTER TABLE bots ADD COLUMN status TEXT").run();
  db.prepare(
    "ALTER TABLE bots ADD COLUMN status_level TEXT DEFAULT 'ok'",
  ).run();
}

if (!botColumns.has("current_task")) {
  db.prepare("ALTER TABLE bots ADD COLUMN current_task TEXT").run();
  db.prepare(
    "ALTER TABLE bots ADD COLUMN current_task_updated_at INTEGER",
  ).run();
}

if (!botColumns.has("role_id"))
  db.prepare(
    "ALTER TABLE bots ADD COLUMN role_id TEXT REFERENCES roles(id)",
  ).run();

const apiKeyColumns = new Set(
  (db.prepare("PRAGMA table_info(api_keys)").all() as { name: string }[]).map(
    (column) => column.name,
  ),
);
if (!apiKeyColumns.has("user_id"))
  db.prepare("ALTER TABLE api_keys ADD COLUMN user_id TEXT").run();

const triggerColumns = new Set(
  (db.prepare("PRAGMA table_info(triggers)").all() as { name: string }[]).map(
    (column) => column.name,
  ),
);
const runColumns = new Set(
  (db.prepare("PRAGMA table_info(runs)").all() as { name: string }[]).map(
    (c) => c.name,
  ),
);
if (!runColumns.has("superseded"))
  db.prepare(
    "ALTER TABLE runs ADD COLUMN superseded INTEGER NOT NULL DEFAULT 0",
  ).run();

if (!triggerColumns.has("secret"))
  db.prepare("ALTER TABLE triggers ADD COLUMN secret TEXT").run();
if (!triggerColumns.has("name"))
  db.prepare("ALTER TABLE triggers ADD COLUMN name TEXT").run();

db.exec(`
  CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    dockerfile TEXT NOT NULL,
    image TEXT,
    build_error TEXT,
    created_at INTEGER NOT NULL
  );
`);

if (!botColumns.has("machine_id"))
  db.prepare(
    "ALTER TABLE bots ADD COLUMN machine_id TEXT REFERENCES machines(id)",
  ).run();

export function listBots(): BotRow[] {
  return db.prepare("SELECT * FROM bots ORDER BY created_at").all() as BotRow[];
}

export function getBot(id: string): BotRow | undefined {
  return db.prepare("SELECT * FROM bots WHERE id = ?").get(id) as
    | BotRow
    | undefined;
}

type NewBot = Omit<
  BotRow,
  | "model_id"
  | "role_id"
  | "machine_id"
  | "avatar_shape"
  | "avatar_color"
  | "sound"
> &
  Partial<
    Pick<
      BotRow,
      | "model_id"
      | "role_id"
      | "machine_id"
      | "avatar_shape"
      | "avatar_color"
      | "sound"
    >
  >;

export function insertBot(bot: NewBot): void {
  db.prepare(
    `INSERT INTO bots (id, name, instructions, model_id, role_id, machine_id, avatar_shape, avatar_color, sound, enabled, created_at)
     VALUES (@id, @name, @instructions, @model_id, @role_id, @machine_id, @avatar_shape, @avatar_color, @sound, @enabled, @created_at)`,
  ).run({
    model_id: null,
    role_id: null,
    machine_id: null,
    avatar_shape: null,
    avatar_color: null,
    sound: null,
    ...bot,
  });
}

export interface MachineRow {
  id: string;
  name: string;
  description: string;
  dockerfile: string;
  image: string | null;
  build_error: string | null;
  created_at: number;
}

export function listMachines(): MachineRow[] {
  return db
    .prepare("SELECT * FROM machines ORDER BY name COLLATE NOCASE")
    .all() as MachineRow[];
}

export function getMachine(id: string): MachineRow | undefined {
  return db.prepare("SELECT * FROM machines WHERE id = ?").get(id) as
    | MachineRow
    | undefined;
}

export function insertMachine(machine: MachineRow): void {
  db.prepare(
    `INSERT INTO machines (id, name, description, dockerfile, image, build_error, created_at)
     VALUES (@id, @name, @description, @dockerfile, @image, @build_error, @created_at)`,
  ).run(machine);
}

export function updateMachine(
  id: string,
  patch: Partial<Pick<MachineRow, "name" | "description" | "dockerfile">>,
): void {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE machines SET ${sets} WHERE id = @id`).run({
    ...patch,
    id,
  });
}

export function setMachineBuild(
  id: string,
  image: string | null,
  buildError: string | null,
): void {
  db.prepare("UPDATE machines SET image = ?, build_error = ? WHERE id = ?").run(
    image,
    buildError,
    id,
  );
}

export function deleteMachine(id: string): void {
  db.prepare("UPDATE bots SET machine_id = NULL WHERE machine_id = ?").run(id);
  db.prepare("DELETE FROM machines WHERE id = ?").run(id);
}

export function botsUsingMachine(
  machineId: string,
): { id: string; name: string }[] {
  return db
    .prepare(
      "SELECT id, name FROM bots WHERE machine_id = ? ORDER BY created_at",
    )
    .all(machineId) as { id: string; name: string }[];
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
  db.prepare("DELETE FROM notifications WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM bots WHERE id = ?").run(id);
}

interface RawRoleRow extends Omit<RoleRow, "mcp_server_ids" | "skill_ids"> {
  mcp_server_ids: string;
  skill_ids: string;
}

function parseRole(row: RawRoleRow): RoleRow {
  const parse = (v: string): string[] => {
    try {
      const list = JSON.parse(v) as unknown;
      return Array.isArray(list)
        ? (list.filter((x) => typeof x === "string") as string[])
        : [];
    } catch {
      return [];
    }
  };
  return {
    ...row,
    mcp_server_ids: parse(row.mcp_server_ids),
    skill_ids: parse(row.skill_ids),
  };
}

export function listRoles(): RoleRow[] {
  return (
    db.prepare("SELECT * FROM roles ORDER BY created_at").all() as RawRoleRow[]
  ).map(parseRole);
}

export function getRole(id: string): RoleRow | undefined {
  const row = db.prepare("SELECT * FROM roles WHERE id = ?").get(id) as
    | RawRoleRow
    | undefined;
  return row ? parseRole(row) : undefined;
}

export function insertRole(role: RoleRow): void {
  db.prepare(
    `INSERT INTO roles (id, name, instructions, mcp_server_ids, skill_ids, created_at)
     VALUES (@id, @name, @instructions, @mcp_server_ids, @skill_ids, @created_at)`,
  ).run({
    ...role,
    mcp_server_ids: JSON.stringify(role.mcp_server_ids),
    skill_ids: JSON.stringify(role.skill_ids),
  });
}

export function updateRole(id: string, patch: Partial<RoleRow>): void {
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE roles SET ${sets} WHERE id = @id`).run({
    ...patch,
    mcp_server_ids: JSON.stringify(patch.mcp_server_ids),
    skill_ids: JSON.stringify(patch.skill_ids),
    id,
  });
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
    `INSERT INTO triggers (id, bot_id, kind, name, message, schedule, next_run_at, secret, enabled, created_at)
     VALUES (@id, @bot_id, @kind, @name, @message, @schedule, @next_run_at, @secret, @enabled, @created_at)`,
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

export function setTriggerSecret(triggerId: string, secret: string): void {
  db.prepare("UPDATE triggers SET secret = ? WHERE id = ?").run(
    secret,
    triggerId,
  );
}

export function deleteTrigger(id: string): void {
  db.prepare("DELETE FROM triggers WHERE id = ?").run(id);
}

export function dueTriggers(now: number): TriggerRow[] {
  return db
    .prepare(
      `SELECT t.* FROM triggers t JOIN bots b ON b.id = t.bot_id
       WHERE b.enabled = 1 AND t.enabled = 1 AND t.next_run_at IS NOT NULL AND t.next_run_at <= ?`,
    )
    .all(now) as TriggerRow[];
}

export function insertRun(run: RunRow): void {
  db.prepare(
    `INSERT INTO runs (id, bot_id, status, trigger, started_at, finished_at, output, error)
     VALUES (@id, @bot_id, @status, @trigger, @started_at, @finished_at, @output, @error)`,
  ).run(run);
}

export function createNotification(input: {
  kind: string;
  title: string;
  body: string;
  botId?: string | null;
  dedupeKey?: string | null;
}): void {
  db.prepare(
    `INSERT INTO notifications (id, kind, title, body, bot_id, dedupe_key, "read", created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(dedupe_key) DO NOTHING`,
  ).run(
    randomUUID(),
    input.kind,
    input.title,
    input.body.slice(0, 1000),
    input.botId ?? null,
    input.dedupeKey ?? null,
    Date.now(),
  );
}

export function finishRun(
  id: string,
  status: "ok" | "error",
  output: string | null,
  error: string | null,
): void {
  const update = db.prepare(
    "UPDATE runs SET status = ?, finished_at = ?, output = ?, error = ? WHERE id = ?",
  );
  const getInfo = db.prepare(
    `SELECT r.bot_id, r.trigger, b.name FROM runs r
     LEFT JOIN bots b ON b.id = r.bot_id WHERE r.id = ?`,
  );
  const tx = db.transaction(() => {
    update.run(status, Date.now(), output, error, id);
    if (status !== "error") return;

    const info = getInfo.get(id) as
      | { bot_id: string | null; trigger: string | null; name: string | null }
      | undefined;
    createNotification({
      kind: "run_error",
      title: `${info?.name ?? "Bot"}: run failed`,
      body:
        error || output || `Run ${info?.trigger ?? "manual"} ended in error.`,
      botId: info?.bot_id,
      dedupeKey: `run-error:${id}`,
    });
  });
  tx();
}

export function listNotifications(limit = 100): NotificationRow[] {
  return db
    .prepare(
      "SELECT * FROM notifications ORDER BY created_at DESC, rowid DESC LIMIT ?",
    )
    .all(limit) as NotificationRow[];
}

export function unreadNotificationCount(): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM notifications WHERE "read" = 0')
    .get() as { count: number };
  return row.count;
}

export function markNotificationRead(id: string): boolean {
  return (
    db.prepare(`UPDATE notifications SET "read" = 1 WHERE id = ?`).run(id)
      .changes > 0
  );
}

export function markAllNotificationsRead(): number {
  return db
    .prepare('UPDATE notifications SET "read" = 1 WHERE "read" = 0')
    .run().changes;
}

export function latestErrorBotIds(): Set<string> {
  const rows = db
    .prepare(
      `SELECT bot_id FROM runs r
     WHERE status = 'error' AND superseded = 0 AND started_at = (
       SELECT MAX(started_at) FROM runs
       WHERE bot_id = r.bot_id AND status != 'running' AND superseded = 0
     )`,
    )
    .all() as { bot_id: string }[];
  return new Set(rows.map((r) => r.bot_id));
}

// Accepting new work un-interrupts the bot: its interrupted runs stop
// counting toward health (spec bots/interrupt.md).
export function supersedeInterruptedRuns(botId: string): void {
  db.prepare(
    `UPDATE runs SET superseded = 1
     WHERE bot_id = ? AND status = 'error' AND error = 'interrupted' AND superseded = 0`,
  ).run(botId);
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

export function appendMessages(
  botId: string,
  runId: string | null,
  messages: readonly { role: string; payload: unknown }[],
): void {
  if (messages.length === 0) return;
  const insert = db.prepare(
    "INSERT INTO messages (bot_id, run_id, role, payload, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const tx = db.transaction(() => {
    for (const message of messages) {
      insert.run(
        botId,
        runId,
        message.role,
        JSON.stringify(message.payload),
        Date.now(),
      );
    }
  });
  tx();
}

export function loadMessages(botId: string): MessageRow[] {
  return db
    .prepare("SELECT * FROM messages WHERE bot_id = ? ORDER BY id")
    .all(botId) as MessageRow[];
}

function clearMessageRows(botId: string): void {
  db.prepare("DELETE FROM messages WHERE bot_id = ?").run(botId);
}

export function replaceMessages(
  botId: string,
  runId: string | null,
  messages: readonly { role: string; payload: unknown }[],
): void {
  const insert = db.prepare(
    "INSERT INTO messages (bot_id, run_id, role, payload, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const tx = db.transaction(() => {
    clearMessageRows(botId);
    for (const message of messages) {
      insert.run(
        botId,
        runId,
        message.role,
        JSON.stringify(message.payload),
        Date.now(),
      );
    }
  });
  tx();
}

export function clearMessages(botId: string): void {
  clearMessageRows(botId);
  setCurrentTask(botId, null);
  setBotStatus(botId, null);
}

export function setBotStatus(
  botId: string,
  text: string | null,
  level: "ok" | "issue" | "blocked" = "ok",
): void {
  const value = text && text.trim() ? text.trim() : null;
  db.prepare(
    "UPDATE bots SET status = ?, status_level = ?, current_task_updated_at = ? WHERE id = ?",
  ).run(value, value ? level : null, value ? Date.now() : null, botId);
}

export function setCurrentTask(botId: string, text: string | null): void {
  const value = text && text.trim() ? text.trim() : null;
  db.prepare(
    "UPDATE bots SET current_task = ?, status = NULL, status_level = NULL, current_task_updated_at = ? WHERE id = ?",
  ).run(value, value ? Date.now() : null, botId);
}

export { db };

export interface ProviderRow {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string[];
  created_at: number;
}

interface ProviderDbRow {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string;
  created_at: number;
}

function toProvider(row: ProviderDbRow): ProviderRow {
  let models: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.models);
    if (Array.isArray(parsed))
      models = parsed.filter((m): m is string => typeof m === "string");
  } catch {
    // fall through with empty list
  }
  return { ...row, models };
}

export function listProviders(): ProviderRow[] {
  const rows = db
    .prepare("SELECT * FROM providers ORDER BY name COLLATE NOCASE")
    .all() as ProviderDbRow[];
  return rows.map(toProvider);
}

export function getProvider(id: string): ProviderRow | undefined {
  const row = db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as
    | ProviderDbRow
    | undefined;
  return row ? toProvider(row) : undefined;
}

export function insertProvider(p: ProviderRow): void {
  db.prepare(
    "INSERT INTO providers (id, name, base_url, api_key, models, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    p.id,
    p.name,
    p.base_url,
    p.api_key,
    JSON.stringify(p.models),
    p.created_at,
  );
}

export function updateProvider(
  id: string,
  fields: Partial<Omit<ProviderRow, "id">>,
): boolean {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of ["name", "base_url", "api_key", "models"] as const) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(key === "models" ? JSON.stringify(fields.models) : fields[key]);
    }
  }
  if (sets.length === 0) return false;
  vals.push(id);
  const result = db
    .prepare(`UPDATE providers SET ${sets.join(", ")} WHERE id = ?`)
    .run(...vals);
  return result.changes > 0;
}

export function deleteProvider(id: string): boolean {
  return db.prepare("DELETE FROM providers WHERE id = ?").run(id).changes > 0;
}

export function getSetting(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function deleteSetting(key: string): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export interface McpServerRow {
  id: string;
  name: string;
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: number;
  created_at: number;
}

db.prepare(
  `CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
).run();

db.exec(
  `CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    transport TEXT NOT NULL DEFAULT 'stdio',
    command TEXT NOT NULL,
    args TEXT NOT NULL DEFAULT '[]',
    env TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );`,
);

function hydrateMcp(
  row: McpServerRow & { args: string; env: string },
): McpServerRow {
  return {
    ...row,
    args: JSON.parse(row.args) as string[],
    env: JSON.parse(row.env) as Record<string, string>,
  };
}

export interface SkillRow {
  id: string;
  name: string;
  description: string;
  instructions: string;
  created_at: number;
}

export function listSkills(): SkillRow[] {
  return db
    .prepare("SELECT * FROM skills ORDER BY name COLLATE NOCASE")
    .all() as SkillRow[];
}

export function getSkill(id: string): SkillRow | undefined {
  return db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as
    | SkillRow
    | undefined;
}

export function insertSkill(skill: SkillRow): void {
  db.prepare(
    "INSERT INTO skills (id, name, description, instructions, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    skill.id,
    skill.name,
    skill.description,
    skill.instructions,
    skill.created_at,
  );
}

export function updateSkill(
  id: string,
  fields: Partial<Pick<SkillRow, "name" | "description" | "instructions">>,
): void {
  const sets = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(", ");
  db.prepare(`UPDATE skills SET ${sets} WHERE id = ?`).run(
    ...Object.values(fields),
    id,
  );
}

export function deleteSkill(id: string): void {
  db.prepare("DELETE FROM skills WHERE id = ?").run(id);
}

export function listMcpServers(): McpServerRow[] {
  return (
    db
      .prepare("SELECT * FROM mcp_servers ORDER BY name")
      .all() as (McpServerRow & { args: string; env: string })[]
  ).map(hydrateMcp);
}

export function getMcpServer(id: string): McpServerRow | undefined {
  const row = db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as
    | (McpServerRow & { args: string; env: string })
    | undefined;
  return row && hydrateMcp(row);
}

export function getMcpServerByName(name: string): McpServerRow | undefined {
  const row = db
    .prepare("SELECT * FROM mcp_servers WHERE name = ?")
    .get(name) as (McpServerRow & { args: string; env: string }) | undefined;
  return row && hydrateMcp(row);
}

export function insertMcpServer(server: McpServerRow): void {
  db.prepare(
    `INSERT INTO mcp_servers (id, name, transport, command, args, env, enabled, created_at)
     VALUES (@id, @name, @transport, @command, @args, @env, @enabled, @created_at)`,
  ).run({
    ...server,
    args: JSON.stringify(server.args),
    env: JSON.stringify(server.env),
  });
}

export function updateMcpServer(
  id: string,
  patch: Partial<Omit<McpServerRow, "id">>,
): void {
  const current = getMcpServer(id);
  if (!current) return;
  const next = { ...current, ...patch };
  db.prepare(
    `UPDATE mcp_servers SET name=@name, transport=@transport, command=@command,
       args=@args, env=@env, enabled=@enabled WHERE id=@id`,
  ).run({
    ...next,
    args: JSON.stringify(next.args),
    env: JSON.stringify(next.env),
  });
}

export function deleteMcpServer(id: string): void {
  db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string;
  instructions: string;
  machine_id: string | null;
  role_id: string | null;
  triggers: string;
  created_at: number;
}

export interface Template extends Omit<TemplateRow, "triggers"> {
  triggers: { message: string; schedule: string }[];
}

function toTemplate(row: TemplateRow): Template {
  return { ...row, triggers: JSON.parse(row.triggers) as Template["triggers"] };
}

export function listTemplates(): Template[] {
  return (
    db
      .prepare("SELECT * FROM templates ORDER BY created_at DESC")
      .all() as TemplateRow[]
  ).map(toTemplate);
}

export function getTemplate(id: string): Template | undefined {
  const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(id) as
    | TemplateRow
    | undefined;
  return row && toTemplate(row);
}

export function insertTemplate(t: {
  id: string;
  name: string;
  description: string;
  instructions: string;
  machine_id: string | null;
  role_id: string | null;
  triggers: string;
  created_at: number;
}): Template {
  db.prepare(
    `INSERT INTO templates (id, name, description, instructions, machine_id, role_id, triggers, created_at)
     VALUES (@id, @name, @description, @instructions, @machine_id, @role_id, @triggers, @created_at)`,
  ).run(t);
  return getTemplate(t.id) as Template;
}

export function updateTemplate(
  id: string,
  patch: Partial<Omit<TemplateRow, "id" | "created_at">>,
): void {
  const sets = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(", ");
  db.prepare(`UPDATE templates SET ${sets} WHERE id = @id`).run({
    ...patch,
    id,
  });
}

export function deleteTemplate(id: string): void {
  db.prepare("DELETE FROM templates WHERE id = ?").run(id);
}

export interface ApiKeyRow {
  id: string;
  name: string;
  user_id: string | null;
  created_at: number;
  last_used_at: number | null;
}

export function insertApiKey(key: {
  id: string;
  name: string;
  hash: string;
  user_id: string | null;
  created_at: number;
}): void {
  db.prepare(
    "INSERT INTO api_keys (id, name, hash, user_id, created_at) VALUES (@id, @name, @hash, @user_id, @created_at)",
  ).run(key);
}

export function listApiKeys(userId: string): ApiKeyRow[] {
  return db
    .prepare(
      "SELECT id, name, user_id, created_at, last_used_at FROM api_keys WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC",
    )
    .all(userId) as ApiKeyRow[];
}

export function getApiKeyByHash(hash: string): ApiKeyRow | undefined {
  return db
    .prepare(
      "SELECT id, name, user_id, created_at, last_used_at FROM api_keys WHERE hash = ?",
    )
    .get(hash) as ApiKeyRow | undefined;
}

export function touchApiKey(id: string, ts: number): void {
  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(ts, id);
}

export function deleteApiKey(id: string, userId: string): boolean {
  const res = db
    .prepare(
      "DELETE FROM api_keys WHERE id = ? AND (user_id = ? OR user_id IS NULL)",
    )
    .run(id, userId);
  return res.changes > 0;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
}

// scrypt with a per-user random salt; format: scrypt$<saltHex>$<hashHex>.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

export function countUsers(): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as {
    n: number;
  };
  return row.n;
}

export function insertUser(user: {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
}): void {
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (@id, @email, @password_hash, @created_at)",
  ).run(user);
}

export function getUserByEmail(email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
    | UserRow
    | undefined;
}

export function getUserById(id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
}

export function setUserPassword(userId: string, passwordHash: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    passwordHash,
    userId,
  );
}

// Session tokens are random and only their sha256 is stored.
export function createSession(
  userId: string,
  expiresAt: number,
): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).run(tokenHash, userId, expiresAt, Date.now());
  return { token, tokenHash };
}

export function getSessionUser(token: string): UserRow | undefined {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  return db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash, Date.now()) as UserRow | undefined;
}

export function deleteSession(token: string): void {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

// Password changes invalidate every other device.
export function deleteSessionsForUser(
  userId: string,
  keepTokenHash?: string,
): void {
  if (keepTokenHash)
    db.prepare(
      "DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?",
    ).run(userId, keepTokenHash);
  else db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}
