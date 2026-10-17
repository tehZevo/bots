import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { repoRoot } from "./config.ts";
import {
  clearMessages,
  deleteBot,
  getBot,
  insertBot,
  listBots,
  listRuns,
  loadMessages,
  updateBot,
} from "./db.ts";
import { isRunning, nextRunAt, startRun } from "./scheduler.ts";

interface BotInput {
  name?: unknown;
  task?: unknown;
  system_prompt?: unknown;
  schedule?: unknown;
  model_id?: unknown;
  enabled?: unknown;
}

function toBotPayload(input: BotInput) {
  if (typeof input.name !== "string" || !input.name.trim())
    return { error: "name is required" };
  if (typeof input.task !== "string" || !input.task.trim())
    return { error: "task is required" };
  const schedule =
    typeof input.schedule === "string" ? input.schedule.trim() : "";
  if (!schedule)
    return { error: "schedule is required (cron expression or @every 30m)" };
  if (nextRunAt(schedule) === null)
    return { error: `invalid schedule: ${schedule}` };
  return {
    name: input.name.trim(),
    task: input.task,
    system_prompt:
      typeof input.system_prompt === "string" ? input.system_prompt : "",
    schedule,
    model_id:
      typeof input.model_id === "string" && input.model_id.trim()
        ? input.model_id.trim()
        : null,
    enabled: input.enabled === false ? 0 : 1,
  };
}

export function createApp(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/bots", (c) => c.json(listBots()));

  app.post("/api/bots", async (c) => {
    const payload = toBotPayload(await c.req.json<BotInput>());
    if ("error" in payload) return c.json({ error: payload.error }, 400);
    const bot = {
      id: randomUUID(),
      ...payload,
      next_run_at: nextRunAt(payload.schedule),
      last_run_at: null,
      created_at: Date.now(),
    };
    insertBot(bot);
    return c.json(bot, 201);
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
    const scheduleChanged = payload.schedule !== bot.schedule;
    updateBot(bot.id, {
      ...payload,
      next_run_at: scheduleChanged
        ? nextRunAt(payload.schedule)
        : bot.next_run_at,
    });
    return c.json(getBot(bot.id));
  });

  app.delete("/api/bots/:id", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    deleteBot(bot.id);
    return c.json({ ok: true });
  });

  app.post("/api/bots/:id/run", (c) => {
    const bot = getBot(c.req.param("id"));
    if (!bot) return c.json({ error: "not found" }, 404);
    if (isRunning(bot.id)) return c.json({ error: "already running" }, 409);
    const runId = startRun(bot, "manual");
    return c.json({ runId }, 202);
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
    clearMessages(bot.id);
    return c.json({ ok: true });
  });

  const webDist = resolve(repoRoot, "packages/web/dist");
  if (existsSync(webDist)) {
    app.use("*", serveStatic({ root: webDist }));
    app.get("*", serveStatic({ path: "index.html", root: webDist }));
  }

  return app;
}
