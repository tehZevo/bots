import type { Bot } from "../types.ts";

export interface BotFilters {
  query: string;
  statuses: string[];
  roleIds: string[];
  tagIds?: string[];
}

// Pure bots-list filter: case-insensitive name substring, plus status/role/tag
// inclusion where an empty selection means "all". Role-less bots match the ""
// role id.
export function filterBots(bots: Bot[], f: BotFilters): Bot[] {
  const q = f.query.trim().toLowerCase();
  return bots.filter(
    (bot) =>
      (f.statuses.length === 0 || f.statuses.includes(bot.health)) &&
      (f.roleIds.length === 0 || f.roleIds.includes(bot.role_id ?? "")) &&
      (!f.tagIds ||
        f.tagIds.length === 0 ||
        (bot.tag_ids ?? []).some((t) => f.tagIds?.includes(t))) &&
      (!q || bot.name.toLowerCase().includes(q)),
  );
}

export function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}
