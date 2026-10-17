import { CronExpressionParser } from "cron-parser";
import { injectMessage } from "./agent.ts";
import { dueTriggers, getBot, updateTrigger } from "./db.ts";

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

export function startScheduler(tickMs = 15_000): void {
  const tick = () => {
    for (const trigger of dueTriggers(Date.now())) {
      updateTrigger(trigger.id, { next_run_at: nextRunAt(trigger.schedule) });
      const bot = getBot(trigger.bot_id);
      if (!bot || !bot.enabled) continue;
      injectMessage(bot, trigger.message, "schedule");
    }
  };
  timer = setInterval(tick, tickMs);
  tick();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
