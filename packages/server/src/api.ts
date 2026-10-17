import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
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
  deleteRole,
  deleteTrigger,
  getBot,
  getRole,
  getTrigger,
  insertBot,
  insertRole,
  insertTrigger,
  listBots,
  listRoles,
  listRuns,
  listTriggers,
  loadMessages,
  updateBot,
  updateRole,
  updateTrigger,
} from "./db.ts";
import { removeContainer } from "./sandbox.ts";
import { nextRunAt } from "./scheduler.ts";

const DEFAULT_MANUAL_MESSAGE = "Continue with your current work.";

interface BotInput {
  name?: unknown;
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
    system_prompt:
      typeof input.system_prompt === "string" ? input.system_prompt : "",
    model_id:
      typeof input.model_id === "string" && input.model_id.trim()
        ? input.model_id.trim()
        : null,
    role_id,
    enabled: input.enabled === false ? 0 : 1,
  };
}

interface RoleInput {
  name?: unknown;
  instructions?: unknown;
}

function toRolePayload(input: RoleInput) {
  if (typeof input.name !== "string" || !input.name.trim())
    return { error: "name is required" };
  if (typeof input.instructions !== "string" || !input.instructions.trim())
    return { error: "instructions is required" };
  return { name: input.name.trim(), instructions: input.instructions };
}

interface TriggerInput {
  kind?: unknown;
  message?: unknown;
  schedule?: unknown;
}

const TRIGGER_KINDS = ["schedule"] as const;

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

  app.get("/api/bots", (c) =>
    c.json(
      listBots().map((bot) => ({
        ...bot,
        status: isLoopActive(bot.id)
          ? "running"
          : bot.enabled
            ? "enabled"
            : "disabled",
      })),
    ),
  );

  app.post("/api/bots", async (c) => {
    const payload = toBotPayload(await c.req.json<BotInput>());
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    const bot = { id: randomUUID(), ...payload, created_at: Date.now() };
    insertBot(bot);
    return c.json(bot, 201);
  });

  app.get("/api/roles", (c) => c.json(listRoles()));

  app.post("/api/roles", async (c) => {
    const payload = toRolePayload(await c.req.json<RoleInput>());
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
    const payload = toRolePayload({
      ...role,
      ...(await c.req.json<RoleInput>()),
    });
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

  app.post("/api/bots/:id/interrupt", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    return c.json({ stopped: interruptBot(bot.id) });
  });

  app.get("/api/bots/:id/runs", (c) => {
    if (!getBot(c.req.param("id"))) return c.json({ error: "not found" }, 404);
    return c.json(listRuns(c.req.param("id")));
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
    return c.json(listTriggers(botId));
  });

  app.post("/api/bots/:id/triggers", async (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    const payload = toTriggerPayload(await c.req.json<TriggerInput>());
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    const trigger = {
      id: randomUUID(),
      bot_id: bot.id,
      ...payload,
      next_run_at: nextRunAt(payload.schedule),
      created_at: Date.now(),
    };
    insertTrigger(trigger);
    return c.json(trigger, 201);
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
        payload.schedule === trigger.schedule
          ? trigger.next_run_at
          : nextRunAt(payload.schedule),
    });
    return c.json(getTrigger(trigger.id));
  });

  app.delete("/api/triggers/:triggerId", (c) => {
    const trigger = getTrigger(c.req.param("triggerId"));
    if (!trigger) return c.json({ error: "not found" }, 404);
    deleteTrigger(trigger.id);
    return c.json({ ok: true });
  });

  const webDist = resolve(repoRoot, "packages/web/dist");
  if (existsSync(webDist)) {
    app.use("*", serveStatic({ root: webDist }));
    app.get("*", serveStatic({ path: "index.html", root: webDist }));
  }

  return app;
}
