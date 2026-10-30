import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchCommand, SearchRenderRow } from "../lib/search.ts";

const SEARCH_LABELS: Record<SearchEntityType, string> = {
  bots: "Bots",
  archived_bots: "Archived bots",
  roles: "Roles",
  skills: "Skills",
  projects: "Projects",
  tags: "Tags",
  teams: "Teams",
  templates: "Templates",
};

export const ENTITY_TABS: Record<PendingEntityEditType, Tab> = {
  roles: "roles",
  skills: "skills",
  projects: "projects",
  tags: "tags",
  teams: "teams",
  templates: "templates",
};

import { StatusDot } from "../components/Avatar.tsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { TAB_PATHS } from "../hooks/useTabRoute.ts";
import { api } from "../lib/api.ts";
import { titleCase } from "../lib/format.ts";
import type {
  Bot,
  PendingEntityEditType,
  Run,
  SearchEntityType,
  SearchGroupResponse,
  SearchMatch,
  Tab,
} from "../types.ts";
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  try {
    const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
    return (
      <>
        {parts.map((part, index) =>
          part.toLowerCase() === q.toLowerCase() ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: split fragments are positional and immutable per render
            <mark key={index}>{part}</mark>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: split fragments are positional and immutable per render
            part
          ),
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

export function SearchOverlay({
  bots,
  paused,
  onClose,
  onOpenEntity,
  onNavigate,
  onNewBot,
  onChanged,
  onRunStateChange,
}: {
  bots: Bot[];
  paused: boolean;
  onClose: () => void;
  onOpenEntity: (match: SearchMatch) => void;
  onNavigate: (tab: Tab) => void;
  onNewBot: () => void;
  onChanged: () => void;
  onRunStateChange?: (botId: string, run_state: "running" | "enabled") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const [query, setQuery] = useState("");
  const [searchGroups, setSearchGroups] = useState<SearchGroupResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [busyCommand, setBusyCommand] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<SearchCommand | null>(
    null,
  );
  const [selected, setSelected] = useState(0);

  const rawQuery = query.trim();
  const commandMode = rawQuery.startsWith(">");
  const commandText = commandMode ? rawQuery.slice(1).trim() : "";

  useEffect(() => {
    previousFocus.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      (previousFocus.current as HTMLElement | null)?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      if (pendingConfirm) {
        setPendingConfirm(null);
        return;
      }
      if (commandMode) {
        setQuery("");
        return;
      }
      if (!busyCommand) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busyCommand, commandMode, onClose, pendingConfirm]);

  useEffect(() => {
    setSelected(0);
    setInlineError(null);
    if (commandMode) setSearchGroups([]);
  }, [commandMode]);

  const commandActions = useMemo<SearchCommand[]>(() => {
    const sortedBots = [...bots].sort((a, b) => a.name.localeCompare(b.name));
    const botCommands: SearchCommand[] = sortedBots.flatMap((bot) => {
      const running = bot.run_state === "running";
      const unavailableReason = bot.archived
        ? "Bot archived"
        : !bot.enabled
          ? "Bot disabled"
          : undefined;
      return [
        {
          id: `run-${bot.id}`,
          label: `Run ${bot.name}`,
          group: "Bot actions" as const,
          bot,
          disabledReason: unavailableReason,
          run: async () => {
            const result = await api<{ runId: string | null }>(
              `/api/bots/${bot.id}/run`,
              { method: "POST" },
            );
            if (result.runId) onRunStateChange?.(bot.id, "running");
          },
        },
        {
          id: `stop-${bot.id}`,
          label: `Stop ${bot.name}`,
          group: "Bot actions" as const,
          bot,
          disabledReason: running ? undefined : "Not running",
          run: async () => {
            await api(`/api/bots/${bot.id}/interrupt`, { method: "POST" });
            onRunStateChange?.(bot.id, "enabled");
          },
        },
        {
          id: `enable-${bot.id}`,
          label: `Enable ${bot.name}`,
          group: "Bot actions" as const,
          bot,
          disabledReason:
            unavailableReason ?? (bot.enabled ? "Already enabled" : undefined),
          run: async () => {
            await api(`/api/bots/${bot.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ enabled: true }),
            });
          },
        },
        {
          id: `disable-${bot.id}`,
          label: `Disable ${bot.name}`,
          group: "Bot actions" as const,
          bot,
          disabledReason: unavailableReason ? "Already disabled" : undefined,
          run: async () => {
            await api(`/api/bots/${bot.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ enabled: false }),
            });
          },
        },
      ];
    });

    const runningCount = sortedBots.filter(
      (bot) => bot.run_state === "running",
    ).length;
    return [
      ...botCommands,
      {
        id: "pause-all",
        label: "Pause all",
        group: "All bots" as const,
        disabledReason: paused ? "Already paused" : undefined,
        confirm: {
          text: "Pause every bot? Nothing new starts until you resume.",
          label: "Pause all",
        },
        run: async () => {
          await api("/api/pause", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ paused: true }),
          });
        },
      },
      {
        id: "resume-all",
        label: "Resume all",
        group: "All bots" as const,
        disabledReason: paused ? undefined : "Not paused",
        run: async () => {
          await api("/api/pause", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ paused: false }),
          });
        },
      },
      {
        id: "stop-all",
        label: "Stop all",
        group: "All bots" as const,
        confirm: {
          text: `Stop every running bot and pause all bots? ${runningCount} in flight; nothing resumes on its own.`,
          label: "Stop all",
        },
        run: async () => {
          await api("/api/stop-all", { method: "POST" });
          for (const bot of sortedBots) {
            if (bot.run_state === "running")
              onRunStateChange?.(bot.id, "enabled");
          }
        },
      },
      {
        id: "new-bot",
        label: "New bot",
        group: "Navigation" as const,
        run: async () => {
          onNavigate("bots");
          onNewBot();
        },
      },
      ...(Object.keys(TAB_PATHS) as Tab[]).map((tab) => ({
        id: `open-${tab}`,
        label: `Open ${titleCase(tab)}`,
        group: "Navigation" as const,
        run: async () => {
          onNavigate(tab);
        },
      })),
    ];
  }, [bots, paused, onNavigate, onNewBot, onRunStateChange]);

  useEffect(() => {
    if (commandMode) return;
    if (rawQuery.length < 2) {
      setLoading(false);
      setSearchGroups([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<{ groups: SearchGroupResponse[] }>(
        `/api/search?q=${encodeURIComponent(rawQuery)}`,
        { signal: controller.signal },
      )
        .then((result) => setSearchGroups(result.groups ?? []))
        .catch((error: unknown) => {
          if ((error as { name?: string }).name !== "AbortError")
            setInlineError(
              error instanceof Error ? error.message : String(error),
            );
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [commandMode, rawQuery]);

  async function executeCommand(command: SearchCommand): Promise<void> {
    setBusyCommand(true);
    try {
      await command.run();
      onChanged();
      onClose();
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyCommand(false);
    }
  }

  async function runRow(row: SearchRenderRow): Promise<void> {
    if (row.kind === "search") {
      if (row.match) onOpenEntity(row.match);
      return;
    }
    const command = row.action;
    if (!command || command.disabledReason) return;
    if (command.confirm) {
      setPendingConfirm(command);
      return;
    }
    await executeCommand(command);
  }

  function moveSelection(delta: number): void {
    if (!selectableRows.length) return;
    setSelected(
      (current) =>
        (((current + delta) % selectableRows.length) + selectableRows.length) %
        selectableRows.length,
    );
  }

  function moveGroup(delta: number): void {
    const current = renderGroups.findIndex((group) =>
      group.rows.some((row) => row.selectedIndex === selected),
    );
    if (current < 0 || !renderGroups.length) return;
    for (let offset = 1; offset <= renderGroups.length; offset++) {
      const group =
        renderGroups[
          (current + delta * offset + renderGroups.length * 2) %
            renderGroups.length
        ];
      const first = group.rows.find((row) => row.selectedIndex !== null);
      if (first?.selectedIndex != null) {
        setSelected(first.selectedIndex);
        return;
      }
    }
  }

  const renderGroups = useMemo<
    {
      label: string;
      extra: number;
      rows: SearchRenderRow[];
    }[]
  >(() => {
    let nextIndex = 0;
    if (commandMode) {
      const order: SearchCommand["group"][] = [
        "Bot actions",
        "All bots",
        "Navigation",
      ];
      return order
        .map((label) => ({
          label,
          extra: 0,
          rows: commandActions
            .filter(
              (action) =>
                action.group === label &&
                (!commandText ||
                  action.label.toLowerCase().includes(commandText)),
            )
            .map((action) => {
              const selectedIndex = action.disabledReason ? null : nextIndex++;
              return {
                key: action.id,
                kind: "command" as const,
                action,
                selectedIndex,
              };
            }),
        }))
        .filter((group) => group.rows.length > 0);
    }

    return searchGroups
      .filter((group) => group.matches.length > 0)
      .map((group) => ({
        label: SEARCH_LABELS[group.type],
        extra: Math.max(0, group.total - group.matches.length),
        rows: group.matches.map((match) => {
          const selectedIndex = nextIndex++;
          return {
            key: `${match.type}:${match.id}`,
            kind: "search" as const,
            match,
            selectedIndex,
          };
        }),
      }));
  }, [commandMode, commandActions, commandText, searchGroups]);

  const selectableRows = useMemo(
    () =>
      renderGroups.flatMap((group) =>
        group.rows.filter((row) => row.selectedIndex !== null),
      ),
    [renderGroups],
  );

  useEffect(() => {
    if (selected >= selectableRows.length) setSelected(0);
  }, [selectableRows.length, selected]);

  function renderBody() {
    if (inlineError && !commandMode && rawQuery.length < 2) return null;
    if (!commandMode) {
      if (loading) return <p className="muted">Searching…</p>;
      if (rawQuery.length < 2)
        return (
          <p className="muted searchempty">
            Type at least two characters to search.
          </p>
        );
    }
    if (renderGroups.length === 0) {
      return (
        <p className="muted searchempty">
          {commandMode ? "No commands match." : "No results."}
        </p>
      );
    }

    return renderGroups.map((group) => (
      <section className="searchgroup" key={group.label}>
        <div className="searchgrouplabel">
          <span>{group.label}</span>
          {group.extra > 0 && <em>+{group.extra} more</em>}
        </div>
        {group.rows.map((row) => {
          const isSelected =
            row.selectedIndex !== null && row.selectedIndex === selected;
          const disabled = Boolean(row.action?.disabledReason);
          return (
            <button
              key={row.key}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`searchrow${isSelected ? " selected" : ""}`}
              disabled={disabled || busyCommand}
              tabIndex={-1}
              onClick={() => void runRow(row)}
            >
              {row.kind === "search" && row.match ? (
                <span className="searchrowcontent">
                  <strong>
                    <Highlighted text={row.match.name} query={rawQuery} />
                  </strong>
                  {row.match.subtitle && (
                    <em title={row.match.subtitle}>
                      <Highlighted text={row.match.subtitle} query={rawQuery} />
                    </em>
                  )}
                </span>
              ) : row.action ? (
                <span className="searchrowcontent">
                  {row.action.bot && (
                    <StatusDot
                      id={row.action.bot.id}
                      health={row.action.bot.health}
                      active={row.action.bot.run_state === "running"}
                    />
                  )}
                  <span>
                    <Highlighted text={row.action.label} query={commandText} />
                    {row.action.disabledReason && (
                      <small className="muted">
                        {" "}
                        — {row.action.disabledReason}
                      </small>
                    )}
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </section>
    ));
  }

  return (
    <div
      className="modal searchoverlay"
      role="dialog"
      aria-label="Search"
      onKeyDown={(event) => {
        if (pendingConfirm || busyCommand) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveSelection(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveSelection(-1);
        } else if (event.key === "Tab") {
          event.preventDefault();
          moveGroup(event.shiftKey ? -1 : 1);
        } else if (event.key === "Enter") {
          event.preventDefault();
          const row = selectableRows[selected];
          if (row) void runRow(row);
        }
      }}
    >
      <button
        type="button"
        className="mscrim"
        aria-label="Close search"
        onClick={() => {
          if (!pendingConfirm && !busyCommand) onClose();
        }}
      />
      <div className="searchpanel">
        <input
          ref={inputRef}
          value={query}
          aria-label="Search or enter a command"
          placeholder='Search records, or type ">" for commands'
          onChange={(event) => {
            const next = event.target.value.trim();
            setQuery(event.target.value);
            setLoading(!next.startsWith(">") && next.length >= 2);
          }}
        />
        {inlineError && <p className="error">{inlineError}</p>}
        <div className="searchresults" role="listbox">
          {renderBody()}
        </div>
        <p className="searchhint muted">
          ↑↓ select · Tab group · Enter run · Esc close
        </p>
      </div>
      {pendingConfirm && (
        <ConfirmDialog
          text={pendingConfirm.confirm?.text ?? ""}
          confirmLabel={pendingConfirm.confirm?.label ?? "Run command"}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            const command = pendingConfirm;
            setPendingConfirm(null);
            if (command) void executeCommand(command);
          }}
        />
      )}
    </div>
  );
}
