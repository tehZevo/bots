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
import { decryptSecret, encryptSecret } from "./encryption.ts";
import { notificationTargetPath } from "./notification-targets.ts";

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
  archived: number;
  current_task: string | null;
  current_task_updated_at: number | null;
  status: string | null;
  status_level: "ok" | "issue" | "blocked" | null;
  token_budget: number | null;
  watchdog_hours: number | null;
  watchdog_tripped: number;
  watchdog_run_started_at: number | null;
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
  kind: "schedule" | "webhook" | "continuous";
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
  trigger:
    | "schedule"
    | "manual"
    | "chat"
    | "webhook"
    | "dm"
    | "continuous"
    | "watchdog";
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
  run_id: string | null;
  target_path: string | null;
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

export type HookEventType =
  | "run.finished"
  | "bot.blocked"
  | "bot.recovered"
  | "notification.created"
  | "breaker.tripped";

export type AppEventType = HookEventType | "ping";

export interface AppEvent {
  id: string;
  type: AppEventType;
  occurred_at: number;
  data: unknown;
}

let onAppEvent: ((event: AppEvent) => void) | null = null;

export function setOnAppEvent(cb: ((event: AppEvent) => void) | null): void {
  onAppEvent = cb;
}

function emitAppEvent(type: AppEventType, data: unknown): void {
  if (!onAppEvent) return;
  const event: AppEvent = {
    id: randomUUID(),
    type,
    occurred_at: Date.now(),
    data,
  };
  try {
    onAppEvent(event);
  } catch (error) {
    console.error("app event listener failed:", error);
  }
}

export function publishAppEvent(type: AppEventType, data: unknown): void {
  emitAppEvent(type, data);
}

mkdirSync(dirname(config.databasePath), { recursive: true });

import { logAudit } from "./audit.ts";

const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");

export function runInTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}

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
    archived INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS device_grants (
    id TEXT PRIMARY KEY,
    device_code_hash TEXT NOT NULL UNIQUE,
    user_code TEXT NOT NULL,
    client_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    key_name TEXT,
    api_key_id TEXT,
    api_value TEXT,
    owner_email TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_polled_at INTEGER
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
    run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
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

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    leader INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (team_id, bot_id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bot_projects (
    bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (bot_id, project_id)
  );

  CREATE TABLE IF NOT EXISTS team_projects (
    team_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (team_id, project_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    bot_id TEXT REFERENCES bots(id) ON DELETE CASCADE,
    run_id TEXT,
    target_path TEXT,
    dedupe_key TEXT UNIQUE,
    "read" INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pending_injections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS run_usage (
    run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
    bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    input INTEGER NOT NULL DEFAULT 0,
    output INTEGER NOT NULL DEFAULT 0,
    cache_read INTEGER NOT NULL DEFAULT 0,
    cache_write INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL,
    actor_id TEXT,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT,
    target_name TEXT,
    summary TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit (created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_messages_bot ON messages (bot_id, id);
  CREATE INDEX IF NOT EXISTS idx_runs_bot ON runs (bot_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_triggers_due ON triggers (next_run_at);
  CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pending_bot ON pending_injections (bot_id, id);
  CREATE INDEX IF NOT EXISTS idx_run_usage_bot ON run_usage (bot_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS event_destinations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL DEFAULT '',
    event_types TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hook_deliveries (
    id TEXT PRIMARY KEY,
    destination_id TEXT NOT NULL REFERENCES event_destinations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
    http_status INTEGER,
    duration_ms INTEGER NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 1,
    error TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_hook_deliveries_destination
    ON hook_deliveries (destination_id, created_at DESC);
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

if (!botColumns.has("token_budget"))
  db.prepare("ALTER TABLE bots ADD COLUMN token_budget INTEGER").run();

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

const notificationColumns = new Set(
  (
    db.prepare("PRAGMA table_info(notifications)").all() as { name: string }[]
  ).map((column) => column.name),
);
if (!notificationColumns.has("run_id"))
  db.prepare("ALTER TABLE notifications ADD COLUMN run_id TEXT").run();
if (!notificationColumns.has("target_path"))
  db.prepare("ALTER TABLE notifications ADD COLUMN target_path TEXT").run();

for (const row of db
  .prepare(
    "SELECT id, kind, bot_id, run_id, dedupe_key FROM notifications WHERE target_path IS NULL",
  )
  .all() as {
  id: string;
  kind: string;
  bot_id: string | null;
  run_id: string | null;
  dedupe_key: string | null;
}[]) {
  const legacyRunId =
    row.run_id ??
    /^(?:run-error|watchdog):(.+)$/.exec(row.dedupe_key ?? "")?.[1];
  const path = notificationTargetPath({
    kind: row.kind,
    botId: row.bot_id,
    runId: legacyRunId ?? null,
  });
  if (legacyRunId || path) {
    db.prepare(
      "UPDATE notifications SET run_id = ?, target_path = ? WHERE id = ?",
    ).run(legacyRunId ?? null, path, row.id);
  }
}

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

if (!botColumns.has("watchdog_hours"))
  db.prepare("ALTER TABLE bots ADD COLUMN watchdog_hours INTEGER").run();
if (!botColumns.has("watchdog_tripped"))
  db.prepare(
    "ALTER TABLE bots ADD COLUMN watchdog_tripped INTEGER NOT NULL DEFAULT 0",
  ).run();
if (!botColumns.has("watchdog_run_started_at"))
  db.prepare(
    "ALTER TABLE bots ADD COLUMN watchdog_run_started_at INTEGER",
  ).run();
if (!botColumns.has("archived"))
  db.prepare(
    "ALTER TABLE bots ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
  ).run();

db.exec(`
  UPDATE messages SET run_id = NULL WHERE run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM runs WHERE runs.id = messages.run_id
  );
  UPDATE bots SET machine_id = NULL WHERE machine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM machines WHERE machines.id = bots.machine_id
  );
  UPDATE bots SET role_id = NULL WHERE role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM roles WHERE roles.id = bots.role_id
  );
  UPDATE templates SET machine_id = NULL WHERE machine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM machines WHERE machines.id = templates.machine_id
  );
  UPDATE templates SET role_id = NULL WHERE role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM roles WHERE roles.id = templates.role_id
  );
  DELETE FROM run_usage WHERE NOT EXISTS (
    SELECT 1 FROM runs WHERE runs.id = run_usage.run_id
  );
`);

const messageForeignKeys = new Set(
  (
    db.prepare("PRAGMA foreign_key_list(messages)").all() as {
      from: string;
      table: string;
    }[]
  ).map((fk) => `${fk.from}->${fk.table}`),
);
if (!messageForeignKeys.has("run_id->runs")) {
  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE messages_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      INSERT INTO messages_new (id, bot_id, run_id, role, payload, created_at)
      SELECT id, bot_id, run_id, role, payload, created_at FROM messages ORDER BY id;
      DROP TABLE messages;
      ALTER TABLE messages_new RENAME TO messages;
      CREATE INDEX IF NOT EXISTS idx_messages_bot ON messages (bot_id, id);
    `);
  });
  migrate();
}

db.pragma("foreign_keys = ON");

export function listBots(includeArchived = false): BotRow[] {
  const where = includeArchived ? "" : "WHERE archived = 0";
  return db
    .prepare(`SELECT * FROM bots ${where} ORDER BY created_at`)
    .all() as BotRow[];
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
  | "watchdog_hours"
  | "watchdog_tripped"
  | "watchdog_run_started_at"
  | "archived"
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
      | "watchdog_hours"
      | "archived"
    >
  >;

export function insertBot(bot: NewBot): void {
  db.prepare(
    `INSERT INTO bots (id, name, instructions, model_id, role_id, machine_id, avatar_shape, avatar_color, sound, watchdog_hours, enabled, archived, created_at)
     VALUES (@id, @name, @instructions, @model_id, @role_id, @machine_id, @avatar_shape, @avatar_color, @sound, @watchdog_hours, @enabled, @archived, @created_at)`,
  ).run({
    archived: 0,
    model_id: null,
    role_id: null,
    machine_id: null,
    avatar_shape: null,
    avatar_color: null,
    sound: null,
    watchdog_hours: null,
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
  db.prepare("UPDATE templates SET machine_id = NULL WHERE machine_id = ?").run(
    id,
  );
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
  let needsWatchdogReset = false;
  if (keys.includes("enabled") || keys.includes("watchdog_hours")) {
    const current = getBot(id);
    if (current) {
      if (
        patch.enabled !== undefined &&
        Number(patch.enabled) !== Number(current.enabled)
      )
        needsWatchdogReset = true;
      if (
        patch.watchdog_hours !== undefined &&
        patch.watchdog_hours !== current.watchdog_hours
      )
        needsWatchdogReset = true;
    }
  }
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE bots SET ${sets} WHERE id = @id`).run({ ...patch, id });
  if (needsWatchdogReset) resetWatchdog(id);
}

export function deleteBot(id: string): void {
  db.prepare("DELETE FROM triggers WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM runs WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM messages WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM notifications WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM team_members WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM bot_projects WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM bot_tags WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM bot_secret WHERE bot_id = ?").run(id);
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
  db.prepare("UPDATE templates SET role_id = NULL WHERE role_id = ?").run(id);
  db.prepare("DELETE FROM roles WHERE id = ?").run(id);
}

export interface TeamRow {
  id: string;
  name: string;
  created_at: number;
}

export interface TeamMemberRow {
  bot_id: string;
  name: string;
  leader: boolean;
}

export interface Team extends TeamRow {
  members: TeamMemberRow[];
  project_ids: string[];
}

export function listTeams(): Team[] {
  const teams = db
    .prepare("SELECT * FROM teams ORDER BY created_at")
    .all() as TeamRow[];
  const memberStmt = db.prepare(
    `SELECT tm.bot_id, b.name, tm.leader FROM team_members tm
     JOIN bots b ON b.id = tm.bot_id
     WHERE tm.team_id = ? ORDER BY tm.leader DESC, b.name`,
  );
  const projectStmt = db.prepare(
    "SELECT project_id FROM team_projects WHERE team_id = ?",
  );
  return teams.map((t) => ({
    ...t,
    members: (
      memberStmt.all(t.id) as { bot_id: string; name: string; leader: number }[]
    ).map((m) => ({ bot_id: m.bot_id, name: m.name, leader: m.leader === 1 })),
    project_ids: (projectStmt.all(t.id) as { project_id: string }[]).map(
      (p) => p.project_id,
    ),
  }));
}

export function setTeamProjects(teamId: string, projectIds: string[]): void {
  db.prepare("DELETE FROM team_projects WHERE team_id = ?").run(teamId);
  const ins = db.prepare(
    "INSERT OR IGNORE INTO team_projects (team_id, project_id) VALUES (?, ?)",
  );
  for (const id of new Set(projectIds)) ins.run(teamId, id);
}

export function getTeam(id: string): Team | undefined {
  const t = db.prepare("SELECT * FROM teams WHERE id = ?").get(id) as
    | TeamRow
    | undefined;
  if (!t) return undefined;
  return listTeams().find((x) => x.id === id);
}

export function insertTeam(team: TeamRow): void {
  db.prepare(
    "INSERT INTO teams (id, name, created_at) VALUES (@id, @name, @created_at)",
  ).run(team);
}

export function renameTeam(id: string, name: string): void {
  db.prepare("UPDATE teams SET name = ? WHERE id = ?").run(name, id);
}

export function deleteTeam(id: string): void {
  db.prepare("DELETE FROM team_members WHERE team_id = ?").run(id);
  db.prepare("DELETE FROM team_secret WHERE team_id=?").run(id);
  db.prepare("DELETE FROM team_projects WHERE team_id = ?").run(id);
  db.prepare("DELETE FROM teams WHERE id = ?").run(id);
}

export function setTeamMember(
  teamId: string,
  botId: string,
  leader: boolean,
): void {
  db.prepare(
    `INSERT INTO team_members (team_id, bot_id, leader) VALUES (?, ?, ?)
     ON CONFLICT (team_id, bot_id) DO UPDATE SET leader = excluded.leader`,
  ).run(teamId, botId, leader ? 1 : 0);
}

export function removeTeamMember(teamId: string, botId: string): void {
  db.prepare("DELETE FROM team_members WHERE team_id = ? AND bot_id = ?").run(
    teamId,
    botId,
  );
}

export function teamIdsByBot(): Map<string, { id: string; leader: boolean }[]> {
  const map = new Map<string, { id: string; leader: boolean }[]>();
  for (const row of db
    .prepare(
      "SELECT bot_id, team_id, leader FROM team_members ORDER BY team_id",
    )
    .all() as { bot_id: string; team_id: string; leader: number }[]) {
    const list = map.get(row.bot_id) ?? [];
    list.push({ id: row.team_id, leader: row.leader === 1 });
    map.set(row.bot_id, list);
  }
  return map;
}

export function setTeamMembershipsForBot(
  botId: string,
  memberships: { team_id: string; leader: boolean }[],
): void {
  db.prepare("DELETE FROM team_members WHERE bot_id = ?").run(botId);
  const ins = db.prepare(
    `INSERT INTO team_members (team_id, bot_id, leader) VALUES (?, ?, ?)
     ON CONFLICT (team_id, bot_id) DO UPDATE SET leader = excluded.leader`,
  );
  for (const m of new Map(memberships.map((x) => [x.team_id, x])).values()) {
    ins.run(m.team_id, botId, m.leader ? 1 : 0);
  }
}

export interface TeammateRow {
  id: string;
  name: string;
  role_name: string | null;
  leader_of: string[];
}

export function teammatesOf(botId: string): TeammateRow[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT b.id, b.name, r.name AS role_name,
              CASE WHEN tm.leader = 1 THEN t.name ELSE NULL END AS leader_team
       FROM team_members mine
       JOIN team_members tm ON tm.team_id = mine.team_id AND tm.bot_id != mine.bot_id
       JOIN teams t ON t.id = tm.team_id
       JOIN bots b ON b.id = tm.bot_id
       LEFT JOIN roles r ON r.id = b.role_id
       WHERE mine.bot_id = ?`,
    )
    .all(botId) as (TeammateRow & { leader_team: string | null })[];
  const byId = new Map<string, TeammateRow>();
  for (const row of rows) {
    const entry = byId.get(row.id) ?? {
      id: row.id,
      name: row.name,
      role_name: row.role_name,
      leader_of: [],
    };
    if (row.leader_team && !entry.leader_of.includes(row.leader_team))
      entry.leader_of.push(row.leader_team);
    byId.set(row.id, entry);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function sharesTeamWith(
  senderBotId: string,
  otherBotId: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS hit FROM team_members a
       JOIN team_members b ON a.team_id = b.team_id
       WHERE a.bot_id = ? AND b.bot_id = ? LIMIT 1`,
    )
    .get(senderBotId, otherBotId) as { hit: number } | undefined;
  return row !== undefined;
}

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  body: string;
  created_at: number;
}

export function listProjects(): ProjectRow[] {
  return db
    .prepare("SELECT * FROM projects ORDER BY created_at")
    .all() as ProjectRow[];
}

export function getProject(id: string): ProjectRow | undefined {
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as
    | ProjectRow
    | undefined;
}

export function insertProject(project: ProjectRow): void {
  db.prepare(
    `INSERT INTO projects (id, name, description, body, created_at)
     VALUES (@id, @name, @description, @body, @created_at)`,
  ).run(project);
}

export function updateProject(
  id: string,
  patch: Partial<Omit<ProjectRow, "id" | "created_at">>,
): void {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE projects SET ${sets} WHERE id = @id`).run({
    ...patch,
    id,
  });
}

export function deleteProject(id: string): void {
  db.prepare("DELETE FROM bot_projects WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM team_projects WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}

export function setBotProjects(botId: string, projectIds: string[]): void {
  db.prepare("DELETE FROM bot_projects WHERE bot_id = ?").run(botId);
  const ins = db.prepare(
    "INSERT OR IGNORE INTO bot_projects (bot_id, project_id) VALUES (?, ?)",
  );
  for (const pid of new Set(projectIds)) {
    if (!getProject(pid)) throw new Error(`unknown project: ${pid}`);
    ins.run(botId, pid);
  }
}

export function projectsForBot(botId: string): ProjectRow[] {
  return db
    .prepare(
      `SELECT p.* FROM bot_projects bp JOIN projects p ON p.id = bp.project_id
       WHERE bp.bot_id = ? ORDER BY p.created_at`,
    )
    .all(botId) as ProjectRow[];
}

export function projectIdsByBot(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of db
    .prepare("SELECT bot_id, project_id FROM bot_projects ORDER BY project_id")
    .all() as { bot_id: string; project_id: string }[]) {
    const list = map.get(row.bot_id) ?? [];
    list.push(row.project_id);
    map.set(row.bot_id, list);
  }
  return map;
}

export interface TagRow {
  id: string;
  name: string;
  created_at: number;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bot_tags (
    bot_id TEXT NOT NULL REFERENCES bots(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (bot_id, tag_id)
  );
`);

export function listTags(): (TagRow & { bot_count: number })[] {
  return db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM bot_tags bt WHERE bt.tag_id = t.id) AS bot_count
       FROM tags t ORDER BY t.name COLLATE NOCASE`,
    )
    .all() as (TagRow & { bot_count: number })[];
}

export function getTag(id: string): TagRow | undefined {
  return db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as
    | TagRow
    | undefined;
}

export function tagByName(name: string): TagRow | undefined {
  return db
    .prepare("SELECT * FROM tags WHERE name = ? COLLATE NOCASE")
    .get(name) as TagRow | undefined;
}

export function insertTag(tag: TagRow): void {
  db.prepare("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)").run(
    tag.id,
    tag.name,
    tag.created_at,
  );
}

export function renameTag(id: string, name: string): void {
  db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(name, id);
}

export function deleteTag(id: string): void {
  db.prepare("DELETE FROM bot_tags WHERE tag_id = ?").run(id);
  db.prepare("DELETE FROM tags WHERE id = ?").run(id);
}

export function setBotTags(botId: string, tagIds: string[]): void {
  db.prepare("DELETE FROM bot_tags WHERE bot_id = ?").run(botId);
  const ins = db.prepare(
    "INSERT OR IGNORE INTO bot_tags (bot_id, tag_id) VALUES (?, ?)",
  );
  for (const tid of new Set(tagIds)) {
    if (!getTag(tid)) throw new Error(`unknown tag: ${tid}`);
    ins.run(botId, tid);
  }
}

export function tagsForBot(botId: string): TagRow[] {
  return db
    .prepare(
      `SELECT t.* FROM bot_tags bt JOIN tags t ON t.id = bt.tag_id
       WHERE bt.bot_id = ? ORDER BY t.name COLLATE NOCASE`,
    )
    .all(botId) as TagRow[];
}

export function tagIdsByBot(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of db
    .prepare("SELECT bot_id, tag_id FROM bot_tags ORDER BY tag_id")
    .all() as { bot_id: string; tag_id: string }[]) {
    const list = map.get(row.bot_id) ?? [];
    list.push(row.tag_id);
    map.set(row.bot_id, list);
  }
  return map;
}

export interface SecretRow {
  id: string;
  name: string;
  key: string;
  value: string;
  created_at: number;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS secret (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL COLLATE NOCASE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bot_secret (
    bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    secret_id TEXT NOT NULL REFERENCES secret(id) ON DELETE CASCADE,
    PRIMARY KEY (bot_id, secret_id)
  );

  CREATE TABLE IF NOT EXISTS team_secret (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    secret_id TEXT NOT NULL REFERENCES secret(id) ON DELETE CASCADE,
    PRIMARY KEY (team_id, secret_id)
  );

  CREATE TABLE IF NOT EXISTS secret_material (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function secretLabel(name: string): string {
  return `secret "${name}"`;
}

interface RawSecretRow extends Omit<SecretRow, "value"> {
  value: string;
}

function toSecret(row: RawSecretRow): SecretRow {
  return { ...row, value: decryptSecret(row.value, secretLabel(row.name)) };
}

export function listSecret(): Omit<SecretRow, "value">[] {
  return db
    .prepare(
      `SELECT id, name, key, created_at FROM secret ORDER BY name COLLATE NOCASE`,
    )
    .all() as Omit<SecretRow, "value">[];
}

function getRawSecret(id: string): RawSecretRow | undefined {
  return db.prepare("SELECT * FROM secret WHERE id = ?").get(id) as
    | RawSecretRow
    | undefined;
}

export function getSecret(id: string): SecretRow | undefined {
  const row = getRawSecret(id);
  return row && toSecret(row);
}

export function findSecretByName(name: string): SecretRow | undefined {
  const row = db
    .prepare("SELECT * FROM secret WHERE name = ? COLLATE NOCASE")
    .get(name) as RawSecretRow | undefined;
  return row && toSecret(row);
}

export function insertSecret(s: SecretRow): void {
  db.prepare(
    `INSERT INTO secret (id, name, key, value, created_at)
     VALUES (@id, @name, @key, @value, @created_at)`,
  ).run({ ...s, value: encryptSecret(s.value) });
}

export function updateSecret(
  id: string,
  patch: Partial<Pick<SecretRow, "name" | "key" | "value">>,
): void {
  const cur = getRawSecret(id);
  if (!cur) throw new Error(`unknown secret ${id}`);
  db.prepare(
    `UPDATE secret SET name = @name, key = @key, value = @value WHERE id = @id`,
  ).run({
    ...cur,
    ...patch,
    value: patch.value === undefined ? cur.value : encryptSecret(patch.value),
  });
}

export function listStoredSecretValues(): {
  id: string;
  name: string;
  value: string;
}[] {
  return db
    .prepare("SELECT id, name, value FROM secret ORDER BY rowid")
    .all() as { id: string; name: string; value: string }[];
}

export function setStoredSecretValue(id: string, stored: string): void {
  db.prepare("UPDATE secret SET value = ? WHERE id = ?").run(stored, id);
}

export function deleteSecret(id: string): void {
  db.prepare("DELETE FROM bot_secret WHERE secret_id = ?").run(id);
  db.prepare("DELETE FROM team_secret WHERE secret_id = ?").run(id);
  db.prepare("DELETE FROM secret WHERE id = ?").run(id);
}

export const VAPID_MATERIAL_NAME = "vapid";

function materialLabel(name: string): string {
  return name === VAPID_MATERIAL_NAME
    ? "push VAPID key"
    : `encrypted material "${name}"`;
}

function getRawSecretMaterial(name: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM secret_material WHERE name = ?")
    .get(name) as { value: string } | undefined;
  return row?.value;
}

export function listStoredSecretMaterials(): { name: string; value: string }[] {
  return db
    .prepare("SELECT name, value FROM secret_material ORDER BY name")
    .all() as { name: string; value: string }[];
}

export function setStoredSecretMaterialValue(
  name: string,
  stored: string,
): void {
  db.prepare(
    `INSERT INTO secret_material (name, value) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
  ).run(name, stored);
}

export function hasSecretMaterial(name: string): boolean {
  return getRawSecretMaterial(name) !== undefined;
}

export function getSecretMaterial(name: string): string | undefined {
  const stored = getRawSecretMaterial(name);
  return stored === undefined
    ? undefined
    : decryptSecret(stored, materialLabel(name));
}

export function setSecretMaterial(name: string, value: string): void {
  setStoredSecretMaterialValue(name, encryptSecret(value));
}

export function getVapidPairJson(): string | undefined {
  return getSecretMaterial(VAPID_MATERIAL_NAME);
}

export function saveVapidPairJson(value: string): void {
  setSecretMaterial(VAPID_MATERIAL_NAME, value);
}

function assertKnownSecrets(ids: string[]): void {
  for (const sid of ids)
    if (!getSecret(sid)) throw new Error(`unknown secret ${sid}`);
}

export function setBotSecret(botId: string, secretIds: string[]): void {
  const ids = [...new Set(secretIds)];
  assertKnownSecrets(ids);
  db.prepare("DELETE FROM bot_secret WHERE bot_id = ?").run(botId);
  const ins = db.prepare(
    "INSERT OR IGNORE INTO bot_secret (bot_id, secret_id) VALUES (?, ?)",
  );
  for (const sid of ids) ins.run(botId, sid);
}

export function setTeamSecret(teamId: string, secretIds: string[]): void {
  const ids = [...new Set(secretIds)];
  assertKnownSecrets(ids);
  db.prepare("DELETE FROM team_secret WHERE team_id = ?").run(teamId);
  const ins = db.prepare(
    "INSERT OR IGNORE INTO team_secret (team_id, secret_id) VALUES (?, ?)",
  );
  for (const sid of ids) ins.run(teamId, sid);
}

export function botSecretIds(botId: string): string[] {
  return (
    db
      .prepare(
        "SELECT secret_id FROM bot_secret WHERE bot_id = ? ORDER BY secret_id",
      )
      .all(botId) as { secret_id: string }[]
  ).map((r) => r.secret_id);
}

export function teamSecretIds(teamId: string): string[] {
  return (
    db
      .prepare(
        "SELECT secret_id FROM team_secret WHERE team_id = ? ORDER BY secret_id",
      )
      .all(teamId) as { secret_id: string }[]
  ).map((r) => r.secret_id);
}

function botSecretRows(botId: string): SecretRow[] {
  const rows = db
    .prepare(
      `SELECT s.* FROM bot_secret bs JOIN secret s ON s.id = bs.secret_id
       WHERE bs.bot_id = ? ORDER BY s.name ASC, s.key ASC`,
    )
    .all(botId) as RawSecretRow[];
  return rows.map(toSecret);
}

function teamSecretRowsForBot(botId: string): SecretRow[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT s.* FROM team_secret ts
       JOIN team_members tm ON tm.team_id = ts.team_id
       JOIN secret s ON s.id = ts.secret_id
       WHERE tm.bot_id = ? ORDER BY s.name ASC, s.key ASC`,
    )
    .all(botId) as RawSecretRow[];
  return rows.map(toSecret);
}

export function secretEnvForBot(botId: string): Record<string, string> {
  const env: Record<string, string> = {};
  // team-level secrets first; bot-level assignments override on key collision
  for (const s of teamSecretRowsForBot(botId)) env[s.key] = s.value;
  for (const s of botSecretRows(botId)) env[s.key] = s.value;
  return env;
}

// specs/secrets/redaction.md — assigned secret values, keyed by their name.
export function redactionSecretsForBot(
  botId: string,
): { name: string; value: string }[] {
  const byKey = new Map<string, { name: string; value: string }>();
  for (const s of teamSecretRowsForBot(botId))
    byKey.set(s.key, { name: s.key, value: s.value });
  for (const s of botSecretRows(botId))
    byKey.set(s.key, { name: s.key, value: s.value });
  return [...byKey.values()];
}

function hasTable(name: string): boolean {
  return (
    db
      .prepare(
        "SELECT 1 AS hit FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get(name) !== undefined
  );
}

export function projectsInheritedByBot(botId: string): ProjectRow[] {
  if (!hasTable("team_members")) return [];
  return db
    .prepare(
      `SELECT DISTINCT p.* FROM team_projects tp
       JOIN team_members tm ON tm.team_id = tp.team_id
       JOIN projects p ON p.id = tp.project_id
       WHERE tm.bot_id = ? ORDER BY p.created_at`,
    )
    .all(botId) as ProjectRow[];
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
        WHERE b.enabled = 1 AND b.archived = 0 AND t.enabled = 1 AND t.next_run_at IS NOT NULL AND t.next_run_at <= ?`,
    )
    .all(now) as TriggerRow[];
}

function setWatchdogActivity(botId: string, startedAt: number | null): void {
  const current = db
    .prepare("SELECT watchdog_tripped FROM bots WHERE id = ?")
    .get(botId) as { watchdog_tripped?: number } | undefined;
  db.prepare(
    "UPDATE bots SET watchdog_run_started_at = ?, watchdog_tripped = 0 WHERE id = ?",
  ).run(startedAt, botId);
  if (current?.watchdog_tripped) setBotStatus(botId, null);
}

export function markWatchdogActivity(botId: string, startedAt: number): void {
  setWatchdogActivity(botId, startedAt);
}

export function resetWatchdog(botId: string): void {
  setWatchdogActivity(botId, null);
}

export function insertRun(run: RunRow): void {
  db.prepare(
    `INSERT INTO runs (id, bot_id, status, trigger, started_at, finished_at, output, error)
     VALUES (@id, @bot_id, @status, @trigger, @started_at, @finished_at, @output, @error)`,
  ).run(run);
  if (run.trigger !== "watchdog")
    markWatchdogActivity(run.bot_id, run.started_at);
}

let onNewNotification: ((n: NotificationRow) => void) | null = null;

export function setOnNewNotification(
  cb: ((n: NotificationRow) => void) | null,
): void {
  onNewNotification = cb;
}

export function createNotification(input: {
  kind: string;
  title: string;
  body: string;
  botId?: string | null;
  runId?: string | null;
  dedupeKey?: string | null;
}): void {
  const row: NotificationRow = {
    id: randomUUID(),
    kind: input.kind,
    title: input.title,
    body: input.body.slice(0, 1000),
    bot_id: input.botId ?? null,
    run_id: input.runId ?? null,
    target_path: notificationTargetPath({
      kind: input.kind,
      botId: input.botId ?? null,
      runId: input.runId ?? null,
    }),
    dedupe_key: input.dedupeKey ?? null,
    read: 0,
    created_at: Date.now(),
  };
  const result = db
    .prepare(
      `INSERT INTO notifications (id, kind, title, body, bot_id, run_id, target_path, dedupe_key, "read", created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(dedupe_key) DO NOTHING`,
    )
    .run(
      row.id,
      row.kind,
      row.title,
      row.body,
      row.bot_id,
      row.run_id,
      row.target_path,
      row.dedupe_key,
      row.created_at,
    );
  if (result.changes > 0) {
    if (onNewNotification) onNewNotification(row);
    emitAppEvent("notification.created", {
      id: row.id,
      kind: row.kind,
      title: row.title,
      bot_id: row.bot_id,
    });
  }
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
}

export function upsertPushSubscription(
  sub: Omit<PushSubscriptionRow, "created_at"> & { created_at?: number },
): void {
  db.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
     VALUES (@id, @user_id, @endpoint, @p256dh, @auth, @created_at)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id`,
  ).run({ created_at: Date.now(), ...sub });
}

export function listPushSubscriptions(): PushSubscriptionRow[] {
  return db
    .prepare("SELECT * FROM push_subscriptions")
    .all() as PushSubscriptionRow[];
}

export function removePushSubscription(endpoint: string): boolean {
  return (
    db
      .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
      .run(endpoint).changes > 0
  );
}

// API-facing removal: a user may only drop their own subscriptions;
// server-internal pruning keeps using removePushSubscription directly.
export function removePushSubscriptionOwned(
  endpoint: string,
  userId: string,
): boolean {
  return (
    db
      .prepare(
        "DELETE FROM push_subscriptions WHERE endpoint = ? AND (user_id IS NULL OR user_id = ?)",
      )
      .run(endpoint, userId).changes > 0
  );
}

function auditRunStart(run: RunRow): void {
  const bot = getBot(run.bot_id);
  logAudit({
    actor: bot
      ? { kind: "bot", id: bot.id, name: bot.name }
      : { kind: "system" },
    action: "run.start",
    targetKind: "run",
    targetId: run.id,
    summary: `trigger=${run.trigger ?? "manual"} bot=${bot?.name ?? run.bot_id}`,
  });
}

export function finishRun(
  id: string,
  status: "ok" | "error",
  output: string | null,
  error: string | null,
): void {
  const finishedAt = Date.now();
  const update = db.prepare(
    "UPDATE runs SET status = ?, finished_at = ?, output = ?, error = ? WHERE id = ?",
  );
  const getInfo = db.prepare(
    `SELECT r.bot_id, r.status, r.trigger, b.name FROM runs r
     LEFT JOIN bots b ON b.id = r.bot_id WHERE r.id = ?`,
  );
  const tx = db.transaction(() => {
    update.run(status, finishedAt, output, error, id);
    const info = getInfo.get(id) as
      | {
          bot_id: string | null;
          status: string;
          trigger: string | null;
          name: string | null;
        }
      | undefined;
    if (info?.bot_id && info.trigger !== "watchdog")
      markWatchdogActivity(info.bot_id, finishedAt);
    if (status !== "error") return;

    createNotification({
      kind: "run_error",
      title: `${info?.name ?? "Bot"}: run failed`,
      body:
        error || output || `Run ${info?.trigger ?? "manual"} ended in error.`,
      botId: info?.bot_id,
      runId: id,
      dedupeKey: `run-error:${id}`,
    });
  });
  tx();

  const info = getInfo.get(id) as
    | {
        bot_id: string | null;
        status: string;
        trigger: string | null;
        name: string | null;
      }
    | undefined;
  if (info?.bot_id) {
    emitAppEvent("run.finished", {
      id,
      status: info.status,
      source: info.trigger ?? "manual",
      bot: { id: info.bot_id, name: info.name ?? "" },
      tokens: getRunUsage(id),
    });
  }
  if (info?.bot_id) armContinuousTriggers(info.bot_id);
  {
    const info = db
      .prepare(
        `SELECT r.bot_id, r.trigger, b.name FROM runs r
         LEFT JOIN bots b ON b.id = r.bot_id WHERE r.id = ?`,
      )
      .get(id) as
      | { bot_id: string; trigger: string | null; name: string | null }
      | undefined;
    const action =
      status === "ok"
        ? "run.finish"
        : error && /interrupt/i.test(error)
          ? "run.interrupt"
          : "run.error";
    logAudit({
      actor: info
        ? { kind: "bot", id: info.bot_id, name: info.name ?? info.bot_id }
        : { kind: "system" },
      action,
      targetKind: "run",
      targetId: id,
      summary: error ?? output?.slice(0, 160) ?? status,
    });
  }
}

export function tripWatchdog(
  botId: string,
  name: string,
  hours: number,
  now = Date.now(),
): void {
  const runId = randomUUID();
  const message = `watchdog: no completed run in ${hours}h`;
  logAudit({
    actor: { kind: "system" },
    action: "watchdog.trip",
    targetKind: "bot",
    targetId: botId,
    targetName: name,
    summary: message,
  });
  insertRun({
    id: runId,
    bot_id: botId,
    status: "error",
    trigger: "watchdog",
    started_at: now,
    finished_at: now,
    output: null,
    error: message,
  });
  db.prepare("UPDATE bots SET watchdog_tripped = 1 WHERE id = ?").run(botId);
  setBotStatus(botId, message, "blocked");
  createNotification({
    kind: "watchdog",
    title: `${name}: watchdog tripped`,
    body: message,
    botId,
    runId,
    dedupeKey: `watchdog:${runId}`,
  });
}

export function evaluateWatchdogs(now = Date.now()): void {
  if (isPaused()) return;
  const due = db
    .prepare(
      `SELECT id, name, watchdog_hours FROM bots
        WHERE enabled = 1 AND archived = 0 AND watchdog_hours IS NOT NULL AND watchdog_tripped = 0
         AND watchdog_run_started_at IS NOT NULL
         AND ? > watchdog_run_started_at + (watchdog_hours * 3600000)`,
    )
    .all(now) as { id: string; name: string; watchdog_hours: number }[];
  for (const bot of due)
    tripWatchdog(bot.id, bot.name, bot.watchdog_hours, now);
}

export function continuousIntervalMs(schedule: string): number | null {
  const match = /^@every (\d+)\s*(s|m|h|d)$/i.exec(schedule.trim());
  if (!match) return null;
  const multiplier = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2].toLowerCase()
  ];
  if (!multiplier) return null;
  return Number(match[1]) * multiplier;
}

// Continuous triggers arm only after a run finishes (specs/triggers/continuous.md).
export function armContinuousTriggers(botId: string): void {
  const armed = db.prepare(
    "SELECT id, schedule FROM triggers WHERE bot_id = ? AND kind = 'continuous' AND enabled = 1",
  );
  const setNext = db.prepare(
    "UPDATE triggers SET next_run_at = ? WHERE id = ?",
  );
  for (const row of armed.all(botId) as { id: string; schedule: string }[]) {
    const ms = continuousIntervalMs(row.schedule);
    if (ms !== null) setNext.run(Date.now() + ms, row.id);
  }
}

// A crash leaves runs stuck in `running`; lifecycle requires every run to end
// in ok/error, so on boot they are finalized as interrupted.
export function sweepInterruptedRuns(): number {
  const stale = db
    .prepare("SELECT id FROM runs WHERE status = 'running'")
    .all() as { id: string }[];
  for (const run of stale) finishRun(run.id, "error", null, "interrupted");
  return stale.length;
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

export function getRun(id: string): RunRow | undefined {
  return db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as
    | RunRow
    | undefined;
}

// specs/runs/drill-down.md — deleting a run also removes its linked transcript rows.
export function deleteRun(runId: string): void {
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM messages WHERE run_id = ?").run(runId);
    db.prepare("DELETE FROM run_usage WHERE run_id = ?").run(runId);
    db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
  });
  remove();
}

// specs/runs/drill-down.md — chronological replay rows for one run.
export function listMessagesForRun(runId: string): MessageRow[] {
  return db
    .prepare(
      "SELECT * FROM messages WHERE run_id = ? ORDER BY created_at ASC, id ASC",
    )
    .all(runId) as MessageRow[];
}

export function getRunUsage(runId: string): UsageTotals | null {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(input), 0) AS input, COALESCE(SUM(output), 0) AS output,
       COALESCE(SUM(cache_read), 0) AS cache_read, COALESCE(SUM(cache_write), 0) AS cache_write
       FROM run_usage WHERE run_id = ?`,
    )
    .get(runId) as TokenUsage;
  const total = row.input + row.output + row.cache_read + row.cache_write;
  return total > 0 ? { ...row, total } : null;
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

db.exec(
  `CREATE TABLE IF NOT EXISTS bot_conversations (
    bot_id TEXT PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL UNIQUE,
    current_run_id TEXT
  );`,
);

db.exec(
  `CREATE TABLE IF NOT EXISTS durable_projection_entries (
    bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    entry_id TEXT NOT NULL,
    run_id TEXT,
    PRIMARY KEY (bot_id, entry_id)
  );`,
);

export function markDurableEntriesProjected(
  botId: string,
  entryIds: readonly string[],
): void {
  if (entryIds.length === 0) return;
  const insert = db.prepare(
    "INSERT OR IGNORE INTO durable_projection_entries (bot_id, entry_id, run_id) VALUES (?, ?, NULL)",
  );
  const tx = db.transaction(() => {
    for (const entryId of entryIds) insert.run(botId, entryId);
  });
  tx();
}

export function projectDurableEntryMessages(
  botId: string,
  runId: string | null,
  entryId: string,
  messages: readonly { role: string; payload: unknown }[],
): boolean {
  const claim = db.prepare(
    "INSERT OR IGNORE INTO durable_projection_entries (bot_id, entry_id, run_id) VALUES (?, ?, ?)",
  );
  const insertMessage = db.prepare(
    "INSERT INTO messages (bot_id, run_id, role, payload, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const tx = db.transaction(() => {
    if (claim.run(botId, entryId, runId).changes === 0) return false;
    for (const message of messages) {
      insertMessage.run(
        botId,
        runId,
        message.role,
        JSON.stringify(message.payload),
        Date.now(),
      );
    }
    return true;
  });
  return tx();
}

export function getBotConversation(botId: string): string | undefined {
  const row = db
    .prepare("SELECT conversation_id FROM bot_conversations WHERE bot_id = ?")
    .get(botId) as { conversation_id: string } | undefined;
  return row?.conversation_id;
}

export function setBotConversation(
  botId: string,
  conversationId: string,
): void {
  db.prepare(
    `INSERT INTO bot_conversations (bot_id, conversation_id)
     VALUES (?, ?)
     ON CONFLICT(bot_id) DO UPDATE SET conversation_id = excluded.conversation_id`,
  ).run(botId, conversationId);
}

export function listBotConversations(): {
  bot_id: string;
  conversation_id: string;
}[] {
  return db
    .prepare(
      "SELECT bot_id, conversation_id FROM bot_conversations ORDER BY bot_id",
    )
    .all() as { bot_id: string; conversation_id: string }[];
}

export function deleteBotConversation(botId: string): void {
  db.prepare("DELETE FROM bot_conversations WHERE bot_id = ?").run(botId);
}

export function setCurrentRunForBot(botId: string, runId: string | null): void {
  db.prepare(
    "UPDATE bot_conversations SET current_run_id = ? WHERE bot_id = ?",
  ).run(runId, botId);
}

export function getCurrentRunForBot(botId: string): string | null {
  const row = db
    .prepare("SELECT current_run_id FROM bot_conversations WHERE bot_id = ?")
    .get(botId) as { current_run_id: string | null } | undefined;
  return row?.current_run_id ?? null;
}

export function listCurrentDurableRuns(): {
  bot_id: string;
  conversation_id: string;
  run_id: string;
}[] {
  return db
    .prepare(
      `SELECT bc.bot_id, bc.conversation_id, bc.current_run_id AS run_id
       FROM bot_conversations bc
       JOIN runs r ON r.id = bc.current_run_id
       WHERE bc.current_run_id IS NOT NULL AND r.status = 'running'
       ORDER BY bc.bot_id`,
    )
    .all() as { bot_id: string; conversation_id: string; run_id: string }[];
}

export function latestRunningRunForBot(botId: string): string | null {
  const row = db
    .prepare(
      `SELECT id FROM runs WHERE bot_id = ? AND status = 'running'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(botId) as { id: string } | undefined;
  return row?.id ?? null;
}

export function runningLoopBotIds(): string[] {
  const rows = db
    .prepare("SELECT DISTINCT bot_id FROM runs WHERE status = 'running'")
    .all() as { bot_id: string }[];
  return rows.map((row) => row.bot_id);
}

export function sweepUnresumableRuns(resumableBotIds: Set<string>): number {
  const stale = db
    .prepare("SELECT bot_id, id FROM runs WHERE status = 'running'")
    .all() as { bot_id: string; id: string }[];
  let swept = 0;
  for (const run of stale) {
    if (resumableBotIds.has(run.bot_id)) continue;
    finishRun(
      run.id,
      "error",
      null,
      resumableBotIds.size === 0 ? "interrupted" : "not resumable",
    );
    swept++;
  }
  return swept;
}

interface BotStatusInfo {
  name: string;
  status_level: "ok" | "issue" | "blocked" | null;
}

function getBotStatusInfo(botId: string): BotStatusInfo | undefined {
  return db
    .prepare("SELECT name, status_level FROM bots WHERE id = ?")
    .get(botId) as BotStatusInfo | undefined;
}

function emitBotBlockTransitions(
  botId: string,
  previous: BotStatusInfo | undefined,
  nextLevel: "ok" | "issue" | "blocked" | null,
  status: string | null = null,
): void {
  if (!previous) return;
  const wasBlocked = previous.status_level === "blocked";
  const isBlocked = nextLevel === "blocked";
  if (isBlocked && !wasBlocked) {
    emitAppEvent("bot.blocked", {
      bot: { id: botId, name: previous.name },
      status,
    });
  } else if (wasBlocked && !isBlocked) {
    emitAppEvent("bot.recovered", { bot: { id: botId, name: previous.name } });
  }
}

export function setBotStatus(
  botId: string,
  text: string | null,
  level: "ok" | "issue" | "blocked" = "ok",
): void {
  const value = text && text.trim() ? text.trim() : null;
  const previous = getBotStatusInfo(botId);
  db.prepare(
    "UPDATE bots SET status = ?, status_level = ?, current_task_updated_at = ? WHERE id = ?",
  ).run(value, value ? level : null, value ? Date.now() : null, botId);
  emitBotBlockTransitions(botId, previous, value ? level : null, value);
}

export function setCurrentTask(botId: string, text: string | null): void {
  const value = text && text.trim() ? text.trim() : null;
  const previous = getBotStatusInfo(botId);
  db.prepare(
    "UPDATE bots SET current_task = ?, status = NULL, status_level = NULL, current_task_updated_at = ? WHERE id = ?",
  ).run(value, value ? Date.now() : null, botId);
  emitBotBlockTransitions(botId, previous, null);
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
  return {
    ...row,
    api_key: decryptSecret(row.api_key, `provider "${row.name}"`),
    models,
  };
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
    encryptSecret(p.api_key),
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
  if (fields.name !== undefined) {
    sets.push("name = ?");
    vals.push(fields.name);
  }
  if (fields.base_url !== undefined) {
    sets.push("base_url = ?");
    vals.push(fields.base_url);
  }
  if (fields.api_key !== undefined) {
    sets.push("api_key = ?");
    vals.push(encryptSecret(fields.api_key));
  }
  if (fields.models !== undefined) {
    sets.push("models = ?");
    vals.push(JSON.stringify(fields.models));
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

export function listStoredProviderApiKeys(): {
  id: string;
  name: string;
  api_key: string;
}[] {
  return db
    .prepare("SELECT id, name, api_key FROM providers ORDER BY rowid")
    .all() as { id: string; name: string; api_key: string }[];
}

export function setStoredProviderApiKey(id: string, stored: string): void {
  db.prepare("UPDATE providers SET api_key = ? WHERE id = ?").run(stored, id);
}

export interface HookDestinationRow {
  id: string;
  name: string;
  url: string;
  secret: string;
  event_types: string[];
  enabled: number;
  created_at: number;
}

interface DbHookDestinationRow {
  id: string;
  name: string;
  url: string;
  secret: string;
  event_types: string;
  enabled: number;
  created_at: number;
}

export interface HookDeliveryRow {
  id: string;
  destination_id: string;
  event_type: AppEventType;
  status: "ok" | "error";
  http_status: number | null;
  duration_ms: number;
  attempt: number;
  error: string | null;
  created_at: number;
}

function toHookDestination(row: DbHookDestinationRow): HookDestinationRow {
  let eventTypes: unknown = [];
  try {
    eventTypes = JSON.parse(row.event_types);
  } catch {
    eventTypes = [];
  }
  return {
    ...row,
    event_types: Array.isArray(eventTypes)
      ? eventTypes.filter((x): x is string => typeof x === "string")
      : [],
  };
}

export function listHookDestinations(): HookDestinationRow[] {
  const rows = db
    .prepare(
      "SELECT * FROM event_destinations ORDER BY name COLLATE NOCASE, created_at DESC",
    )
    .all() as DbHookDestinationRow[];
  return rows.map(toHookDestination);
}

export function getHookDestination(id: string): HookDestinationRow | undefined {
  const row = db
    .prepare("SELECT * FROM event_destinations WHERE id = ?")
    .get(id) as DbHookDestinationRow | undefined;
  return row ? toHookDestination(row) : undefined;
}

export function insertHookDestination(d: HookDestinationRow): void {
  db.prepare(
    `INSERT INTO event_destinations
      (id, name, url, secret, event_types, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    d.id,
    d.name,
    d.url,
    d.secret,
    JSON.stringify(d.event_types),
    d.enabled,
    d.created_at,
  );
}

export function updateHookDestination(
  id: string,
  fields: Partial<Omit<HookDestinationRow, "id">>,
): boolean {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of [
    "name",
    "url",
    "secret",
    "event_types",
    "enabled",
  ] as const) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(
        key === "event_types"
          ? JSON.stringify(fields.event_types)
          : fields[key],
      );
    }
  }
  if (sets.length === 0) return false;
  vals.push(id);
  const result = db
    .prepare(`UPDATE event_destinations SET ${sets.join(", ")} WHERE id = ?`)
    .run(...vals);
  return result.changes > 0;
}

export function deleteHookDestination(id: string): boolean {
  const tx = db.transaction((destinationId: string) => {
    db.prepare("DELETE FROM hook_deliveries WHERE destination_id = ?").run(
      destinationId,
    );
    return (
      db
        .prepare("DELETE FROM event_destinations WHERE id = ?")
        .run(destinationId).changes > 0
    );
  });
  return tx(id);
}

export function insertHookDelivery(row: {
  id?: string;
  destination_id: string;
  event_type: AppEventType;
  status: "ok" | "error";
  http_status: number | null;
  duration_ms: number;
  attempt?: number;
  error?: string | null;
  created_at?: number;
}): HookDeliveryRow {
  const full: HookDeliveryRow = {
    id: row.id ?? randomUUID(),
    destination_id: row.destination_id,
    event_type: row.event_type,
    status: row.status,
    http_status: row.http_status,
    duration_ms: row.duration_ms,
    attempt: row.attempt ?? 1,
    error: row.error ?? null,
    created_at: row.created_at ?? Date.now(),
  };
  db.prepare(
    `INSERT INTO hook_deliveries
      (id, destination_id, event_type, status, http_status, duration_ms, attempt, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    full.id,
    full.destination_id,
    full.event_type,
    full.status,
    full.http_status,
    full.duration_ms,
    full.attempt,
    full.error,
    full.created_at,
  );
  return full;
}

export function listHookDeliveries(
  destinationId: string,
  limit = 100,
): HookDeliveryRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM hook_deliveries
       WHERE destination_id = ?
       ORDER BY created_at DESC, rowid DESC
       LIMIT ?`,
    )
    .all(destinationId, limit) as HookDeliveryRow[];
  return rows.map((row) => ({ ...row }));
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

export function isPaused(): boolean {
  return getSetting("global_paused") === "1";
}

export function setPaused(paused: boolean): void {
  setSetting("global_paused", paused ? "1" : "0");
}

export interface PendingInjectionRow {
  id: number;
  bot_id: string;
  kind: string;
  text: string;
  created_at: number;
}

export function insertPendingInjection(
  botId: string,
  kind: string,
  text: string,
): void {
  db.prepare(
    "INSERT INTO pending_injections (bot_id, kind, text, created_at) VALUES (?, ?, ?, ?)",
  ).run(botId, kind, text, Date.now());
}

export function listPendingInjections(botId: string): PendingInjectionRow[] {
  return db
    .prepare(
      "SELECT id, bot_id, kind, text, created_at FROM pending_injections WHERE bot_id = ? ORDER BY id",
    )
    .all(botId) as PendingInjectionRow[];
}

export function pendingBotIds(): string[] {
  return (
    db
      .prepare(
        "SELECT bot_id FROM pending_injections GROUP BY bot_id ORDER BY MIN(id)",
      )
      .all() as { bot_id: string }[]
  ).map((row) => row.bot_id);
}

export function deletePendingInjections(ids: number[]): void {
  if (ids.length === 0) return;
  const del = db.prepare("DELETE FROM pending_injections WHERE id = ?");
  for (const id of ids) del.run(id);
}

// specs/usage/tokens.md — provider-reported usage per run, totals independent of run history.
export interface TokenUsage {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

export function recordRunUsage(
  runId: string,
  botId: string,
  createdAt: number,
  usage: TokenUsage,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO run_usage
       (run_id, bot_id, created_at, input, output, cache_read, cache_write)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    botId,
    createdAt,
    usage.input,
    usage.output,
    usage.cache_read,
    usage.cache_write,
  );
}

export interface UsageTotals extends TokenUsage {
  total: number;
}

export function sumUsage(botId: string, since?: number): UsageTotals {
  const sql = `SELECT COALESCE(SUM(input), 0) AS input, COALESCE(SUM(output), 0) AS output,
       COALESCE(SUM(cache_read), 0) AS cache_read,
       COALESCE(SUM(cache_write), 0) AS cache_write
   FROM run_usage WHERE bot_id = ?${since ? " AND created_at >= ?" : ""}`;
  const row = (
    since ? db.prepare(sql).get(botId, since) : db.prepare(sql).get(botId)
  ) as TokenUsage;
  return {
    ...row,
    total: row.input + row.output + row.cache_read + row.cache_write,
  };
}

export function botUsageTotals(botId: string): {
  lifetime: UsageTotals;
  last30d: UsageTotals;
} {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return { lifetime: sumUsage(botId), last30d: sumUsage(botId, since) };
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function sumUsageAll(since?: number): UsageTotals {
  const sql = `SELECT COALESCE(SUM(input), 0) AS input, COALESCE(SUM(output), 0) AS output,
       COALESCE(SUM(cache_read), 0) AS cache_read,
       COALESCE(SUM(cache_write), 0) AS cache_write
   FROM run_usage${since ? " WHERE created_at >= ?" : ""}`;
  const row = (
    since ? db.prepare(sql).get(since) : db.prepare(sql).get()
  ) as TokenUsage;
  return {
    ...row,
    total: row.input + row.output + row.cache_read + row.cache_write,
  };
}

// specs/usage/circuit-breaker.md — server-wide trailing-30-day token cap.
export function getBreakerLimit(): number {
  const raw = getSetting("breaker_limit_tokens");
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function isBreakerArmed(): boolean {
  return getSetting("breaker_tripped") === "1";
}

export function setBreakerArmed(armed: boolean): void {
  if (armed) setSetting("breaker_tripped", "1");
  else deleteSetting("breaker_tripped");
}

export function breakerState(): {
  limit_tokens: number;
  tokens_30d: number;
  exceeded: boolean;
} {
  const limit = getBreakerLimit();
  const tokens30d = sumUsageAll(Date.now() - THIRTY_DAYS_MS).total;
  return {
    limit_tokens: limit,
    tokens_30d: tokens30d,
    exceeded: limit > 0 && tokens30d > limit,
  };
}

export function setBreakerLimit(limit: number): void {
  if (limit > 0) setSetting("breaker_limit_tokens", String(limit));
  else deleteSetting("breaker_limit_tokens");
  const state = breakerState();
  if (!state.exceeded) setBreakerArmed(false);
}

export function checkSpendBreaker(): boolean {
  const state = breakerState();
  if (!state.exceeded) return false;
  const wasArmed = isBreakerArmed();
  setBreakerArmed(true);
  setPaused(true);
  if (!wasArmed) {
    logAudit({
      actor: { kind: "system" },
      action: "breaker.trip",
      targetKind: "global",
      summary: `trailing-30d spend ${state.tokens_30d} passed cap ${state.limit_tokens}; all bots paused`,
    });
    createNotification({
      kind: "breaker",
      title: "Spend circuit breaker tripped",
      body: `Trailing 30-day usage of ${state.tokens_30d.toLocaleString()} tokens passed the cap of ${state.limit_tokens.toLocaleString()}. All bots are paused; raise or clear the cap to resume.`,
      dedupeKey: `breaker:${Date.now()}`,
    });
  }
  return true;
}

export interface McpSecretRef {
  secret: string;
}

export type McpEnvValue = string | McpSecretRef;

export function isMcpSecretRef(value: unknown): value is McpSecretRef {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { secret?: unknown }).secret === "string"
  );
}

function normalizeMcpEnv(raw: unknown): Record<string, McpEnvValue> {
  const env: Record<string, McpEnvValue> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return env;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") env[key] = value;
    else if (isMcpSecretRef(value)) env[key] = { secret: value.secret };
  }
  return env;
}

// specs/mcp/env-secrets.md — references resolve at spawn time, never in stored config.
export function resolveMcpEnv(
  env: Record<string, McpEnvValue>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (isMcpSecretRef(value))
      resolved[key] = findSecretByName(value.secret)?.value ?? "";
    else resolved[key] = value;
  }
  return resolved;
}

export interface McpServerRow {
  id: string;
  name: string;
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, McpEnvValue>;
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
const skillCols = new Set(
  (db.prepare("PRAGMA table_info(skills)").all() as { name: string }[]).map(
    (c) => c.name,
  ),
);
// Immutable JSON provenance for imported skills; null for hand-written ones.
if (!skillCols.has("import_info")) {
  db.prepare("ALTER TABLE skills ADD COLUMN import_info TEXT").run();
}

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
    env: normalizeMcpEnv(JSON.parse(row.env)),
  };
}

export interface SkillRow {
  id: string;
  name: string;
  description: string;
  instructions: string;
  created_at: number;
  import_info: string | null;
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
    "INSERT INTO skills (id, name, description, instructions, created_at, import_info) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    skill.id,
    skill.name,
    skill.description,
    skill.instructions,
    skill.created_at,
    skill.import_info ?? null,
  );
}

export function updateSkill(
  id: string,
  fields: Partial<
    Pick<SkillRow, "name" | "description" | "instructions"> & {
      import_info: string | null;
    }
  >,
): void {
  const entries = Object.entries(fields);
  if (entries.length === 0) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE skills SET ${sets} WHERE id = ?`).run(
    ...entries.map(([, v]) => v),
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

export function listAllApiKeys(): (ApiKeyRow & { hash: string })[] {
  return db
    .prepare(
      "SELECT id, name, hash, user_id, created_at, last_used_at FROM api_keys ORDER BY created_at",
    )
    .all() as (ApiKeyRow & { hash: string })[];
}

export function getApiKeyById(id: string): ApiKeyRow | undefined {
  return db
    .prepare(
      "SELECT id, name, user_id, created_at, last_used_at FROM api_keys WHERE id = ?",
    )
    .get(id) as ApiKeyRow | undefined;
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

export function updateApiKey(
  id: string,
  patch: Partial<{ name: string; hash: string; created_at: number }>,
): void {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  db.prepare(
    `UPDATE api_keys SET ${entries.map(([k]) => `${k} = @${k}`).join(", ")} WHERE id = @id`,
  ).run({ ...Object.fromEntries(entries), id });
}

export function deleteApiKey(id: string, userId: string): boolean {
  const res = db
    .prepare(
      "DELETE FROM api_keys WHERE id = ? AND (user_id = ? OR user_id IS NULL)",
    )
    .run(id, userId);
  return res.changes > 0;
}

// --- device authorization grants (RFC 8628) ---------------------------------

export interface DeviceGrantRow {
  id: string;
  device_code_hash: string;
  user_code: string;
  client_name: string;
  status: "pending" | "approved" | "denied" | "claimed";
  key_name: string | null;
  api_key_id: string | null;
  api_value: string | null;
  owner_email: string | null;
  created_at: number;
  expires_at: number;
  last_polled_at: number | null;
}

export function insertDeviceGrant(grant: {
  id: string;
  device_code_hash: string;
  user_code: string;
  client_name: string;
  created_at: number;
  expires_at: number;
}): void {
  db.prepare(
    `INSERT INTO device_grants
     (id, device_code_hash, user_code, client_name, status, created_at, expires_at)
     VALUES (@id, @device_code_hash, @user_code, @client_name, 'pending', @created_at, @expires_at)`,
  ).run(grant);
}

export function getLiveDeviceGrantByUserCode(
  userCode: string,
  now: number,
): DeviceGrantRow | undefined {
  return db
    .prepare(
      `SELECT * FROM device_grants
       WHERE user_code = ? AND status = 'pending' AND expires_at > ?`,
    )
    .get(userCode, now) as DeviceGrantRow | undefined;
}

export function getDeviceGrantByDeviceHash(
  hash: string,
): DeviceGrantRow | undefined {
  return db
    .prepare("SELECT * FROM device_grants WHERE device_code_hash = ?")
    .get(hash) as DeviceGrantRow | undefined;
}

export function approveDeviceGrant(
  id: string,
  decision: {
    key_name: string;
    api_key_id: string;
    api_value: string;
    owner_email: string;
  },
): boolean {
  const res = db
    .prepare(
      `UPDATE device_grants
       SET status = 'approved', key_name = @key_name, api_key_id = @api_key_id,
           api_value = @api_value, owner_email = @owner_email
       WHERE id = @id AND status = 'pending'`,
    )
    .run({ id, ...decision });
  return res.changes > 0;
}

export function denyDeviceGrant(id: string): boolean {
  const res = db
    .prepare(
      "UPDATE device_grants SET status = 'denied' WHERE id = ? AND status = 'pending'",
    )
    .run(id);
  return res.changes > 0;
}

// Hands the plaintext key to exactly one poller: only an `approved` grant with
// a value still stored transitions to `claimed`, and the value is dropped.
export function claimDeviceGrant(id: string): { api_value: string } | null {
  const row = db
    .prepare(
      "SELECT api_value FROM device_grants WHERE id = ? AND status = 'approved'",
    )
    .get(id) as { api_value: string | null } | undefined;
  if (!row?.api_value) return null;
  const res = db
    .prepare(
      `UPDATE device_grants SET status = 'claimed', api_value = NULL
       WHERE id = ? AND status = 'approved'`,
    )
    .run(id);
  return res.changes === 1 ? { api_value: row.api_value } : null;
}

export function touchDeviceGrantPoll(id: string, ts: number): void {
  db.prepare("UPDATE device_grants SET last_polled_at = ? WHERE id = ?").run(
    ts,
    id,
  );
}

// Pending grants never survive a restart (device-login.md).
export function clearDeviceGrants(): number {
  return db.prepare("DELETE FROM device_grants").run().changes;
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

export interface AuditRow {
  id: number;
  created_at: number;
  actor_kind: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  target_kind: string;
  target_id: string | null;
  target_name: string | null;
  summary: string | null;
}

export function insertAuditRow(row: {
  created_at: number;
  actor_kind: string;
  actor_id?: string | null;
  actor_name: string;
  action: string;
  target_kind: string;
  target_id?: string | null;
  target_name?: string | null;
  summary?: string | null;
}): void {
  db.prepare(
    `INSERT INTO audit (created_at, actor_kind, actor_id, actor_name, action, target_kind, target_id, target_name, summary)
     VALUES (@created_at, @actor_kind, @actor_id, @actor_name, @action, @target_kind, @target_id, @target_name, @summary)`,
  ).run({
    created_at: row.created_at,
    actor_kind: row.actor_kind,
    actor_id: row.actor_id ?? null,
    actor_name: row.actor_name,
    action: row.action,
    target_kind: row.target_kind,
    target_id: row.target_id ?? null,
    target_name: row.target_name ?? null,
    summary: (row.summary ?? "").slice(0, 200),
  });
}

export interface AuditQuery {
  actor?: string;
  type?: string;
  q?: string;
  since?: number;
  until?: number;
  limit?: number;
}

export function queryAuditRows(query: AuditQuery): AuditRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (query.actor) {
    where.push("actor_kind = @actor");
    params.actor = query.actor;
  }
  if (query.type) {
    where.push("action LIKE @type || '.%'");
    params.type = query.type;
  }
  if (query.q) {
    where.push(
      "(target_name LIKE '%' || @q || '%' OR target_id = @q OR summary LIKE '%' || @q || '%')",
    );
    params.q = query.q;
  }
  if (typeof query.since === "number") {
    where.push("created_at >= @since");
    params.since = query.since;
  }
  if (typeof query.until === "number") {
    where.push("created_at <= @until");
    params.until = query.until;
  }
  const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000);
  params.limit = limit;
  return db
    .prepare(
      `SELECT * FROM audit ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT @limit`,
    )
    .all(params) as AuditRow[];
}

export function purgeAuditBefore(ts: number): number {
  const res = db.prepare("DELETE FROM audit WHERE created_at < ?").run(ts);
  return Number(res.changes ?? 0);
}
