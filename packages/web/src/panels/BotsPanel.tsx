import { useMemo, useState } from "react";
import { BotCard } from "../components/BotCard.tsx";
import { FilterBar } from "../components/FilterBar.tsx";
import { filterBots } from "../lib/filterBots.ts";
import type { Bot, Role, Tag } from "../types.ts";

export function BotsPanel({
  bots,
  roles,
  tags,
  paused,
  poking,
  includeArchived,
  onIncludeArchivedChange,
  onAddBot,
  onChat,
  onRun,
  onStop,
  onSettings,
  onQuickAction,
}: {
  bots: Bot[];
  roles: Role[];
  tags: Tag[];
  paused: boolean;
  poking: Record<string, boolean>;
  includeArchived: boolean;
  onIncludeArchivedChange: (v: boolean) => void;
  onAddBot: () => void;
  onChat: (bot: Bot) => void;
  onRun: (bot: Bot) => void;
  onStop: (bot: Bot) => void;
  onSettings: (bot: Bot) => void;
  onQuickAction: (bot: Bot, action: "clear" | "delete") => void;
}) {
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Bot["health"][]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const visibleBots = useMemo(
    () => filterBots(bots, { query, statuses, roleIds, tagIds }),
    [bots, query, statuses, roleIds, tagIds],
  );
  return (
    <>
      <div className="mainhead">
        <h2>Bots</h2>
        <button type="button" onClick={onAddBot}>
          Add bot
        </button>
      </div>
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        statuses={statuses}
        onStatusesChange={setStatuses}
        roles={roles}
        roleIds={roleIds}
        onRoleIdsChange={setRoleIds}
        tags={tags}
        tagIds={tagIds}
        onTagIdsChange={setTagIds}
        includeArchived={includeArchived}
        onIncludeArchivedChange={onIncludeArchivedChange}
      />
      <div className="cards">
        {visibleBots.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            poking={!!poking[bot.id]}
            paused={paused}
            onChat={() => onChat(bot)}
            onRun={() => onRun(bot)}
            onStop={() => onStop(bot)}
            onSettings={() => onSettings(bot)}
            onClearMemory={() => onQuickAction(bot, "clear")}
            onDelete={() => onQuickAction(bot, "delete")}
          />
        ))}
      </div>
      {bots.length === 0 && <p>No bots yet — press "Add bot".</p>}
      {bots.length > 0 && visibleBots.length === 0 && (
        <p className="muted">No bots match the current filters.</p>
      )}
    </>
  );
}
