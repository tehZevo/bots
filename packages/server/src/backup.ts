import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname, join, posix } from "node:path";
import { dataDir } from "./config.ts";
import * as db from "./db.ts";
import { nextRunAt } from "./scheduler.ts";
import { MAX_BUNDLE_BYTES, MAX_BUNDLE_FILES } from "./skillimport.ts";

export const CONFIG_BACKUP_VERSION = 1;

const BOT_SOUNDS = new Set([
  "none",
  "default",
  "ping",
  "chirp",
  "bell",
  "blip",
  "warp",
  "thunk",
]);
const SECRET_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const BASE64_RE =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type Json = Record<string, unknown>;
export type BackupKind =
  | "bots"
  | "roles"
  | "skills"
  | "mcp_servers"
  | "projects"
  | "tags"
  | "teams"
  | "templates"
  | "secrets"
  | "api_keys";

export interface BackupSecretRef {
  secret: string;
}

export type BackupEnvValue = string | BackupSecretRef;

export interface BackupBundleFile {
  path: string;
  data: string;
}

interface NormalizedBundleFile {
  path: string;
  data: Buffer;
}

export interface ConfigSnapshot {
  version: number;
  exported_at: number;
  bots: {
    name: string;
    instructions: string;
    model_id: string | null;
    enabled: boolean;
    sound: string | null;
    token_budget: number | null;
    watchdog_hours: number | null;
    role_name: string | null;
    tag_names: string[];
    project_names: string[];
    secret_names: string[];
    teams: { name: string; leader: boolean }[];
  }[];
  roles: {
    name: string;
    instructions: string;
    mcp_server_names: string[];
    skill_names: string[];
  }[];
  skills: {
    name: string;
    description: string;
    instructions: string;
    import_info: Json | null;
    files: BackupBundleFile[];
  }[];
  mcp_servers: {
    id: string;
    name: string;
    transport: "stdio";
    command: string;
    args: string[];
    env: Record<string, BackupEnvValue>;
    enabled: boolean;
  }[];
  projects: { name: string; description: string; body: string }[];
  tags: { name: string }[];
  teams: { name: string; project_names: string[]; secret_names: string[] }[];
  templates: {
    name: string;
    description: string;
    instructions: string;
    role_name: string | null;
    triggers: { message: string; schedule: string }[];
  }[];
  secrets: { name: string; key: string; value?: string }[];
  api_keys: { id: string; name: string; hash: string; created_at: number }[];
}

export interface BackupCounts {
  created: number;
  updated: number;
}

export interface BackupImportReport {
  report: Record<BackupKind, BackupCounts>;
  api_key_values?: Record<string, string>;
}

export type BackupImportResult =
  | BackupImportReport
  | { error: string; missing_secret_names?: string[] };

export class ConfigBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigBackupError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MissingSecretValuesError extends ConfigBackupError {
  readonly names: string[];

  constructor(names: string[]) {
    super(`secret values required for: ${names.join(", ")}`);
    this.name = "MissingSecretValuesError";
    this.names = [...new Set(names)].sort((a, b) => a.localeCompare(b));
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface SkillPlan {
  id: string;
  created: boolean;
  name: string;
  description: string;
  instructions: string;
  importInfo: string | null;
  files?: NormalizedBundleFile[];
}

interface McpPlan {
  id: string;
  created: boolean;
  name: string;
  command: string;
  args: string[];
  env: Record<string, BackupEnvValue>;
  enabled: number;
}

interface RolePlan {
  id: string;
  created: boolean;
  name: string;
  instructions: string;
  mcp_server_ids: string[];
  skill_ids: string[];
}

interface ProjectPlan {
  id: string;
  created: boolean;
  name: string;
  description: string;
  body: string;
}

interface TagPlan {
  id: string;
  created: boolean;
  name: string;
}

interface SecretPlan {
  id: string;
  created: boolean;
  name: string;
  key: string;
  value: string | null;
}

interface ApiKeyPlan {
  id: string;
  created: boolean;
  name: string;
  hash?: string;
  createdAt?: number;
  rawValue?: string;
}

interface TeamPlan {
  id: string;
  created: boolean;
  name: string;
  projectIds: string[];
  secretIds: string[];
}

interface TemplatePlan {
  id: string;
  created: boolean;
  name: string;
  description: string;
  instructions: string;
  role_id: string | null;
  triggers: { message: string; schedule: string }[];
}

interface BotPlan {
  id: string;
  created: boolean;
  name: string;
  instructions: string;
  model_id: string | null;
  sound: string | null;
  enabled: number;
  token_budget: number | null;
  watchdog_hours: number | null;
  role_id: string | null;
  tagIds: string[];
  projectIds: string[];
  secretIds: string[];
  teamMemberships: { team_id: string; leader: boolean }[];
}

interface ImportPlan {
  skills: SkillPlan[];
  mcpServers: McpPlan[];
  roles: RolePlan[];
  projects: ProjectPlan[];
  tags: TagPlan[];
  secrets: SecretPlan[];
  apiKeys: ApiKeyPlan[];
  teams: TeamPlan[];
  templates: TemplatePlan[];
  bots: BotPlan[];
  report: Record<BackupKind, BackupCounts>;
}

interface StagedBundle {
  skillId: string;
  stageDir?: string;
}

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareNames(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new ConfigBackupError(`${label} must be an array`);
  return value;
}

function parseName(value: unknown, label: string): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new ConfigBackupError(`${label}.name is required`);
  return name;
}

function textValue(
  entry: Json,
  key: string,
  label: string,
  defaultValue = "",
): string {
  const value = entry[key];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== "string")
    throw new ConfigBackupError(`${label}.${key} must be a string`);
  return value;
}

function requiredText(entry: Json, key: string, label: string): string {
  const raw = textValue(entry, key, label);
  if (!raw.trim()) throw new ConfigBackupError(`${label}.${key} is required`);
  return raw;
}

function optionalNameOrNull(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string")
    throw new ConfigBackupError(`${label} must be a string or null`);
  return value.trim() || null;
}

function optionalStringArray(value: unknown, label: string): string[] {
  const result: string[] = [];
  for (const raw of requiredArray(value, label)) {
    if (typeof raw !== "string" || !raw.trim())
      throw new ConfigBackupError(`${label} must contain non-empty strings`);
    const name = raw.trim();
    if (!result.includes(name)) result.push(name);
  }
  return result;
}

function stringArray(value: unknown, label: string): string[] {
  const result: string[] = [];
  for (const raw of requiredArray(value, label)) {
    if (typeof raw !== "string")
      throw new ConfigBackupError(`${label} must contain strings`);
    result.push(raw);
  }
  return result;
}

function booleanValue(
  value: unknown,
  label: string,
  defaultValue = true,
): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return value === 1;
  throw new ConfigBackupError(`${label} must be a boolean`);
}

function nullableInteger(
  value: unknown,
  label: string,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new ConfigBackupError(`${label} must be an integer or null`);
  if (value < min || value > max)
    throw new ConfigBackupError(
      `${label} must be from ${min} to ${max} or null`,
    );
  return value;
}

function optionalTimestamp(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new ConfigBackupError(`${label} must be a timestamp`);
  return Math.floor(value);
}

function decodeBase64Strict(raw: string, label: string): Buffer {
  if (raw === "") return Buffer.alloc(0);
  if (!BASE64_RE.test(raw))
    throw new ConfigBackupError(`${label}.data must be base64`);
  const decoded = Buffer.from(raw, "base64");
  if (decoded.toString("base64") !== raw)
    throw new ConfigBackupError(`${label}.data must use canonical base64`);
  return decoded;
}

function bundleRelativePath(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !raw)
    throw new ConfigBackupError(`${label}.path is required`);
  const normalized = raw.replace(/\\/g, "/");
  if (normalized.startsWith("/") || posix.isAbsolute(normalized))
    throw new ConfigBackupError(`${label}.path must be relative`);
  let current = "";
  for (const part of normalized.split("/")) {
    if (
      !part ||
      part === "." ||
      part === ".." ||
      part.includes(":") ||
      part.includes("\0")
    )
      throw new ConfigBackupError(`${label}.path is invalid: ${raw}`);
    current = current ? `${current}/${part}` : part;
  }
  return current;
}

function parseBundleFiles(
  value: unknown,
  label: string,
): NormalizedBundleFile[] | undefined {
  if (value === undefined) return undefined;
  const files: NormalizedBundleFile[] = [];
  let total = 0;
  for (const raw of requiredArray(value, `${label}.files`)) {
    if (!isRecord(raw))
      throw new ConfigBackupError(`${label}.files must contain objects`);
    const path = bundleRelativePath(raw.path, `${label}.file`);
    if (files.some((f) => f.path === path))
      throw new ConfigBackupError(`${label} has duplicate file: ${path}`);
    if (typeof raw.data !== "string")
      throw new ConfigBackupError(`${label}.file.data must be a string`);
    const data = decodeBase64Strict(raw.data, `${label}.file`);
    files.push({ path, data });
    total += data.length;
    if (files.length > MAX_BUNDLE_FILES || total > MAX_BUNDLE_BYTES)
      throw new ConfigBackupError(
        `${label} bundle exceeds ${MAX_BUNDLE_FILES} files or ${Math.floor(MAX_BUNDLE_BYTES / 1024 / 1024)} MB`,
      );
  }
  return files;
}

function parseImportInfo(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value))
    throw new ConfigBackupError(
      `${label}.import_info must be an object or null`,
    );
  return JSON.stringify(value);
}

function parseEnv(
  value: unknown,
  label: string,
): Record<string, BackupEnvValue> {
  if (value === undefined) return {};
  if (!isRecord(value))
    throw new ConfigBackupError(`${label}.env must be an object`);
  const env: Record<string, BackupEnvValue> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key)
      throw new ConfigBackupError(`${label}.env keys must be non-empty`);
    if (typeof rawValue === "string") env[key] = rawValue;
    else if (isRecord(rawValue) && Object.keys(rawValue).length === 1) {
      const secret = optionalNameOrNull(rawValue.secret, `${key} secret name`);
      if (!secret)
        throw new ConfigBackupError(`${label}.env.${key} secret is invalid`);
      env[key] = { secret };
    } else
      throw new ConfigBackupError(
        `${label}.env.${key} must be a string or { "secret": "name" }`,
      );
  }
  return env;
}

function parseTriggers(value: unknown, label: string) {
  const triggers: { message: string; schedule: string }[] = [];
  for (const raw of requiredArray(value, `${label}.triggers`)) {
    if (!isRecord(raw))
      throw new ConfigBackupError(`${label}.triggers must contain objects`);
    const message = textValue(raw, "message", label).trim();
    const schedule = textValue(raw, "schedule", label).trim();
    if (!message)
      throw new ConfigBackupError(`${label}.trigger.message is required`);
    if (!schedule || nextRunAt(schedule) === null)
      throw new ConfigBackupError(`invalid schedule: ${schedule}`);
    triggers.push({ message, schedule });
  }
  return triggers;
}

function parseTeamMemberships(value: unknown, label: string) {
  const memberships = new Map<string, boolean>();
  for (const raw of requiredArray(value, `${label}.teams`)) {
    if (!isRecord(raw))
      throw new ConfigBackupError(`${label}.teams must contain objects`);
    const name = parseName(raw.name, `${label}.team`);
    memberships.set(name, booleanValue(raw.leader, `${name} leader`, false));
  }
  return [...memberships.entries()].map(([name, leader]) => ({ name, leader }));
}

function listBundleFiles(skillId: string): BackupBundleFile[] {
  const root = join(dataDir, "skills", skillId);
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(root);
  } catch {
    return [];
  }
  if (!st.isDirectory()) return [];
  const files: BackupBundleFile[] = [];
  let total = 0;

  function walk(rel: string): void {
    const entries = readdirSync(join(root, rel), { withFileTypes: true }).sort(
      (a, b) => compareStrings(a.name, b.name),
    );
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(childRel);
      else if (entry.isFile()) {
        const data = readFileSync(join(root, childRel));
        files.push({ path: childRel, data: data.toString("base64") });
        total += data.length;
        if (files.length > MAX_BUNDLE_FILES || total > MAX_BUNDLE_BYTES)
          throw new ConfigBackupError(
            `skill bundle exceeds ${MAX_BUNDLE_FILES} files or ${Math.floor(MAX_BUNDLE_BYTES / 1024 / 1024)} MB`,
          );
      }
    }
  }

  walk("");
  return files;
}

function namesFromIds(ids: string[], byId: Map<string, string>): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const name = byId.get(id);
    if (name) out.add(name);
  }
  return [...out].sort(compareStrings);
}

function parseExportedImportInfo(raw: string | null): Json | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function exportConfigBackup(includeValues: boolean): ConfigSnapshot {
  return db.runInTransaction(() => {
    const roles = [...db.listRoles()].sort(compareNames);
    const skills = [...db.listSkills()].sort(compareNames);
    const mcpServers = [...db.listMcpServers()].sort(compareNames);
    const projects = [...db.listProjects()].sort(compareNames);
    const tags = [...db.listTags()].sort(compareNames);
    const teams = [...db.listTeams()].sort(compareNames);
    const templates = [...db.listTemplates()].sort(compareNames);
    const secrets = db.listSecret().sort(compareNames);
    const apiKeys = db.listAllApiKeys().sort(compareNames);
    const bots = [...db.listBots()].sort(compareNames);

    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    const skillName = new Map(skills.map((s) => [s.id, s.name]));
    const mcpName = new Map(mcpServers.map((m) => [m.id, m.name]));
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const tagName = new Map(tags.map((t) => [t.id, t.name]));
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const secretName = new Map(secrets.map((s) => [s.id, s.name]));
    const projectsByBot = db.projectIdsByBot();
    const tagsByBot = db.tagIdsByBot();
    const teamsByBot = db.teamIdsByBot();

    return {
      version: CONFIG_BACKUP_VERSION,
      exported_at: Date.now(),
      bots: bots.map((bot) => ({
        name: bot.name,
        instructions: bot.instructions,
        model_id: bot.model_id,
        enabled: bot.enabled === 1,
        sound: bot.sound,
        token_budget: bot.token_budget,
        watchdog_hours: bot.watchdog_hours,
        role_name: bot.role_id ? (roleName.get(bot.role_id) ?? null) : null,
        tag_names: namesFromIds(tagsByBot.get(bot.id) ?? [], tagName),
        project_names: namesFromIds(
          projectsByBot.get(bot.id) ?? [],
          projectName,
        ),
        secret_names: namesFromIds(db.botSecretIds(bot.id), secretName),
        teams: (teamsByBot.get(bot.id) ?? [])
          .map((membership) => ({
            name: teamName.get(membership.id) ?? "",
            leader: membership.leader,
          }))
          .filter((x) => x.name)
          .sort(compareNames),
      })),
      roles: roles.map((role) => ({
        name: role.name,
        instructions: role.instructions,
        mcp_server_names: namesFromIds(role.mcp_server_ids, mcpName),
        skill_names: namesFromIds(role.skill_ids, skillName),
      })),
      skills: skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        import_info: parseExportedImportInfo(skill.import_info),
        files: listBundleFiles(skill.id),
      })),
      mcp_servers: mcpServers.map((server) => ({
        id: server.id,
        name: server.name,
        transport: "stdio",
        command: server.command,
        args: [...server.args],
        env: parseEnv(server.env as unknown, server.name),
        enabled: server.enabled === 1,
      })),
      projects: projects.map((project) => ({
        name: project.name,
        description: project.description,
        body: project.body,
      })),
      tags: tags.map((tag) => ({ name: tag.name })),
      teams: teams.map((team) => ({
        name: team.name,
        project_names: namesFromIds(team.project_ids, projectName),
        secret_names: namesFromIds(db.teamSecretIds(team.id), secretName),
      })),
      templates: templates.map((template) => ({
        name: template.name,
        description: template.description,
        instructions: template.instructions,
        role_name: template.role_id
          ? (roleName.get(template.role_id) ?? null)
          : null,
        triggers: [...template.triggers],
      })),
      secrets: secrets.map((secret) => ({
        name: secret.name,
        key: secret.key,
        ...(includeValues
          ? { value: db.getSecret(secret.id)?.value ?? "" }
          : {}),
      })),
      api_keys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        hash: key.hash,
        created_at: key.created_at,
      })),
    };
  });
}

const BACKUP_KINDS: BackupKind[] = [
  "bots",
  "roles",
  "skills",
  "mcp_servers",
  "projects",
  "tags",
  "teams",
  "templates",
  "secrets",
  "api_keys",
];

function emptyReport(): Record<BackupKind, BackupCounts> {
  return Object.fromEntries(
    BACKUP_KINDS.map((kind) => [kind, { created: 0, updated: 0 }]),
  ) as Record<BackupKind, BackupCounts>;
}

const CASE_INSENSITIVE_KINDS = new Set<BackupKind>(["tags", "secrets"]);

function nameKey(kind: BackupKind, name: string): string {
  return CASE_INSENSITIVE_KINDS.has(kind) ? name.toLowerCase() : name;
}

class NameIndex {
  private maps = Object.fromEntries(
    BACKUP_KINDS.map((kind) => [kind, new Map<string, string>()]),
  ) as Record<BackupKind, Map<string, string>>;

  indexRows(
    kind: BackupKind,
    rows: readonly { id: string; name: string }[],
  ): void {
    const map = this.maps[kind];
    for (const row of rows) {
      const key = nameKey(kind, row.name);
      if (!map.has(key)) map.set(key, row.id);
    }
  }

  lookup(kind: BackupKind, name: string): string | undefined {
    return this.maps[kind].get(nameKey(kind, name));
  }

  resolveTarget(
    kind: BackupKind,
    name: string,
  ): { id: string; created: boolean } {
    const existing = this.lookup(kind, name);
    if (existing) return { id: existing, created: false };
    const id = randomUUID();
    this.maps[kind].set(nameKey(kind, name), id);
    return { id, created: true };
  }

  requireExisting(kind: BackupKind, name: string, label: string): string {
    const id = this.lookup(kind, name);
    if (!id)
      throw new ConfigBackupError(
        `${label}: unknown ${kind.replace("_", " ")}: ${name}`,
      );
    return id;
  }

  requireId(
    kind: BackupKind,
    name: string | null,
    label: string,
  ): string | null {
    if (name === null) return null;
    return this.requireExisting(kind, name, label);
  }

  ids(kind: BackupKind, names: string[], label: string): string[] {
    return names.map((name) =>
      this.requireExisting(kind, name, `${label}.${name}`),
    );
  }
}

function unwrapBackup(input: unknown): {
  snapshot: Json;
  secretOverrides: Map<string, string>;
} {
  if (!isRecord(input))
    throw new ConfigBackupError("backup must be a JSON object");
  let snapshot = input;
  if (typeof input.version !== "number") {
    const nested = input.config;
    if (!isRecord(nested))
      throw new ConfigBackupError('backup file missing "version"');
    snapshot = nested;
  }

  const overridesRaw = input.secret_values;
  const secretOverrides = new Map<string, string>();
  if (overridesRaw !== undefined) {
    if (!isRecord(overridesRaw))
      throw new ConfigBackupError("secret_values must be an object");
    for (const [name, value] of Object.entries(overridesRaw)) {
      const key = name.trim().toLowerCase();
      if (!key || typeof value !== "string" || !value)
        throw new ConfigBackupError(`secret value is required: ${name}`);
      secretOverrides.set(key, value);
    }
  }

  return { snapshot, secretOverrides };
}

function parseSnapshot(raw: Json, overrides: Map<string, string>): ImportPlan {
  if (raw.version !== CONFIG_BACKUP_VERSION)
    throw new ConfigBackupError(
      `unsupported backup version: ${String(raw.version)}`,
    );

  const index = new NameIndex();
  index.indexRows("bots", db.listBots());
  index.indexRows("roles", db.listRoles());
  index.indexRows("skills", db.listSkills());
  index.indexRows("mcp_servers", db.listMcpServers());
  index.indexRows("projects", db.listProjects());
  index.indexRows("tags", db.listTags());
  index.indexRows("teams", db.listTeams());
  index.indexRows("templates", db.listTemplates());
  index.indexRows("secrets", db.listSecret());
  index.indexRows(
    "api_keys",
    db.listAllApiKeys().map((key) => ({ id: key.id, name: key.name })),
  );

  const plan: ImportPlan = {
    skills: [],
    mcpServers: [],
    roles: [],
    projects: [],
    tags: [],
    secrets: [],
    apiKeys: [],
    teams: [],
    templates: [],
    bots: [],
    report: emptyReport(),
  };

  for (const rawSkill of requiredArray(raw.skills, "skills")) {
    if (!isRecord(rawSkill))
      throw new ConfigBackupError("skills must contain objects");
    const name = parseName(rawSkill.name, "skill");
    const target = index.resolveTarget("skills", name);
    plan.report.skills[target.created ? "created" : "updated"] += 1;
    plan.skills.push({
      id: target.id,
      created: target.created,
      name,
      description: textValue(rawSkill, "description", "skill"),
      instructions: requiredText(rawSkill, "instructions", "skill"),
      importInfo: parseImportInfo(rawSkill.import_info, "skill"),
      files: parseBundleFiles(rawSkill.files, `skill ${name}`),
    });
  }

  for (const rawServer of requiredArray(raw.mcp_servers, "mcp_servers")) {
    if (!isRecord(rawServer))
      throw new ConfigBackupError("mcp_servers must contain objects");
    const name = parseName(rawServer.name, "MCP server");
    const command = textValue(rawServer, "command", "MCP server").trim();
    if (!command)
      throw new ConfigBackupError(`MCP server ${name}: command is required`);
    const target = index.resolveTarget("mcp_servers", name);
    plan.report.mcp_servers[target.created ? "created" : "updated"] += 1;
    plan.mcpServers.push({
      id: target.id,
      created: target.created,
      name,
      command,
      args: stringArray(rawServer.args, `MCP server ${name}.args`),
      env: parseEnv(rawServer.env, `MCP server ${name}`),
      enabled: booleanValue(rawServer.enabled, `MCP server ${name}.enabled`)
        ? 1
        : 0,
    });
  }

  for (const rawRole of requiredArray(raw.roles, "roles")) {
    if (!isRecord(rawRole))
      throw new ConfigBackupError("roles must contain objects");
    const name = parseName(rawRole.name, "role");
    const instructions = textValue(rawRole, "instructions", "role");
    if (!instructions.trim())
      throw new ConfigBackupError(`role ${name}: instructions is required`);
    const target = index.resolveTarget("roles", name);
    plan.report.roles[target.created ? "created" : "updated"] += 1;
    plan.roles.push({
      id: target.id,
      created: target.created,
      name,
      instructions,
      mcp_server_ids: index.ids(
        "mcp_servers",
        optionalStringArray(
          rawRole.mcp_server_names,
          `role ${name}.mcp_server_names`,
        ),
        `role ${name}`,
      ),
      skill_ids: index.ids(
        "skills",
        optionalStringArray(rawRole.skill_names, `role ${name}.skill_names`),
        `role ${name}`,
      ),
    });
  }

  for (const rawProject of requiredArray(raw.projects, "projects")) {
    if (!isRecord(rawProject))
      throw new ConfigBackupError("projects must contain objects");
    const name = parseName(rawProject.name, "project");
    const body = textValue(rawProject, "body", "project");
    if (!body.trim())
      throw new ConfigBackupError(`project ${name}: body is required`);
    const target = index.resolveTarget("projects", name);
    plan.report.projects[target.created ? "created" : "updated"] += 1;
    plan.projects.push({
      id: target.id,
      created: target.created,
      name,
      description: textValue(rawProject, "description", "project"),
      body,
    });
  }

  for (const rawTag of requiredArray(raw.tags, "tags")) {
    if (!isRecord(rawTag))
      throw new ConfigBackupError("tags must contain objects");
    const name = parseName(rawTag.name, "tag");
    const target = index.resolveTarget("tags", name);
    plan.report.tags[target.created ? "created" : "updated"] += 1;
    plan.tags.push({ id: target.id, created: target.created, name });
  }

  const missingSecrets: string[] = [];
  for (const rawSecret of requiredArray(raw.secrets, "secrets")) {
    if (!isRecord(rawSecret))
      throw new ConfigBackupError("secrets must contain objects");
    const name = parseName(rawSecret.name, "secret");
    const key = textValue(rawSecret, "key", "secret").trim();
    if (!SECRET_KEY_RE.test(key))
      throw new ConfigBackupError(
        `secret ${name}: key must be a valid env var name`,
      );
    let value: string | null = null;
    const fileValue = rawSecret.value;
    if (fileValue !== undefined && fileValue !== null) {
      if (typeof fileValue !== "string" || !fileValue)
        throw new ConfigBackupError(
          `secret ${name}: value must be a non-empty string`,
        );
      value = fileValue;
    } else {
      const override = overrides.get(name.toLowerCase());
      if (override !== undefined) value = override;
    }
    const target = index.resolveTarget("secrets", name);
    plan.report.secrets[target.created ? "created" : "updated"] += 1;
    if (target.created && !value) missingSecrets.push(name);
    else if (!target.created && value === null) {
      const existingValue = db.findSecretByName(name)?.value;
      if (!existingValue) missingSecrets.push(name);
    }
    plan.secrets.push({
      id: target.id,
      created: target.created,
      name,
      key,
      value,
    });
  }

  for (const rawKey of requiredArray(raw.api_keys, "api_keys")) {
    if (!isRecord(rawKey))
      throw new ConfigBackupError("api_keys must contain objects");
    const name = parseName(rawKey.name, "API key");
    let hash: string | undefined;
    let rawValue: string | undefined;
    if (rawKey.hash !== undefined && rawKey.hash !== null) {
      if (typeof rawKey.hash !== "string" || !SHA256_HEX_RE.test(rawKey.hash))
        throw new ConfigBackupError(
          `API key ${name}: hash must be a SHA-256 hex digest`,
        );
      hash = rawKey.hash;
    }
    const target = index.resolveTarget("api_keys", name);
    plan.report.api_keys[target.created ? "created" : "updated"] += 1;
    if (target.created && !hash) {
      rawValue = `bots_${randomBytes(20).toString("hex")}`;
      hash = createHash("sha256").update(rawValue).digest("hex");
    }
    plan.apiKeys.push({
      id: target.id,
      created: target.created,
      name,
      hash,
      createdAt: optionalTimestamp(
        rawKey.created_at,
        `API key ${name}.created_at`,
      ),
      rawValue,
    });
  }

  for (const rawTeam of requiredArray(raw.teams, "teams")) {
    if (!isRecord(rawTeam))
      throw new ConfigBackupError("teams must contain objects");
    const name = parseName(rawTeam.name, "team");
    const target = index.resolveTarget("teams", name);
    plan.report.teams[target.created ? "created" : "updated"] += 1;
    plan.teams.push({
      id: target.id,
      created: target.created,
      name,
      projectIds: index.ids(
        "projects",
        optionalStringArray(
          rawTeam.project_names,
          `team ${name}.project_names`,
        ),
        `team ${name}`,
      ),
      secretIds: index.ids(
        "secrets",
        optionalStringArray(rawTeam.secret_names, `team ${name}.secret_names`),
        `team ${name}`,
      ),
    });
  }

  for (const rawTemplate of requiredArray(raw.templates, "templates")) {
    if (!isRecord(rawTemplate))
      throw new ConfigBackupError("templates must contain objects");
    const name = parseName(rawTemplate.name, "template");
    const target = index.resolveTarget("templates", name);
    plan.report.templates[target.created ? "created" : "updated"] += 1;
    plan.templates.push({
      id: target.id,
      created: target.created,
      name,
      description: textValue(rawTemplate, "description", "template"),
      instructions: textValue(rawTemplate, "instructions", "template"),
      role_id: index.requireId(
        "roles",
        optionalNameOrNull(rawTemplate.role_name, `template ${name}.role_name`),
        `template ${name}`,
      ),
      triggers: parseTriggers(rawTemplate.triggers, `template ${name}`),
    });
  }

  for (const rawBot of requiredArray(raw.bots, "bots")) {
    if (!isRecord(rawBot))
      throw new ConfigBackupError("bots must contain objects");
    const name = parseName(rawBot.name, "bot");
    const sound = optionalNameOrNull(rawBot.sound, `bot ${name}.sound`);
    if (sound !== null && !BOT_SOUNDS.has(sound))
      throw new ConfigBackupError(`unknown sound: ${sound}`);
    const target = index.resolveTarget("bots", name);
    plan.report.bots[target.created ? "created" : "updated"] += 1;
    const teamNames = parseTeamMemberships(rawBot.teams, `bot ${name}`);
    plan.bots.push({
      id: target.id,
      created: target.created,
      name,
      instructions: textValue(rawBot, "instructions", "bot"),
      model_id: optionalNameOrNull(rawBot.model_id, `bot ${name}.model_id`),
      sound,
      enabled: booleanValue(rawBot.enabled, `bot ${name}.enabled`) ? 1 : 0,
      token_budget: nullableInteger(
        rawBot.token_budget,
        `bot ${name}.token_budget`,
        1,
      ),
      watchdog_hours: nullableInteger(
        rawBot.watchdog_hours,
        `bot ${name}.watchdog_hours`,
        1,
        720,
      ),
      role_id: index.requireId(
        "roles",
        optionalNameOrNull(rawBot.role_name, `bot ${name}.role_name`),
        `bot ${name}`,
      ),
      tagIds: index.ids(
        "tags",
        optionalStringArray(rawBot.tag_names, `bot ${name}.tag_names`),
        `bot ${name}`,
      ),
      projectIds: index.ids(
        "projects",
        optionalStringArray(rawBot.project_names, `bot ${name}.project_names`),
        `bot ${name}`,
      ),
      secretIds: index.ids(
        "secrets",
        optionalStringArray(rawBot.secret_names, `bot ${name}.secret_names`),
        `bot ${name}`,
      ),
      teamMemberships: teamNames.map((team) => ({
        team_id: index.requireExisting("teams", team.name, `bot ${name}`),
        leader: team.leader,
      })),
    });
  }

  if (missingSecrets.length > 0)
    throw new MissingSecretValuesError(missingSecrets);
  return plan;
}

function stageBundles(skills: SkillPlan[]): {
  root: string;
  items: StagedBundle[];
} {
  const root = join(dataDir, ".config-backup", randomUUID());
  mkdirSync(root, { recursive: true });
  const items: StagedBundle[] = [];
  for (const skill of skills) {
    if (!skill.files) continue;
    if (skill.files.length === 0) {
      items.push({ skillId: skill.id });
      continue;
    }
    const stageDir = join(root, skill.id);
    mkdirSync(stageDir, { recursive: true });
    for (const file of skill.files) {
      const target = join(stageDir, ...file.path.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSyncSafe(target, file.data);
    }
    items.push({ skillId: skill.id, stageDir });
  }
  return { root, items };
}

function writeFileSyncSafe(path: string, data: Buffer): void {
  const fd = openSync(path, "w");
  try {
    writeSync(fd, data);
  } finally {
    closeSync(fd);
  }
}

function moveBundles(items: StagedBundle[]): void {
  const parent = join(dataDir, "skills");
  mkdirSync(parent, { recursive: true });
  for (const item of items) {
    const final = join(parent, item.skillId);
    rmSync(final, { recursive: true, force: true });
    if (item.stageDir) renameSync(item.stageDir, final);
  }
}

function applyPlan(plan: ImportPlan, userId: string): BackupImportReport {
  const staged = stageBundles(plan.skills);
  try {
    db.runInTransaction(() => {
      for (const skill of plan.skills) {
        if (db.getSkill(skill.id)) {
          db.updateSkill(skill.id, {
            name: skill.name,
            description: skill.description,
            instructions: skill.instructions,
            import_info: skill.importInfo,
          });
        } else {
          db.insertSkill({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            instructions: skill.instructions,
            created_at: Date.now(),
            import_info: skill.importInfo,
          });
        }
      }

      for (const server of plan.mcpServers) {
        const env = server.env as unknown as Record<string, string>;
        if (db.getMcpServer(server.id)) {
          db.updateMcpServer(server.id, {
            name: server.name,
            transport: "stdio",
            command: server.command,
            args: server.args,
            env,
            enabled: server.enabled,
          });
        } else {
          db.insertMcpServer({
            id: server.id,
            name: server.name,
            transport: "stdio",
            command: server.command,
            args: server.args,
            env,
            enabled: server.enabled,
            created_at: Date.now(),
          });
        }
      }

      for (const role of plan.roles) {
        if (db.getRole(role.id)) {
          db.updateRole(role.id, {
            name: role.name,
            instructions: role.instructions,
            mcp_server_ids: role.mcp_server_ids,
            skill_ids: role.skill_ids,
          });
        } else {
          db.insertRole({
            id: role.id,
            name: role.name,
            instructions: role.instructions,
            mcp_server_ids: role.mcp_server_ids,
            skill_ids: role.skill_ids,
            created_at: Date.now(),
          });
        }
      }

      for (const project of plan.projects) {
        if (db.getProject(project.id)) {
          db.updateProject(project.id, {
            name: project.name,
            description: project.description,
            body: project.body,
          });
        } else {
          db.insertProject({
            id: project.id,
            name: project.name,
            description: project.description,
            body: project.body,
            created_at: Date.now(),
          });
        }
      }

      for (const tag of plan.tags) {
        if (db.getTag(tag.id)) db.renameTag(tag.id, tag.name);
        else
          db.insertTag({ id: tag.id, name: tag.name, created_at: Date.now() });
      }

      for (const secret of plan.secrets) {
        const existing = db.getSecret(secret.id);
        if (existing) {
          db.updateSecret(secret.id, {
            key: secret.key,
            ...(secret.value === null ? {} : { value: secret.value }),
          });
        } else {
          if (!secret.value)
            throw new ConfigBackupError(
              `secret ${secret.name}: value is required`,
            );
          db.insertSecret({
            id: secret.id,
            name: secret.name,
            key: secret.key,
            value: secret.value,
            created_at: Date.now(),
          });
        }
      }

      for (const key of plan.apiKeys) {
        const existing = db.getApiKeyById(key.id);
        if (existing) {
          db.updateApiKey(key.id, {
            name: key.name,
            hash: key.hash,
            created_at: key.createdAt,
          });
        } else {
          const hash = key.hash ?? "";
          if (!hash)
            throw new ConfigBackupError(
              `API key ${key.name}: hash is required`,
            );
          db.insertApiKey({
            id: key.id,
            name: key.name,
            hash,
            user_id: userId || null,
            created_at: key.createdAt ?? Date.now(),
          });
        }
      }

      for (const team of plan.teams) {
        if (db.getTeam(team.id)) db.renameTeam(team.id, team.name);
        else
          db.insertTeam({
            id: team.id,
            name: team.name,
            created_at: Date.now(),
          });
        db.setTeamProjects(team.id, team.projectIds);
        db.setTeamSecret(team.id, team.secretIds);
      }

      for (const template of plan.templates) {
        if (db.getTemplate(template.id)) {
          db.updateTemplate(template.id, {
            name: template.name,
            description: template.description,
            instructions: template.instructions,
            role_id: template.role_id,
            triggers: JSON.stringify(template.triggers),
          });
        } else {
          db.insertTemplate({
            id: template.id,
            name: template.name,
            description: template.description,
            instructions: template.instructions,
            machine_id: null,
            role_id: template.role_id,
            triggers: JSON.stringify(template.triggers),
            created_at: Date.now(),
          });
        }
      }

      for (const bot of plan.bots) {
        const fields = {
          name: bot.name,
          instructions: bot.instructions,
          model_id: bot.model_id,
          role_id: bot.role_id,
          sound: bot.sound,
          enabled: bot.enabled,
          token_budget: bot.token_budget,
          watchdog_hours: bot.watchdog_hours,
        };
        if (db.getBot(bot.id)) db.updateBot(bot.id, fields);
        else {
          db.insertBot({
            ...fields,
            id: bot.id,
            avatar_shape: null,
            avatar_color: null,
            current_task: null,
            current_task_updated_at: null,
            status: null,
            status_level: null,
            created_at: Date.now(),
          });
        }
        db.setTeamMembershipsForBot(bot.id, bot.teamMemberships);
        db.setBotTags(bot.id, bot.tagIds);
        db.setBotProjects(bot.id, bot.projectIds);
        db.setBotSecret(bot.id, bot.secretIds);
      }
    });

    moveBundles(staged.items);
  } finally {
    rmSync(staged.root, { recursive: true, force: true });
  }

  const apiValues = Object.fromEntries(
    plan.apiKeys.flatMap((key) =>
      key.rawValue ? [[key.name, key.rawValue]] : [],
    ),
  );
  return {
    report: plan.report,
    ...(Object.keys(apiValues).length > 0 ? { api_key_values: apiValues } : {}),
  };
}

export function importConfigBackup(
  input: unknown,
  userId: string,
): BackupImportResult {
  let plan: ImportPlan;
  try {
    const { snapshot, secretOverrides } = unwrapBackup(input);
    plan = parseSnapshot(snapshot, secretOverrides);
  } catch (error) {
    if (error instanceof MissingSecretValuesError)
      return { error: error.message, missing_secret_names: error.names };
    if (error instanceof ConfigBackupError) return { error: error.message };
    throw error;
  }
  try {
    return applyPlan(plan, userId);
  } catch (error) {
    if (error instanceof ConfigBackupError) return { error: error.message };
    throw error;
  }
}
