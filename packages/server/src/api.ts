import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context } from "hono";
import { Hono } from "hono";
import {
  injectMessage,
  interruptBot,
  isLoopActive,
  resetBotRuntime,
} from "./agent.ts";
import { repoRoot } from "./config.ts";
import {
  clearMessages,
  deleteBot,
  deleteMcpServer,
  deleteProvider,
  deleteRole,
  deleteSetting,
  deleteSkill,
  deleteTrigger,
  getBot,
  getMcpServer,
  getMcpServerByName,
  getProvider,
  getRole,
  getSetting,
  getSkill,
  getTrigger,
  insertBot,
  insertMcpServer,
  insertProvider,
  insertRole,
  insertSkill,
  insertTrigger,
  latestErrorBotIds,
  listBots,
  listMcpServers,
  listProviders,
  listRoles,
  listRuns,
  listSkills,
  listTriggers,
  loadMessages,
  type ProviderRow,
  setSetting,
  setTriggerSecret,
  updateBot,
  updateMcpServer,
  updateProvider,
  updateRole,
  updateSkill,
  updateTrigger,
} from "./db.ts";
import { testMcpConnection } from "./mcp.ts";
import { idleMinutes, removeContainer } from "./sandbox.ts";
import { nextRunAt } from "./scheduler.ts";

const DEFAULT_MANUAL_MESSAGE = "Continue with your current work.";

interface BotInput {
  name?: unknown;
  description?: unknown;
  system_prompt?: unknown;
  model_id?: unknown;
  role_id?: unknown;
  enabled?: unknown;
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
  return {
    name: input.name.trim(),
    description: typeof input.description === "string" ? input.description : "",
    system_prompt:
      typeof input.system_prompt === "string" ? input.system_prompt : "",
    model_id:
      typeof input.model_id === "string" && input.model_id.trim()
        ? input.model_id.trim()
        : null,
    role_id,
    enabled:
      input.enabled === false ||
      input.enabled === 0 ||
      input.enabled === "false"
        ? 0
        : 1,
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
  message?: unknown;
  schedule?: unknown;
}

const TRIGGER_KINDS = ["schedule", "webhook"] as const;

function toTriggerPayload(input: TriggerInput) {
  const kind = input.kind === undefined ? "schedule" : input.kind;
  if (
    typeof kind !== "string" ||
    !(TRIGGER_KINDS as readonly string[]).includes(kind)
  )
    return { error: `unknown kind: ${String(input.kind)}` };
  if (typeof input.message !== "string" || !input.message.trim())
    return { error: "message is required" };
  const schedule =
    typeof input.schedule === "string" ? input.schedule.trim() : "";
  if (kind === "webhook")
    return {
      kind: kind as (typeof TRIGGER_KINDS)[number],
      message: input.message,
      schedule: "",
    };
  if (!schedule)
    return { error: "schedule is required (cron expression or @every 30m)" };
  if (nextRunAt(schedule) === null)
    return { error: `invalid schedule: ${schedule}` };
  return {
    kind: kind as (typeof TRIGGER_KINDS)[number],
    message: input.message,
    schedule,
  };
}

export function createApp(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/settings", (c) =>
    c.json({
      sandbox_idle_minutes: idleMinutes(),
      default_provider_id: getSetting("default_provider_id") ?? null,
      default_model: getSetting("default_model") ?? null,
    }),
  );

  app.put("/api/settings", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      sandbox_idle_minutes?: unknown;
      default_provider_id?: unknown;
      default_model?: unknown;
    } | null;
    if (!body || typeof body !== "object")
      return c.json({ error: "invalid body" }, 400);
    const out: Record<string, unknown> = {};
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

  app.get("/api/roles", (c) => c.json(listRoles()));

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

  app.get("/api/bots/:id", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    return c.json(bot);
  });

  app.patch("/api/bots/:id", async (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    const payload = toBotPayload({ ...bot, ...(await c.req.json<BotInput>()) });
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    updateBot(bot.id, payload);
    return c.json(getBot(bot.id));
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

  app.get("/api/bots/:id/messages", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    const turns: { role: string; text: string }[] = [];
    for (const row of loadMessages(bot.id)) {
      let msg: unknown;
      try {
        msg = JSON.parse(row.payload);
      } catch {
        continue;
      }
      const content = (msg as { content?: unknown }).content;
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .map((b) =>
                  b &&
                  typeof b === "object" &&
                  (b as { type?: string }).type === "text"
                    ? String((b as { text?: string }).text ?? "")
                    : "",
                )
                .join("")
            : "";
      if (!text.trim()) continue;
      const stripped = text.replace(/^\[(schedule|manual|chat) [^\]]*\]\n/, "");
      turns.push({ role: row.role, text: stripped });
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
    const { runId, steered } = injectMessage(bot, text, "chat");
    return c.json({ runId, steered });
  });
  app.post("/api/bots/:id/interrupt", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    return c.json({ stopped: interruptBot(bot.id) });
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
      next_run_at:
        payload.kind === "webhook" ? null : nextRunAt(payload.schedule),
      secret,
      created_at: Date.now(),
    };
    insertTrigger(trigger);
    return c.json({ ...trigger, url: `/api/webhooks/${trigger.id}` }, 201);
  });

  app.patch("/api/triggers/:triggerId", async (c) => {
    const trigger = getTrigger(c.req.param("triggerId"));
    if (!trigger) return c.json({ error: "not found" }, 404);
    const payload = toTriggerPayload({
      ...trigger,
      ...(await c.req.json<TriggerInput>()),
    });
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    updateTrigger(trigger.id, {
      ...payload,
      next_run_at:
        payload.kind === "webhook" || payload.schedule === trigger.schedule
          ? trigger.next_run_at
          : nextRunAt(payload.schedule),
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
    const bot = getBot(trigger.bot_id);
    if (!bot?.enabled) return c.json({ error: "bot is disabled" }, 409);
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
    return c.json({ ok: true });
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
    const env: Record<string, string> = {};
    if (input.env && typeof input.env === "object" && !Array.isArray(input.env))
      for (const [k, v] of Object.entries(input.env))
        if (typeof v === "string") env[k] = v;
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
