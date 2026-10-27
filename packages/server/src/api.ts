import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  estimateContext,
  injectMessage,
  interruptBot,
  isLoopActive,
  resetBotRuntime,
  resumePendingInjections,
  stopAllLoops,
} from "./agent.ts";
import { repoRoot } from "./config.ts";
import {
  approveDeviceGrant,
  botSecretIds,
  botsUsingMachine,
  botUsageTotals,
  breakerState,
  checkSpendBreaker,
  claimDeviceGrant,
  clearDeviceGrants,
  clearMessages,
  continuousIntervalMs,
  countUsers,
  createSession,
  deleteApiKey,
  deleteBot,
  deleteMachine,
  deleteMcpServer,
  deleteProject,
  deleteProvider,
  deleteRole,
  deleteSecret,
  deleteSession,
  deleteSessionsForUser,
  deleteSetting,
  deleteSkill,
  deleteTag,
  deleteTeam,
  deleteTemplate,
  deleteTrigger,
  denyDeviceGrant,
  findSecretByName,
  getApiKeyByHash,
  getBot,
  getDeviceGrantByDeviceHash,
  getLiveDeviceGrantByUserCode,
  getMachine,
  getMcpServer,
  getMcpServerByName,
  getProject,
  getProvider,
  getRole,
  getRun,
  getRunUsage,
  getSecret,
  getSessionUser,
  getSetting,
  getSkill,
  getTag,
  getTeam,
  getTemplate,
  getTrigger,
  getUserByEmail,
  getUserById,
  hashPassword,
  insertApiKey,
  insertBot,
  insertDeviceGrant,
  insertMachine,
  insertMcpServer,
  insertProject,
  insertProvider,
  insertRole,
  insertSecret,
  insertSkill,
  insertTag,
  insertTeam,
  insertTemplate,
  insertTrigger,
  insertUser,
  isBreakerArmed,
  isMcpSecretRef,
  isPaused,
  latestErrorBotIds,
  listApiKeys,
  listBots,
  listMachines,
  listMcpServers,
  listMessagesForRun,
  listNotifications,
  listProjects,
  listProviders,
  listRoles,
  listRuns,
  listSecret,
  listSkills,
  listTags,
  listTeams,
  listTemplates,
  listTriggers,
  loadMessages,
  type McpEnvValue,
  markAllNotificationsRead,
  markNotificationRead,
  type ProviderRow,
  projectIdsByBot,
  projectsForBot,
  removePushSubscriptionOwned,
  removeTeamMember,
  renameTag,
  renameTeam,
  secretEnvForBot,
  setBotProjects,
  setBotSecret,
  setBotTags,
  setBreakerArmed,
  setBreakerLimit,
  setMachineBuild,
  setPaused,
  setSetting,
  setTeamMember,
  setTeamProjects,
  setTeamSecret,
  setTriggerSecret,
  setUserPassword,
  tagByName,
  tagIdsByBot,
  tagsForBot,
  teamSecretIds,
  touchApiKey,
  touchDeviceGrantPoll,
  unreadNotificationCount,
  updateBot,
  updateMachine,
  updateMcpServer,
  updateProject,
  updateProvider,
  updateRole,
  updateSecret,
  updateSkill,
  updateTemplate,
  updateTrigger,
  upsertPushSubscription,
  verifyPassword,
} from "./db.ts";
import { testMcpConnection } from "./mcp.ts";
import { openApiDoc } from "./openapi.ts";
import { vapidPublicKey } from "./push.ts";
import { getRetryWaits } from "./runwaits.ts";
import {
  defaultImageRef,
  idleMinutes,
  rebuildMachineImage,
  removeContainer,
  repullDefaultImage,
  restartSandbox,
} from "./sandbox.ts";
import { nextRunAt } from "./scheduler.ts";
import {
  type ClonedRepo,
  cleanupClone,
  cloneRepo,
  MAX_BUNDLE_BYTES,
  MAX_BUNDLE_FILES,
  parseFrontmatter,
  parseGitSource,
  previewSkills,
  removeBundle,
  searchSkillsSh,
  storeBundle,
} from "./skillimport.ts";
import {
  listWorkspace,
  readWorkspaceFile,
  WorkspaceError,
} from "./workspace.ts";

const DEFAULT_MANUAL_MESSAGE = "Continue with your current work.";

export const SESSION_COOKIE = "bots_session";
const SESSION_TTL_S = 7 * 24 * 60 * 60;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function allowRegistration(): boolean {
  return process.env.ALLOW_REGISTRATION === "true";
}

interface BotInput {
  name?: unknown;
  instructions?: unknown;
  model_id?: unknown;
  role_id?: unknown;
  machine_id?: unknown;
  avatar_shape?: unknown;
  avatar_color?: unknown;
  sound?: unknown;
  enabled?: unknown;
  token_budget?: unknown;
  watchdog_hours?: unknown;
}

const AVATAR_OPTIONS_COUNT = 12;

function toAvatarIndex(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= AVATAR_OPTIONS_COUNT
  )
    return -1;
  return value;
}

function toBotPayload(input: BotInput) {
  if (typeof input.name !== "string" || !input.name.trim())
    return { error: "name is required" };
  let role_id: string | null = null;
  if (typeof input.role_id === "string" && input.role_id.trim()) {
    if (!getRole(input.role_id.trim()))
      return { error: `unknown role: ${input.role_id}` };
    role_id = input.role_id.trim();
  }
  let machine_id: string | null = null;
  if (typeof input.machine_id === "string" && input.machine_id.trim()) {
    if (!getMachine(input.machine_id.trim()))
      return { error: `unknown machine: ${input.machine_id}` };
    machine_id = input.machine_id.trim();
  }
  const shape = toAvatarIndex(input.avatar_shape);
  if (shape === -1) return { error: "avatar_shape must be an index or null" };
  const color = toAvatarIndex(input.avatar_color);
  if (color === -1) return { error: "avatar_color must be an index or null" };
  const SOUND_CHOICES = new Set([
    "none",
    "default",
    "ping",
    "chirp",
    "bell",
    "blip",
    "warp",
    "thunk",
  ]);
  let token_budget: number | null = null;
  if (input.token_budget !== undefined && input.token_budget !== null) {
    const n =
      typeof input.token_budget === "number"
        ? Math.floor(input.token_budget)
        : NaN;
    if (!Number.isFinite(n) || n < 1)
      return { error: "token_budget must be a positive integer or null" };
    token_budget = n;
  }
  let watchdog_hours: number | null = null;
  if (input.watchdog_hours !== undefined && input.watchdog_hours !== null) {
    if (
      typeof input.watchdog_hours !== "number" ||
      !Number.isInteger(input.watchdog_hours) ||
      input.watchdog_hours < 1 ||
      input.watchdog_hours > 720
    )
      return {
        error: "watchdog_hours must be a whole number from 1 to 720 or null",
      };
    watchdog_hours = input.watchdog_hours;
  }
  let sound: string | null = null;
  if (typeof input.sound === "string" && input.sound.trim()) {
    if (!SOUND_CHOICES.has(input.sound.trim()))
      return { error: `unknown sound: ${input.sound}` };
    sound = input.sound.trim();
  }
  return {
    name: input.name.trim(),
    instructions:
      typeof input.instructions === "string" ? input.instructions : "",
    model_id:
      typeof input.model_id === "string" && input.model_id.trim()
        ? input.model_id.trim()
        : null,
    role_id,
    machine_id,
    sound,
    enabled:
      input.enabled === false ||
      input.enabled === 0 ||
      input.enabled === "false"
        ? 0
        : 1,
    avatar_shape: shape,
    avatar_color: color,
    token_budget,
    watchdog_hours,
  };
}

interface RoleInput {
  name?: unknown;
  instructions?: unknown;
  mcp_server_ids?: unknown;
  skill_ids?: unknown;
}

function toRolePayload(
  input: RoleInput,
  knownMcpIds: Set<string>,
  knownSkillIds: Set<string>,
) {
  if (typeof input.name !== "string" || !input.name.trim())
    return { error: "name is required" };
  if (typeof input.instructions !== "string" || !input.instructions.trim())
    return { error: "instructions is required" };
  const parseIds = (
    value: unknown,
    known: Set<string>,
    kind: string,
  ): string[] | { error: string } => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
      return { error: `${kind} must be an array of ids` };
    for (const id of value as string[])
      if (!known.has(id)) return { error: `unknown ${kind} id: ${id}` };
    return value as string[];
  };
  const mcp = parseIds(input.mcp_server_ids, knownMcpIds, "mcp_server");
  if ("error" in mcp) return mcp;
  const skills = parseIds(input.skill_ids, knownSkillIds, "skill");
  if ("error" in skills) return skills;
  return {
    name: input.name.trim(),
    instructions: input.instructions,
    mcp_server_ids: mcp,
    skill_ids: skills,
  };
}

interface TriggerInput {
  kind?: unknown;
  name?: unknown;
  message?: unknown;
  schedule?: unknown;
  enabled?: unknown;
}

const TRIGGER_KINDS = ["schedule", "webhook", "continuous"] as const;

function toTriggerPayload(input: TriggerInput) {
  const kind = input.kind === undefined ? "schedule" : input.kind;
  if (
    typeof kind !== "string" ||
    !(TRIGGER_KINDS as readonly string[]).includes(kind)
  )
    return { error: `unknown kind: ${String(input.kind)}` };
  if (typeof input.message !== "string" || !input.message.trim())
    return { error: "message is required" };
  let name: string | null = null;
  if (input.name !== undefined && input.name !== null && input.name !== "") {
    if (typeof input.name !== "string" || !input.name.trim())
      return { error: "name must be a non-empty string" };
    if (input.name.length > 120) return { error: "name too long (max 120)" };
    name = input.name.trim();
  }
  const schedule =
    typeof input.schedule === "string" ? input.schedule.trim() : "";
  if (kind === "webhook")
    return {
      kind: kind as (typeof TRIGGER_KINDS)[number],
      name,
      message: input.message,
      schedule: "",
    };
  if (kind === "continuous") {
    const ms = continuousIntervalMs(schedule);
    if (ms === null)
      return {
        error: `invalid interval: ${schedule || "(empty)"} — use @every 30m`,
      };
    if (ms < 60_000)
      return { error: "continuous interval must be at least 1 minute" };
    return {
      kind: kind as (typeof TRIGGER_KINDS)[number],
      name,
      message: input.message,
      schedule,
    };
  }
  if (!schedule)
    return { error: "schedule is required (cron expression or @every 30m)" };
  if (nextRunAt(schedule) === null)
    return { error: `invalid schedule: ${schedule}` };
  return {
    kind: kind as (typeof TRIGGER_KINDS)[number],
    name,
    message: input.message,
    schedule,
  };
}

export interface AuthUser {
  id: string;
  email: string;
  keyId?: string;
}

// --- device authorization (RFC 8628) ----------------------------------------

const DEVICE_TTL_S = 600;
const DEVICE_POLL_INTERVAL_S = 5;
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeUserCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateUserCode(): string {
  let out = "";
  while (out.length < 8) {
    for (const b of randomBytes(8)) {
      if (b < USER_CODE_ALPHABET.length * 4 && out.length < 8) {
        out += USER_CODE_ALPHABET[b % USER_CODE_ALPHABET.length];
      }
    }
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

// Fixed-window rate limiter per IP (and per device code for token polling);
// device-login.md requires limits but not specific budgets.
const DEVICE_RATE_LIMITS: { name: string; max: number; windowMs: number }[] = [
  { name: "code", max: 30, windowMs: 3_600_000 },
  { name: "pending", max: 300, windowMs: 60_000 },
  { name: "approve", max: 120, windowMs: 60_000 },
  { name: "token", max: 600, windowMs: 60_000 },
  { name: "tokencode", max: 600, windowMs: 60_000 },
];
const rateWindows = new Map<string, { start: number; count: number }>();

function limited(
  kind: (typeof DEVICE_RATE_LIMITS)[number]["name"],
  key: string,
): boolean {
  const rule = DEVICE_RATE_LIMITS.find((r) => r.name === kind)!;
  const bucket = `${kind}:${key}`;
  const now = Date.now();
  const win = rateWindows.get(bucket);
  if (!win || now - win.start > rule.windowMs) {
    rateWindows.set(bucket, { start: now, count: 1 });
    return false;
  }
  win.count += 1;
  return win.count > rule.max;
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "local";
}

export function createApp() {
  const app = new Hono<{ Variables: { user: AuthUser } }>();

  const API_KEY_RE = /^bots_[0-9a-f]{40}$/;
  app.use("/api/*", async (c, next) => {
    const path = c.req.path;
    if (
      path === "/api/health" ||
      path.startsWith("/api/webhooks/") ||
      path === "/api/auth/config" ||
      path === "/api/auth/login" ||
      path === "/api/auth/signup" ||
      path === "/api/auth/device/code" ||
      path === "/api/auth/device/token"
    )
      return next();

    const header = c.req.header("authorization");
    if (header?.startsWith("Bearer ")) {
      const value = header.slice(7).trim();
      if (!API_KEY_RE.test(value))
        return c.json({ error: "invalid api key" }, 401);
      const row = getApiKeyByHash(
        createHash("sha256").update(value).digest("hex"),
      );
      if (!row) return c.json({ error: "invalid api key" }, 401);
      const now = Date.now();
      if (row.last_used_at === null || now - row.last_used_at >= 60_000) {
        touchApiKey(row.id, now);
      }
      const owner = row.user_id ? getUserById(row.user_id) : undefined;
      c.set("user", {
        id: owner?.id ?? "",
        email: owner?.email ?? "api-key",
        keyId: row.id,
      });
      return next();
    }

    const token = getCookie(c, SESSION_COOKIE);
    const user = token ? getSessionUser(token) : undefined;
    if (!user) return c.json({ error: "unauthorized" }, 401);

    // CSRF guard for cookie sessions: cross-origin state changes need JSON
    // and, when a browser sends Origin, same-origin.
    if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin) {
        let same = false;
        try {
          same = new URL(origin).host === new URL(c.req.url).host;
        } catch {
          same = false;
        }
        if (!same)
          return c.json({ error: "cross-origin request blocked" }, 403);
      } else if (c.req.header("content-type") !== undefined) {
        if (!c.req.header("content-type")?.includes("application/json"))
          return c.json({ error: "invalid content type" }, 415);
      }
    }
    c.set("user", user);
    return next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/openapi.json", (c) => c.json(openApiDoc()));

  const cookieOpts = {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: true,
    path: "/",
    maxAge: SESSION_TTL_S,
  };

  app.get("/api/auth/config", (c) =>
    c.json({
      allow_registration: allowRegistration(),
      has_users: countUsers() > 0,
    }),
  );

  async function readCreds(
    c: Context,
  ): Promise<{ email: string; password: string } | null> {
    const body = (await c.req.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
    } | null;
    if (typeof body?.email !== "string" || typeof body.password !== "string")
      return null;
    return { email: body.email.trim().toLowerCase(), password: body.password };
  }

  app.post("/api/auth/signup", async (c) => {
    if (!allowRegistration())
      return c.json({ error: "registration is disabled" }, 403);
    const creds = await readCreds(c);
    if (!creds || !EMAIL_RE.test(creds.email))
      return c.json({ error: "valid email is required" }, 400);
    if (creds.password.length < 8)
      return c.json({ error: "password must be at least 8 characters" }, 400);
    if (getUserByEmail(creds.email))
      return c.json({ error: "account already exists" }, 409);
    const id = randomUUID();
    insertUser({
      id,
      email: creds.email,
      password_hash: hashPassword(creds.password),
      created_at: Date.now(),
    });
    const { token } = createSession(id, Date.now() + SESSION_TTL_S * 1000);
    setCookie(c, SESSION_COOKIE, token, cookieOpts);
    return c.json({ email: creds.email }, 201);
  });

  app.post("/api/auth/login", async (c) => {
    const creds = await readCreds(c);
    const user = creds ? getUserByEmail(creds.email) : undefined;
    if (!creds || !user || !verifyPassword(creds.password, user.password_hash))
      return c.json({ error: "invalid credentials" }, 401);
    const { token } = createSession(user.id, Date.now() + SESSION_TTL_S * 1000);
    setCookie(c, SESSION_COOKIE, token, cookieOpts);
    return c.json({ email: user.email });
  });

  app.get("/api/auth/me", (c) => {
    const user = c.get("user") as AuthUser;
    return c.json(
      user.keyId
        ? { email: user.email, key_id: user.keyId }
        : { email: user.email },
    );
  });

  app.post("/api/auth/logout", (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) deleteSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.post("/api/auth/password", async (c) => {
    const user = c.get("user") as { id: string; email: string };
    if (!user.id)
      return c.json({ error: "password change needs a login session" }, 400);
    const body = (await c.req.json().catch(() => null)) as {
      current?: unknown;
      new?: unknown;
    } | null;
    if (typeof body?.current !== "string" || typeof body.new !== "string")
      return c.json({ error: "current and new are required" }, 400);
    if (body.new.length < 8)
      return c.json(
        { error: "new password must be at least 8 characters" },
        400,
      );
    const row = getUserById(user.id);
    if (!row || !verifyPassword(body.current, row.password_hash))
      return c.json({ error: "current password incorrect" }, 403);
    setUserPassword(row.id, hashPassword(body.new));
    // keep this device's session, invalidate the rest
    const token = getCookie(c, SESSION_COOKIE);
    deleteSessionsForUser(
      row.id,
      token ? createHash("sha256").update(token).digest("hex") : undefined,
    );
    return c.json({ ok: true });
  });

  app.post("/api/auth/device/code", async (c) => {
    if (limited("code", clientIp(c)))
      return c.json({ error: "rate_limited" }, 429);
    const body = (await c.req.json().catch(() => null)) as {
      client_name?: unknown;
    } | null;
    const clientName =
      typeof body?.client_name === "string"
        ? body.client_name.trim().slice(0, 120)
        : "";
    const deviceCode = randomBytes(32).toString("hex");
    let userCode = generateUserCode();
    for (
      let i = 0;
      i < 5 &&
      getLiveDeviceGrantByUserCode(normalizeUserCode(userCode), Date.now());
      i++
    ) {
      userCode = generateUserCode();
    }
    const now = Date.now();
    insertDeviceGrant({
      id: randomUUID(),
      device_code_hash: hashToken(deviceCode),
      user_code: normalizeUserCode(userCode),
      client_name: clientName,
      created_at: now,
      expires_at: now + DEVICE_TTL_S * 1000,
    });
    const origin = new URL(c.req.url).origin;
    return c.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${origin}/device`,
      verification_uri_complete: `${origin}/device?user_code=${userCode}`,
      expires_in: DEVICE_TTL_S,
      interval: DEVICE_POLL_INTERVAL_S,
    });
  });

  app.get("/api/auth/device/pending", (c) => {
    if (limited("pending", clientIp(c)))
      return c.json({ error: "rate_limited" }, 429);
    const code = normalizeUserCode(c.req.query("user_code") ?? "");
    if (code.length !== 8) return c.json({ error: "not found" }, 404);
    const grant = getLiveDeviceGrantByUserCode(code, Date.now());
    if (!grant) return c.json({ error: "not found" }, 404);
    return c.json({
      client_name: grant.client_name,
      key_name: grant.key_name,
      expires_at: grant.expires_at,
    });
  });

  app.post("/api/auth/device/approve", async (c) => {
    if (limited("approve", clientIp(c)))
      return c.json({ error: "rate_limited" }, 429);
    const user = c.get("user") as AuthUser;
    const body = (await c.req.json().catch(() => null)) as {
      user_code?: unknown;
      decision?: unknown;
      key_name?: unknown;
    } | null;
    const decision = body?.decision;
    if (decision !== "approve" && decision !== "deny")
      return c.json({ error: "decision must be approve or deny" }, 400);
    const code = normalizeUserCode(
      typeof body?.user_code === "string" ? body.user_code : "",
    );
    if (code.length !== 8) return c.json({ error: "not found" }, 404);
    const grant = getLiveDeviceGrantByUserCode(code, Date.now());
    if (!grant) return c.json({ error: "not found" }, 404);
    if (decision === "deny") {
      denyDeviceGrant(grant.id);
      return c.json({ ok: true });
    }
    const requested =
      typeof body?.key_name === "string" ? body.key_name.trim() : "";
    const keyName = (
      requested ||
      `bots-cli ${grant.client_name} ${new Date().toISOString().slice(0, 10)}`
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    const value = `bots_${randomBytes(20).toString("hex")}`;
    const keyId = randomUUID();
    insertApiKey({
      id: keyId,
      name: keyName,
      hash: hashToken(value),
      user_id: user.id || null,
      created_at: Date.now(),
    });
    if (
      !approveDeviceGrant(grant.id, {
        key_name: keyName,
        api_key_id: keyId,
        api_value: value,
        owner_email: user.email,
      })
    ) {
      deleteApiKey(keyId, user.id);
      return c.json({ error: "already decided" }, 409);
    }
    return c.json({ ok: true });
  });

  app.post("/api/auth/device/token", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      device_code?: unknown;
    } | null;
    if (typeof body?.device_code !== "string" || !body.device_code)
      return c.json({ error: "invalid_request" }, 400);
    const hash = hashToken(body.device_code);
    if (limited("token", clientIp(c)) || limited("tokencode", hash))
      return c.json({ error: "rate_limited" }, 429);
    const grant = getDeviceGrantByDeviceHash(hash);
    if (!grant) return c.json({ error: "access_denied" }, 400);
    const now = Date.now();
    if (grant.status === "denied" || grant.status === "claimed")
      return c.json({ error: "access_denied" }, 400);
    if (grant.expires_at <= now) return c.json({ error: "expired_token" }, 400);
    if (grant.status === "approved") {
      const claim = claimDeviceGrant(grant.id);
      if (!claim) return c.json({ error: "access_denied" }, 400);
      return c.json({
        api_key: claim.api_value,
        key_id: grant.api_key_id,
        key_name: grant.key_name,
        email: grant.owner_email,
      });
    }
    if (
      grant.last_polled_at !== null &&
      now - grant.last_polled_at < DEVICE_POLL_INTERVAL_S * 1000
    )
      return c.json({ error: "slow_down" }, 400);
    touchDeviceGrantPoll(grant.id, now);
    return c.json({ error: "authorization_pending" }, 400);
  });

  app.get("/api/settings", (c) =>
    c.json({
      sandbox_idle_minutes: idleMinutes(),
      default_provider_id: getSetting("default_provider_id") ?? null,
      default_model: getSetting("default_model") ?? null,
      control_mcp_enabled: getSetting("control_mcp_enabled") !== "0",
    }),
  );

  app.get("/api/pause", (c) => {
    const armed = isBreakerArmed() && breakerState().exceeded;
    return c.json(
      armed
        ? { paused: isPaused(), reason: "breaker" }
        : { paused: isPaused() },
    );
  });

  app.post("/api/pause", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      paused?: unknown;
    } | null;
    if (typeof body?.paused !== "boolean")
      return c.json({ error: "paused must be a boolean" }, 400);
    if (!body.paused && isBreakerArmed()) {
      const state = breakerState();
      if (state.exceeded)
        return c.json(
          {
            error: `Spend circuit breaker tripped: ${state.tokens_30d.toLocaleString()} tokens used of a ${state.limit_tokens.toLocaleString()} cap (trailing 30 days). Raise or clear the cap in Settings to resume.`,
          },
          409,
        );
      setBreakerArmed(false);
    }
    setPaused(body.paused);
    if (!body.paused) resumePendingInjections();
    return c.json({ paused: body.paused });
  });

  // specs/usage/circuit-breaker.md — server-wide trailing-30-day token cap.
  app.get("/api/breaker", (c) => c.json(breakerState()));

  app.put("/api/breaker", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      limit_tokens?: unknown;
    } | null;
    const raw = body?.limit_tokens;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0)
      return c.json(
        { error: "limit_tokens must be a non-negative integer" },
        400,
      );
    setBreakerLimit(raw);
    return c.json(breakerState());
  });

  // specs/bots/emergency-stop.md — panic button: interrupt everything, then arm the pause.
  app.post("/api/stop-all", (c) => {
    const stopped = stopAllLoops();
    setPaused(true);
    return c.json({ stopped });
  });

  app.put("/api/settings", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      sandbox_idle_minutes?: unknown;
      default_provider_id?: unknown;
      default_model?: unknown;
      control_mcp_enabled?: unknown;
    } | null;
    if (!body || typeof body !== "object")
      return c.json({ error: "invalid body" }, 400);
    const out: Record<string, unknown> = {};
    if (body.control_mcp_enabled !== undefined) {
      if (typeof body.control_mcp_enabled !== "boolean")
        return c.json({ error: "control_mcp_enabled must be a boolean" }, 400);
      setSetting("control_mcp_enabled", body.control_mcp_enabled ? "1" : "0");
      out.control_mcp_enabled = body.control_mcp_enabled;
    }
    if (body.sandbox_idle_minutes !== undefined) {
      const raw = body.sandbox_idle_minutes;
      if (
        typeof raw !== "number" ||
        !Number.isInteger(raw) ||
        raw < 0 ||
        raw > 1440
      )
        return c.json(
          { error: "sandbox_idle_minutes must be an integer 0-1440" },
          400,
        );
      setSetting("sandbox_idle_minutes", String(raw));
      out.sandbox_idle_minutes = raw;
    }
    if (body.default_provider_id !== undefined) {
      const id = body.default_provider_id;
      if (typeof id !== "string")
        return c.json({ error: "default_provider_id must be a string" }, 400);
      if (id && !getProvider(id))
        return c.json({ error: "unknown provider" }, 400);
      if (id) setSetting("default_provider_id", id);
      else deleteSetting("default_provider_id");
      out.default_provider_id = id || null;
    }
    if (body.default_model !== undefined) {
      const id = body.default_model;
      if (typeof id !== "string")
        return c.json({ error: "default_model must be a string" }, 400);
      if (id) setSetting("default_model", id);
      else deleteSetting("default_model");
      out.default_model = id || null;
    }
    return c.json(out);
  });

  type TemplateInput = {
    name?: unknown;
    description?: unknown;
    instructions?: unknown;
    machine_id?: unknown;
    role_id?: unknown;
    triggers?: unknown;
  };

  function toTemplatePayload(input: TemplateInput) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) return { error: "name is required" };
    for (const key of ["description", "instructions"] as const) {
      const v = input[key];
      if (v !== undefined && typeof v !== "string")
        return { error: `${key} must be a string` };
    }
    const refs: { machine_id: string | null; role_id: string | null } = {
      machine_id: null,
      role_id: null,
    };
    for (const key of ["machine_id", "role_id"] as const) {
      const v = input[key];
      if (v === undefined || v === null) continue;
      if (typeof v !== "string") return { error: `${key} must be a string` };
      const exists = key === "machine_id" ? getMachine(v) : getRole(v);
      if (!exists) return { error: `unknown ${key.replace("_id", "")}: ${v}` };
      refs[key] = v;
    }
    const triggers: { message: string; schedule: string }[] = [];
    if (input.triggers !== undefined) {
      if (!Array.isArray(input.triggers))
        return { error: "triggers must be an array" };
      for (const t of input.triggers as Record<string, unknown>[]) {
        const message = typeof t?.message === "string" ? t.message.trim() : "";
        const schedule =
          typeof t?.schedule === "string" ? t.schedule.trim() : "";
        if (!message) return { error: "trigger message is required" };
        if (!schedule || nextRunAt(schedule) === null)
          return { error: `invalid schedule: ${schedule}` };
        triggers.push({ message, schedule });
      }
    }
    return {
      name,
      description: (input.description as string | undefined) ?? "",
      instructions: (input.instructions as string | undefined) ?? "",
      ...refs,
      triggers,
    };
  }

  app.get("/api/templates", (c) => c.json(listTemplates()));

  app.post("/api/templates", async (c) => {
    const body = (await c.req.json().catch(() => null)) as TemplateInput | null;
    if (!body || typeof body !== "object")
      return c.json({ error: "invalid body" }, 400);
    const p = toTemplatePayload(body);
    if ("error" in p) return c.json({ error: p.error }, 400);
    if (listTemplates().some((t) => t.name === p.name))
      return c.json({ error: `template name exists: ${p.name}` }, 409);
    const created = insertTemplate({
      id: randomUUID(),
      ...p,
      triggers: JSON.stringify(p.triggers),
      created_at: Date.now(),
    });
    return c.json(created, 201);
  });

  app.patch("/api/templates/:templateId", async (c) => {
    const existing = getTemplate(c.req.param("templateId"));
    if (!existing) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as TemplateInput | null;
    if (!body || typeof body !== "object")
      return c.json({ error: "invalid body" }, 400);
    const p = toTemplatePayload({
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      instructions: body.instructions ?? existing.instructions,
      machine_id:
        body.machine_id === undefined ? existing.machine_id : body.machine_id,
      role_id: body.role_id === undefined ? existing.role_id : body.role_id,
      triggers: body.triggers ?? existing.triggers,
    });
    if ("error" in p) return c.json({ error: p.error }, 400);
    if (listTemplates().some((t) => t.name === p.name && t.id !== existing.id))
      return c.json({ error: `template name exists: ${p.name}` }, 409);
    updateTemplate(existing.id, {
      ...p,
      triggers: JSON.stringify(p.triggers),
    });
    return c.json(getTemplate(existing.id));
  });

  app.delete("/api/templates/:templateId", (c) => {
    if (!getTemplate(c.req.param("templateId")))
      return c.json({ error: "not found" }, 404);
    deleteTemplate(c.req.param("templateId"));
    return c.json({ ok: true });
  });

  const MCP_TOOLS: Record<
    string,
    (a: Record<string, unknown>) => {
      method: string;
      path: string;
      body?: unknown;
    }
  > = {
    bots_list: () => ({ method: "GET", path: "/api/bots" }),
    bot_get: (a) => ({ method: "GET", path: `/api/bots/${String(a.id)}` }),
    bot_create: (a) => ({
      method: "POST",
      path: "/api/bots",
      body: {
        name: a.name,
        instructions: a.instructions,
      },
    }),
    bot_set_role: (a) => ({
      method: "PATCH",
      path: `/api/bots/${String(a.id)}`,
      body: { role_id: a.role_id ?? null },
    }),
    run_now: (a) => ({
      method: "POST",
      path: `/api/bots/${String(a.bot_id)}/run`,
      body: { message: a.message },
    }),
    interrupt: (a) => ({
      method: "POST",
      path: `/api/bots/${String(a.bot_id)}/interrupt`,
    }),
    runs_tail: (a) => ({
      method: "GET",
      path: `/api/bots/${String(a.bot_id)}/runs`,
    }),
    projects_list: () => ({ method: "GET", path: "/api/projects" }),
    project_create: (a) => ({
      method: "POST",
      path: "/api/projects",
      body: {
        name: a.name,
        description: a.description ?? "",
        body: a.body,
      },
    }),
    project_update: (a) => ({
      method: "PATCH",
      path: `/api/projects/${String(a.id)}`,
      body: {
        ...(a.name === undefined ? {} : { name: a.name }),
        ...(a.description === undefined ? {} : { description: a.description }),
        ...(a.body === undefined ? {} : { body: a.body }),
      },
    }),
    project_delete: (a) => ({
      method: "DELETE",
      path: `/api/projects/${String(a.id)}`,
    }),
    bot_set_projects: (a) => ({
      method: "PATCH",
      path: `/api/bots/${String(a.id)}`,
      body: { project_ids: a.project_ids ?? [] },
    }),
  };

  const MCP_TOOL_DEFS = [
    { name: "bots_list", description: "List bots with health and run state" },
    {
      name: "bot_get",
      description: "Read one bot",
      inputSchema: { type: "object", required: ["id"] },
    },
    {
      name: "bot_create",
      description: "Create a bot",
      inputSchema: { type: "object", required: ["name"] },
    },
    {
      name: "bot_set_role",
      description: "Set or clear a bot's role",
      inputSchema: { type: "object", required: ["id", "role_id"] },
    },
    {
      name: "run_now",
      description: "Inject a manual run into a bot",
      inputSchema: { type: "object", required: ["bot_id"] },
    },
    {
      name: "interrupt",
      description: "Interrupt a running loop",
      inputSchema: { type: "object", required: ["bot_id"] },
    },
    {
      name: "runs_tail",
      description: "Recent runs for a bot",
      inputSchema: { type: "object", required: ["bot_id"] },
    },
    { name: "projects_list", description: "List shared-context projects" },
    {
      name: "project_create",
      description: "Create a project (name + markdown body)",
      inputSchema: { type: "object", required: ["name", "body"] },
    },
    {
      name: "project_update",
      description: "Update a project's name, description or body",
      inputSchema: { type: "object", required: ["id"] },
    },
    {
      name: "project_delete",
      description: "Delete a project and its attachments",
      inputSchema: { type: "object", required: ["id"] },
    },
    {
      name: "bot_set_projects",
      description: "Replace the projects attached to a bot",
      inputSchema: { type: "object", required: ["id", "project_ids"] },
    },
  ];

  const rpcError = (id: unknown, code: number, message: string) =>
    Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

  app.post("/mcp", async (c) => {
    if (getSetting("control_mcp_enabled") === "0")
      return c.json({ error: "not found" }, 404);
    const header = c.req.header("authorization");
    const value = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!API_KEY_RE.test(value))
      return c.json({ error: "api key required" }, 401);
    const apiKeyRow = getApiKeyByHash(
      createHash("sha256").update(value).digest("hex"),
    );
    if (!apiKeyRow) return c.json({ error: "invalid api key" }, 401);
    const now = Date.now();
    if (
      apiKeyRow.last_used_at === null ||
      now - apiKeyRow.last_used_at >= 60_000
    )
      touchApiKey(apiKeyRow.id, now);
    const owner = apiKeyRow.user_id
      ? getUserById(apiKeyRow.user_id)
      : undefined;
    c.set("user", {
      id: owner?.id ?? "",
      email: owner?.email ?? "api-key",
      keyId: apiKeyRow.id,
    });

    const msg = (await c.req.json().catch(() => null)) as {
      jsonrpc?: string;
      id?: unknown;
      method?: string;
      params?: Record<string, unknown>;
    } | null;
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string")
      return rpcError(msg?.id, -32600, "invalid request");
    if (msg.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    if (msg.method === "initialize")
      return c.json({
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: {
          protocolVersion:
            typeof msg.params?.protocolVersion === "string"
              ? msg.params.protocolVersion
              : "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "bots-control", version: "1.0.0" },
        },
      });
    if (msg.method === "ping")
      return c.json({ jsonrpc: "2.0", id: msg.id ?? null, result: {} });
    if (msg.method === "tools/list")
      return c.json({
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: { tools: MCP_TOOL_DEFS },
      });
    if (msg.method === "tools/call") {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const tool = MCP_TOOLS[name];
      if (!tool) return rpcError(msg.id, -32602, `unknown tool: ${name}`);
      const call = tool(args);
      const sub = await app.fetch(
        new Request(`http://localhost${call.path}`, {
          method: call.method,
          headers: {
            authorization: header as string,
            "content-type": "application/json",
          },
          body: call.body === undefined ? undefined : JSON.stringify(call.body),
        }),
      );
      let payload: unknown;
      try {
        payload = await sub.json();
      } catch {
        payload = { ok: sub.status < 400 };
      }
      if (name === "runs_tail" && Array.isArray(payload)) {
        const limit = typeof args.limit === "number" ? args.limit : 20;
        payload = payload.slice(0, Math.max(1, Math.min(limit, 100)));
      }
      return c.json({
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          isError: sub.status >= 400,
        },
      });
    }
    return rpcError(msg.id, -32601, `unknown method: ${msg.method}`);
  });

  app.get("/api/api-keys", (c) => {
    const user = c.get("user") as { id: string; email: string };
    return c.json(listApiKeys(user.id));
  });

  app.post("/api/api-keys", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      name?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name is required" }, 400);
    const value = `bots_${randomBytes(20).toString("hex")}`;
    const user = c.get("user") as { id: string; email: string };
    const key = {
      id: randomUUID(),
      name,
      hash: createHash("sha256").update(value).digest("hex"),
      user_id: user.id || null,
      created_at: Date.now(),
    };
    insertApiKey(key);
    return c.json({ id: key.id, name, created_at: key.created_at, value }, 201);
  });

  app.delete("/api/api-keys/:keyId", (c) => {
    const user = c.get("user") as { id: string; email: string };
    if (!deleteApiKey(c.req.param("keyId"), user.id))
      return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  app.get("/api/push/key", async (c) => {
    try {
      return c.json({ key: await vapidPublicKey() });
    } catch {
      return c.json({ error: "push unavailable" }, 503);
    }
  });

  app.put("/api/push/subscription", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      endpoint?: unknown;
      p256dh?: unknown;
      auth?: unknown;
    } | null;
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body?.p256dh === "string" ? body.p256dh : "";
    const auth = typeof body?.auth === "string" ? body.auth : "";
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return c.json({ error: "endpoint must be an absolute URL" }, 400);
    }
    const loopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
      return c.json({ error: "endpoint must be an https URL" }, 400);
    if (!p256dh || !auth)
      return c.json({ error: "p256dh and auth are required" }, 400);
    const user = c.get("user") as { id: string; email: string };
    upsertPushSubscription({
      id: randomUUID(),
      user_id: user.id || null,
      endpoint,
      p256dh,
      auth,
    });
    return c.json({ ok: true }, 201);
  });

  app.delete("/api/push/subscription", async (c) => {
    const body = await c.req.json().catch(() => null);
    const endpoint =
      typeof body?.endpoint === "string"
        ? body.endpoint
        : (c.req.query("endpoint") ?? "");
    const user = c.get("user") as { id: string; email: string };
    if (!removePushSubscriptionOwned(endpoint, user.id))
      return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  app.get("/api/notifications", (c) => {
    const raw = c.req.query("limit");
    let limit = 100;
    if (raw !== undefined) {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 250)
        return c.json({ error: "limit must be an integer from 1 to 250" }, 400);
      limit = parsed;
    }
    return c.json({
      items: listNotifications(limit),
      unread_count: unreadNotificationCount(),
    });
  });

  app.post("/api/notifications/read-all", (c) => {
    markAllNotificationsRead();
    return c.json({ ok: true });
  });

  app.post("/api/notifications/:id/read", (c) => {
    if (!markNotificationRead(c.req.param("id")))
      return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  app.get("/api/providers", (c) =>
    c.json(
      listProviders().map(({ api_key, ...rest }) => ({
        ...rest,
        has_key: api_key.length > 0,
      })),
    ),
  );

  const providerBody = async (c: Context) => {
    const body = (await c.req.json().catch(() => null)) as {
      name?: unknown;
      base_url?: unknown;
      api_key?: unknown;
      models?: unknown;
    } | null;
    if (!body || typeof body !== "object") return null;
    const errors: string[] = [];
    const str = (v: unknown): string | undefined =>
      typeof v === "string" ? v.trim() : undefined;
    const name = str(body.name);
    const baseUrl = str(body.base_url);
    const apiKey =
      body.api_key === undefined ? undefined : (str(body.api_key) ?? "");
    let models: string[] | undefined;
    if (body.models !== undefined) {
      if (
        !Array.isArray(body.models) ||
        !body.models.every((m) => typeof m === "string")
      )
        errors.push("models must be an array of strings");
      else
        models = [
          ...new Set((body.models as string[]).map((m) => m.trim())),
        ].filter(Boolean);
    }
    return { name, baseUrl, apiKey, models, errors };
  };

  app.post("/api/providers", async (c) => {
    const parsed = await providerBody(c);
    if (!parsed) return c.json({ error: "invalid body" }, 400);
    const { name, baseUrl, apiKey, models, errors } = parsed;
    if (!name) errors.push("name is required");
    if (!baseUrl?.startsWith("http")) errors.push("base_url must be a URL");
    if (errors.length > 0) return c.json({ error: errors.join("; ") }, 400);
    const provider = {
      id: randomUUID(),
      name: name as string,
      base_url: baseUrl as string,
      api_key: apiKey ?? "",
      models: models ?? [],
      created_at: Date.now(),
    };
    insertProvider(provider);
    if (!getSetting("default_provider_id")) {
      setSetting("default_provider_id", provider.id);
      if (provider.models[0]) setSetting("default_model", provider.models[0]);
    }
    const { api_key, ...rest } = provider;
    return c.json({ ...rest, has_key: api_key.length > 0 }, 201);
  });

  app.put("/api/providers/:id", async (c) => {
    const existing = getProvider(c.req.param("id"));
    if (!existing) return c.json({ error: "not found" }, 404);
    const parsed = await providerBody(c);
    if (!parsed) return c.json({ error: "invalid body" }, 400);
    const { name, baseUrl, apiKey, models, errors } = parsed;
    if (name === undefined || !name) errors.push("name is required");
    if (baseUrl === undefined || !baseUrl?.startsWith("http"))
      errors.push("base_url must be a URL");
    if (errors.length > 0) return c.json({ error: errors.join("; ") }, 400);
    updateProvider(existing.id, {
      name,
      base_url: baseUrl,
      api_key: apiKey ?? existing.api_key,
      models,
    });
    const updated = getProvider(existing.id) as ProviderRow;
    const { api_key, ...rest } = updated;
    return c.json({ ...rest, has_key: api_key.length > 0 });
  });

  app.delete("/api/providers/:id", (c) => {
    if (!deleteProvider(c.req.param("id")))
      return c.json({ error: "not found" }, 404);
    if (getSetting("default_provider_id") === c.req.param("id")) {
      const next = listProviders()[0];
      if (next) {
        setSetting("default_provider_id", next.id);
        setSetting("default_model", next.models[0] ?? "");
      } else {
        deleteSetting("default_provider_id");
        deleteSetting("default_model");
      }
    }
    return c.json({ ok: true });
  });

  app.post("/api/providers/detect", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      base_url?: unknown;
      api_key?: unknown;
      id?: unknown;
    } | null;
    const baseUrl =
      typeof body?.base_url === "string" ? body.base_url.trim() : "";
    if (!baseUrl.startsWith("http"))
      return c.json({ error: "base_url is required" }, 400);
    let apiKey = typeof body?.api_key === "string" ? body.api_key.trim() : "";
    if (!apiKey && typeof body?.id === "string")
      apiKey = getProvider(body.id)?.api_key ?? "";
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok)
        return c.json({ error: `provider returned ${res.status}` }, 502);
      const data = (await res.json()) as { data?: { id?: unknown }[] };
      const models = (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string")
        .sort();
      return c.json({ models });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "detection failed" },
        502,
      );
    }
  });

  app.get("/api/bots", (c) =>
    c.json(
      (() => {
        const errored = latestErrorBotIds();
        const projMap = projectIdsByBot();
        const tagMap = tagIdsByBot();
        const roleNames = new Map(listRoles().map((r) => [r.id, r.name]));
        const hasDefault = Boolean(
          getSetting("default_provider_id") && getSetting("default_model"),
        );
        return listBots().map((bot) => {
          const noModel = !bot.model_id && !hasDefault;
          const agentRed =
            bot.status !== null && bot.status_level === "blocked";
          const red = errored.has(bot.id) || noModel || agentRed;
          return {
            ...bot,
            role_name: bot.role_id
              ? (roleNames.get(bot.role_id) ?? null)
              : null,
            project_ids: projMap.get(bot.id) ?? [],
            tag_ids: tagMap.get(bot.id) ?? [],
            secret_ids: botSecretIds(bot.id),
            health: !bot.enabled
              ? ("gray" as const)
              : red
                ? ("red" as const)
                : bot.status !== null && bot.status_level === "issue"
                  ? ("yellow" as const)
                  : isLoopActive(bot.id)
                    ? ("green" as const)
                    : ("blue" as const),
            run_state: isLoopActive(bot.id)
              ? "running"
              : bot.enabled
                ? "enabled"
                : "disabled",
          };
        });
      })(),
    ),
  );

  app.post("/api/bots", async (c) => {
    const payload = toBotPayload(await c.req.json<BotInput>());
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    const bot = {
      id: randomUUID(),
      watchdog_tripped: 0,
      watchdog_run_started_at: null,
      current_task: null,
      current_task_updated_at: null,
      status: null,
      status_level: null,
      ...payload,
      created_at: Date.now(),
    };
    insertBot(bot);
    return c.json(bot, 201);
  });

  app.get("/api/secrets", (c) => {
    return c.json(
      listSecret().map((s) => ({
        id: s.id,
        name: s.name,
        key: s.key,
        created_at: s.created_at,
      })),
    );
  });

  app.post("/api/secrets", async (c) => {
    const body = await c.req
      .json<{ name?: unknown; key?: unknown; value?: unknown }>()
      .catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name is required" }, 400);
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      return c.json(
        {
          error:
            "key must be a valid env var name (letters, digits, underscores; not starting with a digit)",
        },
        400,
      );
    if (typeof body?.value !== "string" || !body.value)
      return c.json({ error: "value is required" }, 400);
    if (findSecretByName(name))
      return c.json({ error: "name already exists" }, 400);
    const secret = {
      id: randomUUID(),
      name,
      key,
      value: body.value,
      created_at: Date.now(),
    };
    insertSecret(secret);
    return c.json(
      {
        id: secret.id,
        name: secret.name,
        key: secret.key,
        created_at: secret.created_at,
      },
      201,
    );
  });

  app.get("/api/secrets/:secretId", (c) => {
    const found = getSecret(c.req.param("secretId"));
    if (!found) return c.json({ error: "not found" }, 404);
    const { value: _value, ...rest } = found;
    return c.json(rest);
  });

  app.get("/api/secrets/:secretId/value", (c) => {
    const found = getSecret(c.req.param("secretId"));
    if (!found) return c.json({ error: "not found" }, 404);
    return c.json({ value: found.value });
  });

  app.patch("/api/secrets/:secretId", async (c) => {
    const found = getSecret(c.req.param("secretId"));
    if (!found) return c.json({ error: "not found" }, 404);
    const body = await c.req
      .json<{ name?: unknown; key?: unknown; value?: unknown }>()
      .catch(() => null);
    const patch: { name?: string; key?: string; value?: string } = {};
    if (body?.name !== undefined) {
      const newName = typeof body.name === "string" ? body.name.trim() : "";
      if (!newName) return c.json({ error: "name is required" }, 400);
      const clash = findSecretByName(newName);
      if (clash && clash.id !== found.id)
        return c.json({ error: "name already exists" }, 400);
      patch.name = newName;
    }
    if (body?.key !== undefined) {
      const key = typeof body.key === "string" ? body.key.trim() : "";
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
        return c.json(
          {
            error:
              "key must be a valid env var name (letters, digits, underscores; not starting with a digit)",
          },
          400,
        );
      patch.key = key;
    }
    if (body?.value !== undefined) {
      if (typeof body.value !== "string" || !body.value)
        return c.json({ error: "value is required" }, 400);
      patch.value = body.value;
    }
    updateSecret(found.id, patch);
    const updated = getSecret(found.id);
    if (!updated) return c.json({ error: "not found" }, 404);
    const { value: _value, ...rest } = updated;
    return c.json(rest);
  });

  app.delete("/api/secrets/:secretId", (c) => {
    const found = getSecret(c.req.param("secretId"));
    if (!found) return c.json({ error: "not found" }, 404);
    deleteSecret(found.id);
    return c.json({ ok: true });
  });

  app.get("/api/roles", (c) => c.json(listRoles()));

  app.get("/api/projects", (c) => c.json(listProjects()));

  app.post("/api/projects", async (c) => {
    const body = await c.req.json<{
      name?: string;
      description?: string;
      body?: string;
    }>();
    const name = body.name?.trim();
    const text = body.body?.trim();
    if (!name || !text) return c.json({ error: "name and body required" }, 400);
    const project = {
      id: randomUUID(),
      name,
      description: body.description?.trim() ?? "",
      body: body.body as string,
      created_at: Date.now(),
    };
    insertProject(project);
    return c.json(project, 201);
  });

  app.get("/api/projects/:projectId", (c) => {
    const project = getProject(c.req.param("projectId"));
    if (!project) return c.json({ error: "not found" }, 404);
    return c.json(project);
  });

  app.patch("/api/projects/:projectId", async (c) => {
    const project = getProject(c.req.param("projectId"));
    if (!project) return c.json({ error: "not found" }, 404);
    const body = await c.req.json<{
      name?: string;
      description?: string;
      body?: string;
    }>();
    const patch: Record<string, string> = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return c.json({ error: "name required" }, 400);
      patch.name = name;
    }
    if (body.description !== undefined)
      patch.description = body.description.trim();
    if (body.body !== undefined) {
      if (!body.body.trim()) return c.json({ error: "body required" }, 400);
      patch.body = body.body;
    }
    updateProject(project.id, patch);
    return c.json(getProject(project.id));
  });

  app.delete("/api/projects/:projectId", (c) => {
    const project = getProject(c.req.param("projectId"));
    if (!project) return c.json({ error: "not found" }, 404);
    deleteProject(project.id);
    return c.json({ ok: true });
  });

  app.get("/api/tags", (c) => c.json(listTags()));

  app.post("/api/tags", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      name?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name is required" }, 400);
    if (tagByName(name)) return c.json({ error: "name already exists" }, 400);
    const tag = { id: randomUUID(), name, created_at: Date.now() };
    insertTag(tag);
    return c.json({ ...tag, bot_count: 0 }, 201);
  });

  app.patch("/api/tags/:tagId", async (c) => {
    const tag = getTag(c.req.param("tagId"));
    if (!tag) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      name?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name is required" }, 400);
    const clash = tagByName(name);
    if (clash && clash.id !== tag.id)
      return c.json({ error: "name already exists" }, 400);
    renameTag(tag.id, name);
    return c.json(getTag(tag.id));
  });

  app.delete("/api/tags/:tagId", (c) => {
    const tag = getTag(c.req.param("tagId"));
    if (!tag) return c.json({ error: "not found" }, 404);
    deleteTag(tag.id);
    return c.json({ ok: true });
  });

  app.post("/api/roles", async (c) => {
    const payload = toRolePayload(
      await c.req.json<RoleInput>(),
      new Set(listMcpServers().map((m) => m.id)),
      new Set(listSkills().map((sk) => sk.id)),
    );
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    const role = { id: randomUUID(), ...payload, created_at: Date.now() };
    insertRole(role);
    return c.json(role, 201);
  });

  app.get("/api/roles/:roleId", (c) => {
    const role = getRole(c.req.param("roleId"));
    if (!role) return c.json({ error: "not found" }, 404);
    return c.json(role);
  });

  app.patch("/api/roles/:roleId", async (c) => {
    const role = getRole(c.req.param("roleId"));
    if (!role) return c.json({ error: "not found" }, 404);
    const payload = toRolePayload(
      {
        ...role,
        ...(await c.req.json<RoleInput>()),
      },
      new Set(listMcpServers().map((m) => m.id)),
      new Set(listSkills().map((sk) => sk.id)),
    );
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    updateRole(role.id, payload);
    return c.json(getRole(role.id));
  });

  app.delete("/api/roles/:roleId", (c) => {
    const role = getRole(c.req.param("roleId"));
    if (!role) return c.json({ error: "not found" }, 404);
    deleteRole(role.id);
    return c.json({ ok: true });
  });

  app.get("/api/teams", (c) => c.json(listTeams()));

  app.post("/api/teams", async (c) => {
    const body = await c.req.json<{ name?: string }>();
    const name = body.name?.trim();
    if (!name) return c.json({ error: "name required" }, 400);
    const team = { id: randomUUID(), name, created_at: Date.now() };
    insertTeam(team);
    return c.json({ ...team, members: [], project_ids: [] }, 201);
  });

  app.get("/api/teams/:teamId", (c) => {
    const team = getTeam(c.req.param("teamId"));
    if (!team) return c.json({ error: "not found" }, 404);
    return c.json(team);
  });

  app.patch("/api/teams/:teamId", async (c) => {
    const team = getTeam(c.req.param("teamId"));
    if (!team) return c.json({ error: "not found" }, 404);
    const body = await c.req.json<{
      name?: string;
      project_ids?: unknown;
      secret_ids?: unknown;
    }>();
    if (body.project_ids !== undefined) {
      if (!Array.isArray(body.project_ids))
        return c.json({ error: "project_ids must be an array" }, 400);
      const ids = body.project_ids.map(String);
      if (ids.some((id) => !getProject(id)))
        return c.json({ error: "unknown project" }, 400);
      setTeamProjects(team.id, ids);
    }
    if (body.secret_ids !== undefined) {
      if (!Array.isArray(body.secret_ids))
        return c.json({ error: "secret_ids must be an array" }, 400);
      try {
        setTeamSecret(
          team.id,
          body.secret_ids.filter((x): x is string => typeof x === "string"),
        );
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : String(err) },
          400,
        );
      }
    }
    if (body.name === undefined && body.project_ids === undefined)
      return c.json({ error: "name required" }, 400);
    const name = body.name?.trim();
    if (body.name !== undefined && !name)
      return c.json({ error: "name required" }, 400);
    if (name) renameTeam(team.id, name);
    const updated = getTeam(team.id);
    if (!updated) return c.json({ error: "not found" }, 404);
    return c.json({
      ...updated,
      secret_ids: teamSecretIds(team.id),
    });
  });

  app.delete("/api/teams/:teamId", (c) => {
    const team = getTeam(c.req.param("teamId"));
    if (!team) return c.json({ error: "not found" }, 404);
    deleteTeam(team.id);
    return c.json({ ok: true });
  });

  app.put("/api/teams/:teamId/members", async (c) => {
    const team = getTeam(c.req.param("teamId"));
    if (!team) return c.json({ error: "not found" }, 404);
    const body = await c.req.json<{ bot_id?: string; leader?: boolean }>();
    const bot = body.bot_id ? getBot(body.bot_id) : undefined;
    if (!bot) return c.json({ error: "unknown bot" }, 400);
    setTeamMember(team.id, bot.id, body.leader === true);
    return c.json(getTeam(team.id));
  });

  app.delete("/api/teams/:teamId/members/:botId", (c) => {
    const team = getTeam(c.req.param("teamId"));
    if (!team) return c.json({ error: "not found" }, 404);
    removeTeamMember(team.id, c.req.param("botId"));
    return c.json(getTeam(team.id));
  });

  const DEFAULT_MACHINE_ID = "default";

  interface MachineInput {
    name?: unknown;
    description?: unknown;
    dockerfile?: unknown;
  }

  function toMachinePayload(input: MachineInput) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) return { error: "name is required" };
    const dockerfile =
      typeof input.dockerfile === "string" ? input.dockerfile.trim() : "";
    if (!dockerfile) return { error: "dockerfile is required" };
    const description =
      typeof input.description === "string" ? input.description.trim() : "";
    return { name, description, dockerfile };
  }

  function machineNameClash(name: string, exceptId?: string) {
    return listMachines().some(
      (m) => m.id !== exceptId && m.name.toLowerCase() === name.toLowerCase(),
    );
  }

  app.get("/api/machines", (c) =>
    c.json([
      {
        id: DEFAULT_MACHINE_ID,
        name: "Default",
        description: "Built-in sandbox image",
        builtin: true,
        dockerfile: "",
        image: defaultImageRef(),
        build_error: null,
      },
      ...listMachines().map((m) => ({ ...m, builtin: false })),
    ]),
  );

  app.post("/api/machines", async (c) => {
    const payload = toMachinePayload(await c.req.json<MachineInput>());
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    if (machineNameClash(payload.name))
      return c.json({ error: "name already exists" }, 400);
    const machine = {
      id: randomUUID(),
      ...payload,
      image: null,
      build_error: null,
      created_at: Date.now(),
    };
    insertMachine(machine);
    return c.json({ ...machine, builtin: false }, 201);
  });

  app.patch("/api/machines/:machineId", async (c) => {
    const existing = getMachine(c.req.param("machineId"));
    if (!existing) return c.json({ error: "not found" }, 404);
    const payload = toMachinePayload({
      ...existing,
      ...(await c.req.json<MachineInput>()),
    });
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    if (machineNameClash(payload.name, existing.id))
      return c.json({ error: "name already exists" }, 400);
    updateMachine(existing.id, payload);
    if (payload.dockerfile !== existing.dockerfile)
      setMachineBuild(existing.id, null, null);
    return c.json({ ...getMachine(existing.id), builtin: false });
  });

  app.delete("/api/machines/:machineId", (c) => {
    const id = c.req.param("machineId");
    if (!getMachine(id)) return c.json({ error: "not found" }, 404);
    const users = botsUsingMachine(id);
    if (users.length > 0)
      return c.json(
        { error: `in use by bots: ${users.map((b) => b.name).join(", ")}` },
        409,
      );
    deleteMachine(id);
    return c.json({ ok: true });
  });

  app.post("/api/machines/default/repull", async (c) => {
    try {
      const image = await repullDefaultImage();
      return c.json({ ok: true, image });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        502,
      );
    }
  });

  app.post("/api/machines/:machineId/rebuild", async (c) => {
    const machine = getMachine(c.req.param("machineId"));
    if (!machine) return c.json({ error: "not found" }, 404);
    try {
      await rebuildMachineImage(machine.id, machine.dockerfile);
    } catch {
      // failure is recorded on the row; surfaced inline per spec
    }
    return c.json({ ...getMachine(machine.id), builtin: false });
  });

  app.get("/api/bots/:id", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    return c.json({
      ...bot,
      project_ids: projectsForBot(bot.id).map((p) => p.id),
      tag_ids: tagsForBot(bot.id).map((t) => t.id),
      secret_ids: botSecretIds(bot.id),
    });
  });

  app.patch("/api/bots/:id", async (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    const input = await c.req.json<
      BotInput & {
        project_ids?: unknown;
        tag_ids?: unknown;
        secret_ids?: unknown;
      }
    >();
    const payload = toBotPayload({ ...bot, ...input });
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    updateBot(bot.id, payload);
    if (input.project_ids !== undefined) {
      if (!Array.isArray(input.project_ids))
        return c.json({ error: "project_ids must be an array" }, 400);
      try {
        setBotProjects(
          bot.id,
          input.project_ids.filter((x): x is string => typeof x === "string"),
        );
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : String(err) },
          400,
        );
      }
    }
    if (input.tag_ids !== undefined) {
      if (!Array.isArray(input.tag_ids))
        return c.json({ error: "tag_ids must be an array" }, 400);
      try {
        setBotTags(
          bot.id,
          input.tag_ids.filter((x): x is string => typeof x === "string"),
        );
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : String(err) },
          400,
        );
      }
    }
    if (input.secret_ids !== undefined) {
      if (!Array.isArray(input.secret_ids))
        return c.json({ error: "secret_ids must be an array" }, 400);
      try {
        setBotSecret(
          bot.id,
          input.secret_ids.filter((x): x is string => typeof x === "string"),
        );
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : String(err) },
          400,
        );
      }
    }

    return c.json({
      ...getBot(bot.id),
      project_ids: projectsForBot(bot.id).map((p) => p.id),
      tag_ids: tagsForBot(bot.id).map((t) => t.id),
      secret_ids: botSecretIds(bot.id),
    });
  });

  app.delete("/api/bots/:id", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    resetBotRuntime(bot.id);
    deleteBot(bot.id);
    removeContainer(bot.id);
    return c.json({ ok: true });
  });

  app.post("/api/bots/:id/run", async (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    if (isPaused()) return c.json({ error: "bots are paused" }, 409);
    const body: { message?: unknown } = await c.req
      .json<{ message?: unknown }>()
      .catch(() => ({}));
    const text =
      typeof body.message === "string" && body.message.trim()
        ? body.message
        : DEFAULT_MANUAL_MESSAGE;
    const { runId, steered } = injectMessage(bot, text, "manual");
    return c.json({ runId, steered }, 202);
  });

  app.get("/api/bots/:id/usage", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    return c.json({ ...botUsageTotals(bot.id), budget: bot.token_budget });
  });

  // specs/machines/workspace-browser.md — read-only host view of the workspace.
  app.get("/api/bots/:id/workspace", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    const path = c.req.query("path") ?? "";
    try {
      return c.json(listWorkspace(bot.id, path));
    } catch (err) {
      if (err instanceof WorkspaceError)
        return c.json({ error: err.message }, err.status as 400);
      throw err;
    }
  });

  app.get("/api/bots/:id/workspace/file", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    const path = c.req.query("path") ?? "";
    try {
      const bytes = readWorkspaceFile(bot.id, path);
      const name = path.split("/").filter(Boolean).pop() ?? "file";
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        },
      });
    } catch (err) {
      if (err instanceof WorkspaceError)
        return c.json({ error: err.message }, err.status as 400);
      throw err;
    }
  });

  app.get("/api/bots/:id/context-usage", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    return c.json(estimateContext(bot));
  });

  app.get("/api/bots/:id/messages", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    type ToolCallTurn = { name: string; input: unknown; output?: string };
    type ChatTurn = {
      role: string;
      text: string;
      thinking?: string;
      tool_calls?: ToolCallTurn[];
      injected?: boolean;
      source?: string;
    };
    const turns: ChatTurn[] = [];
    const callsById = new Map<string, ToolCallTurn>();
    for (const row of loadMessages(bot.id)) {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(row.payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      const blocks: { type?: string; text?: string; thinking?: string }[] =
        typeof msg.content === "string"
          ? [{ type: "text", text: msg.content }]
          : Array.isArray(msg.content)
            ? (msg.content as typeof blocks)
            : [];
      if (row.role === "toolResult") {
        const call = callsById.get(String(msg.toolCallId ?? ""));
        if (call) {
          const out = blocks
            .filter((b) => b?.type === "text")
            .map((b) => String(b.text ?? ""))
            .join("");
          call.output = msg.isError ? `error: ${out}` : out;
        }
        continue;
      }
      if (row.role === "assistant") {
        const turn: ChatTurn = { role: "assistant", text: "" };
        for (const b of blocks) {
          if (b?.type === "text") turn.text += String(b.text ?? "");
          else if (b?.type === "thinking")
            turn.thinking = `${turn.thinking ?? ""}${String(b.thinking ?? "")}`;
          else if (b?.type === "toolCall") {
            const call: ToolCallTurn = {
              name: String((b as Record<string, unknown>).name ?? "?"),
              input: (b as Record<string, unknown>).arguments ?? {},
            };
            (turn.tool_calls ??= []).push(call);
            callsById.set(String((b as Record<string, unknown>).id), call);
          }
        }
        if (turn.text.trim() || turn.tool_calls) turns.push(turn);
      } else {
        const raw = blocks
          .filter((b) => b?.type === "text")
          .map((b) => String(b.text ?? ""))
          .join("");
        const inj = /^\[(schedule|manual|webhook) [^\]]*\]\n/.exec(raw);
        const text = raw.replace(
          /^\[(schedule|manual|chat|webhook) [^\]]*\]\n/,
          "",
        );
        if (text.trim())
          turns.push(
            inj
              ? { role: "user", text, injected: true, source: inj[1] }
              : { role: "user", text },
          );
      }
    }
    return c.json(turns);
  });

  app.post("/api/bots/:id/messages", async (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    if (!bot.enabled) return c.json({ error: "bot is disabled" }, 409);
    const body = (await c.req.json().catch(() => null)) as {
      text?: unknown;
    } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return c.json({ error: "text is required" }, 400);
    const { runId, steered, held } = injectMessage(bot, text, "chat");
    return c.json({ runId, steered, ...(held ? { held: true } : {}) });
  });
  app.post("/api/bots/:id/interrupt", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    return c.json({ stopped: interruptBot(bot.id) });
  });

  app.post("/api/bots/:id/restart-machine", async (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    resetBotRuntime(bot.id);
    try {
      await restartSandbox(bot.id);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        502,
      );
    }
    return c.json({ ok: true });
  });

  app.get("/api/bots/:id/runs", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    return c.json(
      listRuns(bot.id).map((run) => ({
        ...run,
        current_task: bot.current_task,
        current_task_updated_at: bot.current_task_updated_at,
      })),
    );
  });

  // specs/runs/drill-down.md — inline replay of one run's persisted messages.
  app.get("/api/bots/:id/runs/:runId/transcript", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    const run = getRun(c.req.param("runId"));
    if (!run || run.bot_id !== bot.id)
      return c.json({ error: "not found" }, 404);
    type Step = {
      kind: "user" | "assistant" | "tool_call" | "tool_result";
      name?: string;
      text?: string;
      args?: string;
      at: number;
      duration_ms?: number | null;
      is_error?: boolean;
      retry_wait_ms?: number;
    };
    const steps: Step[] = [];
    for (const row of listMessagesForRun(run.id)) {
      let msg: {
        role?: string;
        content?: unknown;
        toolName?: string;
        isError?: boolean;
        durationMs?: number;
      };
      try {
        msg = JSON.parse(row.payload);
      } catch {
        continue;
      }
      const blocks = Array.isArray(msg.content)
        ? (msg.content as {
            type?: string;
            text?: string;
            name?: string;
            arguments?: unknown;
          }[])
        : [];
      const text = blocks
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n");
      if (msg.role === "user") {
        steps.push({
          kind: "user",
          text: typeof msg.content === "string" ? msg.content : text,
          at: row.created_at,
        });
      } else if (msg.role === "assistant") {
        steps.push({ kind: "assistant", text, at: row.created_at });
        for (const b of blocks) {
          if (b.type !== "toolCall") continue;
          let args = "";
          try {
            args = JSON.stringify(b.arguments ?? {});
          } catch {
            args = "{}";
          }
          steps.push({
            kind: "tool_call",
            name: b.name,
            args: args.length > 300 ? `${args.slice(0, 300)}…` : args,
            at: row.created_at,
          });
        }
      } else if (msg.role === "toolResult") {
        steps.push({
          kind: "tool_result",
          name: msg.toolName,
          text,
          is_error: Boolean(msg.isError),
          duration_ms:
            typeof msg.durationMs === "number" ? msg.durationMs : null,
          at: row.created_at,
        });
      }
    }
    // Mark retry waits on the first assistant step that completed after one began.
    for (const w of getRetryWaits(run.id)) {
      const step = steps.find(
        (s) => s.kind === "assistant" && !s.retry_wait_ms && s.at >= w.at,
      );
      if (step) step.retry_wait_ms = (step.retry_wait_ms ?? 0) + w.ms;
    }
    return c.json({
      run: {
        id: run.id,
        status: run.status,
        trigger: run.trigger,
        started_at: run.started_at,
        finished_at: run.finished_at,
      },
      usage: getRunUsage(run.id),
      steps,
    });
  });

  app.get("/api/bots/:id/messages", (c) => {
    const botId = c.req.param("id");
    if (!getBot(botId)) return c.json({ error: "not found" }, 404);
    return c.json(loadMessages(botId));
  });

  app.delete("/api/bots/:id/messages", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    resetBotRuntime(bot.id);
    clearMessages(bot.id);
    return c.json({ ok: true });
  });

  app.get("/api/bots/:id/triggers", (c) => {
    const botId = c.req.param("id");
    if (!getBot(botId)) return c.json({ error: "not found" }, 404);
    return c.json(
      listTriggers(botId).map(({ secret: _secret, ...rest }) => rest),
    );
  });

  app.post("/api/bots/:id/triggers", async (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    const payload = toTriggerPayload(await c.req.json<TriggerInput>());
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    const secret =
      payload.kind === "webhook" ? randomBytes(24).toString("hex") : null;
    const trigger = {
      id: randomUUID(),
      bot_id: bot.id,
      ...payload,
      enabled: 1 as number,
      next_run_at:
        payload.kind === "webhook" || payload.kind === "continuous"
          ? null
          : nextRunAt(payload.schedule),
      secret,
      created_at: Date.now(),
    };
    insertTrigger(trigger);
    return c.json({ ...trigger, url: `/api/webhooks/${trigger.id}` }, 201);
  });

  app.patch("/api/triggers/:triggerId", async (c) => {
    const trigger = getTrigger(c.req.param("triggerId"));
    if (!trigger) return c.json({ error: "not found" }, 404);
    const input = await c.req.json<TriggerInput>();
    if (input.enabled !== undefined && typeof input.enabled !== "boolean")
      return c.json({ error: "enabled must be a boolean" }, 400);
    const payload = toTriggerPayload({ ...trigger, ...input });
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    const enabled =
      typeof input.enabled === "boolean" ? (input.enabled ? 1 : 0) : undefined;
    const resuming = enabled === 1 && trigger.enabled === 0;
    let nextRunAtPatch: number | null;
    if (payload.kind === "continuous") {
      // one-shot timers belong to finishRun, not the clock or the editor
      nextRunAtPatch =
        trigger.kind !== "continuous" || enabled === 0
          ? null
          : trigger.next_run_at;
    } else if (payload.kind === "webhook") {
      nextRunAtPatch = trigger.next_run_at;
    } else {
      nextRunAtPatch =
        resuming || payload.schedule !== trigger.schedule
          ? nextRunAt(payload.schedule)
          : trigger.next_run_at;
    }
    updateTrigger(trigger.id, {
      ...payload,
      ...(enabled === undefined ? {} : { enabled }),
      next_run_at: nextRunAtPatch,
    });
    const fresh = getTrigger(trigger.id);
    if (!fresh) return c.json({ error: "not found" }, 404);
    const { secret: _secret, ...rest } = fresh;
    return c.json(rest);
  });

  app.delete("/api/triggers/:triggerId", (c) => {
    const trigger = getTrigger(c.req.param("triggerId"));
    if (!trigger) return c.json({ error: "not found" }, 404);
    deleteTrigger(trigger.id);
    return c.json({ ok: true });
  });

  app.post("/api/triggers/:triggerId/rotate-secret", (c) => {
    const trigger = getTrigger(c.req.param("triggerId"));
    if (!trigger) return c.json({ error: "not found" }, 404);
    if (trigger.kind !== "webhook")
      return c.json({ error: "not a webhook trigger" }, 400);
    const secret = randomBytes(24).toString("hex");
    setTriggerSecret(trigger.id, secret);
    return c.json({ secret });
  });

  app.post("/api/webhooks/:triggerId", async (c) => {
    const trigger = getTrigger(c.req.param("triggerId"));
    if (trigger?.kind !== "webhook") return c.json({ error: "not found" }, 404);
    const auth = c.req.header("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const secret = trigger.secret ?? "";
    if (
      !token ||
      !secret ||
      token.length !== secret.length ||
      !timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(secret, "utf8"))
    )
      return c.json({ error: "unauthorized" }, 401);
    if (!trigger.enabled) return c.json({ error: "trigger is disabled" }, 409);
    const bot = getBot(trigger.bot_id);
    if (!bot?.enabled) return c.json({ error: "bot is disabled" }, 409);
    if (isPaused()) return c.json({ error: "bots are paused" }, 409);
    const body = await c.req.text();
    if (body.length > 64 * 1024)
      return c.json({ error: "payload too large" }, 413);
    const text = body.trim()
      ? `${trigger.message}\n\nEvent payload:\n${body}`
      : trigger.message;
    const { runId } = injectMessage(bot, text, "webhook");
    return c.json({ ok: true, runId });
  });

  app.get("/api/skills", (c) => c.json(listSkills()));

  app.post("/api/skills", async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const instructions =
      typeof body.instructions === "string" ? body.instructions.trim() : "";
    if (!name) return c.json({ error: "name is required" }, 400);
    if (!instructions)
      return c.json({ error: "instructions are required" }, 400);
    const skill = {
      id: randomUUID(),
      name,
      description,
      instructions,
      created_at: Date.now(),
      import_info: null,
    };
    insertSkill(skill);
    return c.json(skill, 201);
  });

  app.patch("/api/skills/:skillId", async (c) => {
    const id = c.req.param("skillId");
    if (!getSkill(id)) return c.json({ error: "not found" }, 404);
    const body = await c.req.json<Record<string, unknown>>();
    const fields: Record<string, string> = {};
    for (const key of ["name", "description", "instructions"] as const) {
      if (body[key] === undefined) continue;
      if (typeof body[key] !== "string")
        return c.json({ error: `${key} must be a string` }, 400);
      const value = (body[key] as string).trim();
      if ((key === "name" || key === "instructions") && !value)
        return c.json({ error: `${key} is required` }, 400);
      fields[key] = value;
    }
    updateSkill(id, fields);
    return c.json(getSkill(id));
  });

  app.delete("/api/skills/:skillId", (c) => {
    const id = c.req.param("skillId");
    if (!getSkill(id)) return c.json({ error: "not found" }, 404);
    deleteSkill(id);
    removeBundle(id);
    return c.json({ ok: true });
  });

  app.get("/api/skills/search", async (c) => {
    const q = c.req.query("q")?.trim() ?? "";
    if (!q) return c.json({ error: "q is required" }, 400);
    try {
      return c.json({ results: await searchSkillsSh(q) });
    } catch (err) {
      return c.json(
        {
          error: `skills.sh lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        },
        502,
      );
    }
  });

  app.post("/api/skills/preview", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      source?: unknown;
    } | null;
    const raw = typeof body?.source === "string" ? body.source.trim() : "";
    if (!raw) return c.json({ error: "source is required" }, 400);
    const git = parseGitSource(raw);
    if (!git)
      return c.json(
        { error: "unrecognized source — use owner/repo or a repository URL" },
        400,
      );
    let cloned: ClonedRepo | null = null;
    try {
      cloned = await cloneRepo(git);
    } catch (err) {
      return c.json(
        {
          error: `source unavailable: ${err instanceof Error ? err.message : String(err)}`,
        },
        502,
      );
    }
    try {
      const previews = previewSkills((cloned as ClonedRepo).dir, git);
      for (const p of previews) {
        if (!p.name || !p.description)
          return c.json(
            {
              error: `${p.folder}: SKILL.md needs a frontmatter name and description`,
            },
            400,
          );
      }
      return c.json({
        source: git.ownerRepo ?? git.cloneUrl,
        requested_ref: git.ref,
        resolved_commit: (cloned as ClonedRepo).resolvedCommit,
        skills: previews,
      });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        400,
      );
    } finally {
      cleanupClone(cloned.dir);
    }
  });

  app.post("/api/skills/import", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      source?: unknown;
      folders?: unknown;
    } | null;
    const raw = typeof body?.source === "string" ? body.source.trim() : "";
    if (!raw) return c.json({ error: "source is required" }, 400);
    const folders = Array.isArray(body?.folders)
      ? (body.folders as unknown[]).filter(
          (f): f is string => typeof f === "string",
        )
      : [];
    if (!folders.length)
      return c.json({ error: "folders must list the selected skills" }, 400);
    const git = parseGitSource(raw);
    if (!git)
      return c.json(
        { error: "unrecognized source — use owner/repo or a repository URL" },
        400,
      );
    let cloned: ClonedRepo | null = null;
    try {
      cloned = await cloneRepo(git);
    } catch (err) {
      return c.json(
        {
          error: `source unavailable: ${err instanceof Error ? err.message : String(err)}`,
        },
        502,
      );
    }
    try {
      const all = previewSkills((cloned as ClonedRepo).dir, git);
      const selected = all.filter((p) => folders.includes(p.folder));
      if (selected.length !== new Set(folders).size)
        return c.json({ error: "selection does not match the source" }, 400);
      const bundles = selected.map((p) => {
        const fm = parseFrontmatter(
          readFileSync(
            join((cloned as ClonedRepo).dir, p.folder, "SKILL.md"),
            "utf8",
          ),
        );
        if (!fm)
          return {
            error: `${p.folder}: SKILL.md needs a frontmatter name and description`,
          };
        if (p.file_count > MAX_BUNDLE_FILES || p.total_size > MAX_BUNDLE_BYTES)
          return {
            error: `${p.folder}: bundle exceeds ${MAX_BUNDLE_FILES} files or ${Math.floor(MAX_BUNDLE_BYTES / 1024 / 1024)} MB`,
          };
        return { preview: p, fm };
      });
      const bad = bundles.find((b) => "error" in b);
      if (bad && "error" in bad) return c.json({ error: bad.error }, 400); // saves nothing
      const now = Date.now();
      const created = [];
      for (const b of bundles) {
        if ("error" in b) continue;
        const id = randomUUID();
        const info = {
          origin: "git",
          source: git.ownerRepo ?? git.cloneUrl,
          requested_ref: git.ref,
          resolved_commit: (cloned as ClonedRepo).resolvedCommit,
          path: b.preview.folder,
          content_hash: b.preview.content_hash,
          installed_at: now,
          updated_at: now,
        };
        insertSkill({
          id,
          name: b.fm.name,
          description: b.fm.description,
          instructions: b.fm.body,
          created_at: now,
          import_info: JSON.stringify(info),
        });
        storeBundle(id, cloned.dir, b.preview.folder);
        created.push(getSkill(id));
      }
      return c.json({ skills: created }, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        400,
      );
    } finally {
      cleanupClone(cloned.dir);
    }
  });

  app.get("/api/mcp-servers", (c) => c.json(listMcpServers()));

  function toMcpPayload(input: {
    name?: unknown;
    command?: unknown;
    args?: unknown;
    env?: unknown;
    enabled?: unknown;
  }) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) return { error: "name is required" };
    const command =
      typeof input.command === "string" ? input.command.trim() : "";
    if (!command) return { error: "command is required" };
    const args = Array.isArray(input.args)
      ? input.args.filter((a): a is string => typeof a === "string")
      : [];
    const env: Record<string, McpEnvValue> = {};
    if (input.env && typeof input.env === "object" && !Array.isArray(input.env))
      for (const [k, v] of Object.entries(input.env)) {
        if (typeof v === "string") {
          env[k] = v;
        } else if (isMcpSecretRef(v)) {
          const secretName = v.secret.trim();
          if (!secretName) return { error: `secret name is required for ${k}` };
          if (!findSecretByName(secretName))
            return { error: `unknown secret "${secretName}"` };
          env[k] = { secret: secretName };
        } else {
          return { error: `invalid env value for ${k}` };
        }
      }
    const enabled = input.enabled === false ? 0 : 1;
    return { name, command, args, env, enabled };
  }

  app.post("/api/mcp-servers", async (c) => {
    const payload = toMcpPayload(await c.req.json());
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    if (getMcpServerByName(payload.name))
      return c.json({ error: "name already exists" }, 400);
    const server = {
      id: randomUUID(),
      transport: "stdio" as const,
      ...payload,
      created_at: Date.now(),
    };
    insertMcpServer(server);
    return c.json(server, 201);
  });

  app.patch("/api/mcp-servers/:serverId", async (c) => {
    const existing = getMcpServer(c.req.param("serverId"));
    if (!existing) return c.json({ error: "not found" }, 404);
    const payload = toMcpPayload({ ...existing, ...(await c.req.json()) });
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    const clash = getMcpServerByName(payload.name);
    if (clash && clash.id !== existing.id)
      return c.json({ error: "name already exists" }, 400);
    updateMcpServer(existing.id, payload);
    return c.json(getMcpServer(existing.id));
  });

  app.delete("/api/mcp-servers/:serverId", (c) => {
    if (!getMcpServer(c.req.param("serverId")))
      return c.json({ error: "not found" }, 404);
    deleteMcpServer(c.req.param("serverId"));
    return c.json({ ok: true });
  });

  app.post("/api/mcp-servers/:serverId/test", async (c) => {
    const server = getMcpServer(c.req.param("serverId"));
    if (!server) return c.json({ error: "not found" }, 404);
    try {
      return c.json(await testMcpConnection(server));
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        502,
      );
    }
  });

  const webDist = resolve(repoRoot, "packages/web/dist");
  if (existsSync(webDist)) {
    app.use("*", serveStatic({ root: webDist }));
    app.get("*", serveStatic({ path: "index.html", root: webDist }));
  }

  return app;
}
