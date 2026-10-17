import { randomUUID } from "node:crypto";
import { CronExpressionParser } from "cron-parser";
import { runBot } from "./agent.ts";
import {
  type BotRow,
  dueBots,
  finishRun,
  getBot,
  insertRun,
  updateBot,
} from "./db.ts";

export function nextRunAt(
  schedule: string,
  from: Date = new Date(),
): number | null {
  if (!schedule.trim()) return null;
  try {
    const trimmed = schedule.trim();
    if (trimmed.startsWith("@every ")) {
      const ms = parseDuration(trimmed.slice(7));
      return ms === null ? null : from.getTime() + ms;
    }
    return CronExpressionParser.parse(trimmed, { currentDate: from })
      .next()
      .toDate()
      .getTime();
  } catch {
    return null;
  }
}

function parseDuration(spec: string): number | null {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(spec);
  if (!match) return null;
  const multiplier = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2].toLowerCase()
  ];
  if (!multiplier) return null;
  return Number(match[1]) * multiplier;
}

const running = new Set<string>();

export function isRunning(botId: string): boolean {
  return running.has(botId);
}

export function startRun(bot: BotRow, trigger: "schedule" | "manual"): string {
  const runId = randomUUID();
  insertRun({
    id: runId,
    bot_id: bot.id,
    status: "running",
    trigger,
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });
  running.add(bot.id);
  void runBot(bot, runId, trigger)
    .catch((err) =>
      finishRun(
        runId,
        "error",
        null,
        err instanceof Error ? err.message : String(err),
      ),
    )
    .finally(() => running.delete(bot.id));
  return runId;
}

let timer: NodeJS.Timeout | null = null;

export function startScheduler(tickMs = 15_000): void {
  const tick = () => {
    for (const bot of dueBots(Date.now())) {
      if (running.has(bot.id)) continue;
      updateBot(bot.id, { next_run_at: nextRunAt(bot.schedule) });
      startRun(bot, "schedule");
    }
  };
  timer = setInterval(tick, tickMs);
  void tick();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export { getBot };
