import { CronExpressionParser } from "cron-parser";
import { injectMessage } from "./agent.ts";
import {
  dueTriggers,
  getBot,
  isPaused,
  latestErrorBotIds,
  updateTrigger,
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

let timer: NodeJS.Timeout | null = null;
let inject = injectMessage;

export function setSchedulerInject(f: typeof injectMessage | null): void {
  inject = f ?? injectMessage;
}

function isBlocked(botId: string, errers: Set<string>): boolean {
  const bot = getBot(botId);
  return (
    !bot ||
    bot.model_id === null ||
    bot.status_level === "blocked" ||
    errers.has(botId)
  );
}

export function runTick(): void {
  const paused = isPaused();
  let errers: Set<string> | null = null;
  for (const trigger of dueTriggers(Date.now())) {
    if (trigger.kind === "continuous") {
      // One-shot: re-armed by finishRun, never by the clock. While paused a
      // continuous fire stays armed and simply goes off once resumed.
      if (paused) continue;
      updateTrigger(trigger.id, { next_run_at: null });
      const bot = getBot(trigger.bot_id);
      if (!bot?.enabled) continue;
      errers ??= latestErrorBotIds();
      if (isBlocked(trigger.bot_id, errers)) continue;
      inject(bot, trigger.message, "continuous");
    } else {
      updateTrigger(trigger.id, { next_run_at: nextRunAt(trigger.schedule) });
      if (paused) continue;
      const bot = getBot(trigger.bot_id);
      if (!bot?.enabled) continue;
      inject(bot, trigger.message, "schedule");
    }
  }
}

export function startScheduler(tickMs = 15_000): void {
  timer = setInterval(runTick, tickMs);
  runTick();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
