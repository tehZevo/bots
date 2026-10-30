import { fmtTokens } from "../lib/format.ts";
import { STATUS_CHIPS } from "../lib/health.ts";
import type { Bot, Breaker } from "../types.ts";
import { BellIcon, PauseIcon, SearchIcon, StopIcon } from "./icons/index.ts";

export function StatusBar({
  bots,
  paused,
  pauseReason,
  breaker,
  onPauseToggle,
  onStopAll,
  onSearch,
  inboxCount = 0,
  onOpenInbox,
}: {
  bots: Bot[];
  paused: boolean;
  pauseReason: string | null;
  breaker: Breaker | null;
  onPauseToggle: () => void;
  onStopAll: () => void;
  onSearch: () => void;
  inboxCount?: number;
  onOpenInbox: () => void;
}) {
  const statusCounts = bots.reduce(
    (counts, bot) => {
      counts[bot.health] += 1;
      return counts;
    },
    { green: 0, blue: 0, yellow: 0, red: 0, gray: 0 } as Record<
      Bot["health"],
      number
    >,
  );
  const runningCount = bots.filter((b) => b.run_state === "running").length;
  return (
    <header className="statusbar">
      <div className="statuschips" role="status">
        {runningCount > 0 && (
          <span className="statuschip running">
            <i className="dot blue pulse" />
            <strong>{runningCount}</strong> running
          </span>
        )}
        {STATUS_CHIPS.map(({ health, label }) => {
          const count = statusCounts[health];
          if (!count) return null;
          return (
            <span key={health} className={`statuschip ${health}`}>
              <i className={`dot ${health}`} />
              <strong>{count}</strong> {label}
            </span>
          );
        })}
        {paused && (
          <span
            className="statuschip paused"
            title={
              pauseReason === "breaker" && breaker
                ? `over spend cap (${fmtTokens(breaker.tokens_30d)} / ${fmtTokens(breaker.limit_tokens)})`
                : undefined
            }
          >
            <PauseIcon size={14} /> paused
          </span>
        )}
      </div>
      <div className="statusactions">
        <button
          type="button"
          className={`pausetoggle${paused ? " on" : ""}`}
          aria-label={paused ? "Resume all bots" : "Pause all bots"}
          title={
            paused && pauseReason === "breaker" && breaker
              ? `Trailing 30-day usage of ${breaker.tokens_30d.toLocaleString()} tokens is over the cap of ${breaker.limit_tokens.toLocaleString()} — raise or clear it in Settings to resume`
              : paused
                ? "Resume all bots"
                : "Pause all bots"
          }
          onClick={onPauseToggle}
        >
          <PauseIcon size={15} />
          <span className="actionlabel">{paused ? "Resume" : "Pause"}</span>
        </button>
        <button
          type="button"
          className="stopall"
          aria-label="Stop all bots"
          title="Interrupt every running bot and pause everything (panic button)"
          onClick={onStopAll}
        >
          <StopIcon size={15} />
          <span className="actionlabel">Stop all</span>
        </button>
        <button
          type="button"
          className="searchtoggle"
          aria-label="Open search"
          title="Search records or run commands (backtick)"
          onClick={onSearch}
        >
          <SearchIcon size={15} />
          <span className="actionlabel">Search</span>
          <kbd className="searchshortcut" aria-hidden="true">
            `
          </kbd>
        </button>
        <button
          type="button"
          className="notiftoggle"
          aria-label={`Inbox${inboxCount ? `, ${inboxCount} ${inboxCount === 1 ? "item" : "items"}` : ""}`}
          title={
            inboxCount
              ? `${inboxCount} ${inboxCount === 1 ? "item" : "items"} ${inboxCount === 1 ? "needs" : "need"} attention`
              : "Inbox"
          }
          onClick={onOpenInbox}
        >
          <BellIcon size={18} />
          {inboxCount > 0 && (
            <span className="notifbadge">
              {inboxCount > 99 ? "99+" : inboxCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
