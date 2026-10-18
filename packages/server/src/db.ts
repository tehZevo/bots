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
  machine_id: string | null;
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

if (!botColumns.has("description"))
  db.prepare(
    "ALTER TABLE bots ADD COLUMN description TEXT NOT NULL DEFAULT ''",
  ).run();

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

const triggerColumns = new Set(
  (db.prepare("PRAGMA table_info(triggers)").all() as { name: string }[]).map(
    (column) => column.name,
  ),
);
if (!triggerColumns.has("secret"))
  db.prepare("ALTER TABLE triggers ADD COLUMN secret TEXT").run();

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

export function insertBot(bot: BotRow): void {
  db.prepare(
    `INSERT INTO bots (id, name, description, system_prompt, model_id, role_id, machine_id, enabled, created_at)
     VALUES (@id, @name, @description, @system_prompt, @model_id, @role_id, @machine_id, @enabled, @created_at)`,
  ).run({ model_id: null, role_id: null, machine_id: null, ...bot });
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
    `INSERT INTO triggers (id, bot_id, kind, message, schedule, next_run_at, secret, enabled, created_at)
     VALUES (@id, @bot_id, @kind, @message, @schedule, @next_run_at, @secret, @enabled, @created_at)`,
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

export function latestErrorBotIds(): Set<string> {
  const rows = db
    .prepare(
      `SELECT bot_id FROM runs r
     WHERE status = 'error' AND started_at = (
       SELECT MAX(started_at) FROM runs WHERE bot_id = r.bot_id AND status != 'running'
     )`,
    )
    .all() as { bot_id: string }[];
  return new Set(rows.map((r) => r.bot_id));
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
