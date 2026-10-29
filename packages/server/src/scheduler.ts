import { CronExpressionParser } from "cron-parser";
import { injectMessage } from "./agent.ts";
import {
  dueTriggers,
  evaluateWatchdogs,
  getBot,
  isPaused,
  latestErrorBotIds,
  updateTrigger,
} from "./db.ts";
import { runDailySkillChecks } from "./skillupdates.ts";

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

export interface SchedulePreview {
  valid: boolean;
  next: string[];
}

export function previewSchedule(
  schedule: string,
  count = 5,
  from = new Date(),
): SchedulePreview {
  const limit = Math.min(Math.max(count, 0), 5);
  const trimmed = schedule.trim();
  if (!trimmed) return { valid: false, next: [] };

  let cursor = new Date(from);
  const next: string[] = [];
  try {
    for (let i = 0; i < limit; i++) {
      let at: number;
      if (trimmed.startsWith("@every ")) {
        const ms = parseDuration(trimmed.slice(7));
        if (ms === null || ms <= 0) return { valid: false, next: [] };
        at = cursor.getTime() + ms;
      } else {
        const parsed = CronExpressionParser.parse(trimmed, {
          currentDate: cursor,
        })
          .next()
          .toDate()
          .getTime();
        at = Math.max(parsed, cursor.getTime() + 1);
      }
      next.push(new Date(at).toISOString());
      cursor = new Date(at);
    }
    return { valid: true, next };
  } catch {
    return { valid: false, next: [] };
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
      if (!bot?.enabled || bot.archived) continue;
      errers ??= latestErrorBotIds();
      if (isBlocked(trigger.bot_id, errers)) continue;
      inject(bot, trigger.message, "continuous");
    } else {
      updateTrigger(trigger.id, { next_run_at: nextRunAt(trigger.schedule) });
      if (paused) continue;
      const bot = getBot(trigger.bot_id);
      if (!bot?.enabled || bot.archived) continue;
      inject(bot, trigger.message, "schedule");
    }
  }
  evaluateWatchdogs(Date.now());
  void runDailySkillChecks().catch(() => undefined);
}

export function startScheduler(tickMs = 15_000): void {
  timer = setInterval(runTick, tickMs);
  runTick();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
