import type { Bot } from "../types.ts";

export const HEALTH_LABEL: Record<Bot["health"], string> = {
  green: "active",
  blue: "idle",
  yellow: "issues",
  red: "blocked",
  gray: "disabled",
};

// Display order for status chips and the bots status filter.
export const HEALTH_ORDER: Bot["health"][] = [
  "green",
  "blue",
  "yellow",
  "red",
  "gray",
];

export const STATUS_CHIPS: { health: Bot["health"]; label: string }[] =
  HEALTH_ORDER.map((health) => ({ health, label: HEALTH_LABEL[health] }));

// Worst-first precedence used to roll member health up into a team badge.
const TEAM_HEALTH_PRECEDENCE = ["red", "yellow", "green", "blue"] as const;

export function teamHealth(
  members: { bot_id: string }[],
  bots: Bot[],
): Bot["health"] {
  const hs = members
    .map((m) => bots.find((b) => b.id === m.bot_id)?.health)
    .filter(Boolean) as Bot["health"][];
  for (const h of TEAM_HEALTH_PRECEDENCE) if (hs.includes(h)) return h;
  return "gray";
}
