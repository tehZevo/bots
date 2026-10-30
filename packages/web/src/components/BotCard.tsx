import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Avatar, StatusDot } from "../components/Avatar.tsx";
import { KebabIcon, SpinnerIcon } from "../components/icons/index.ts";
import { relTime } from "../lib/format.ts";
import { HEALTH_LABEL } from "../lib/health.ts";
import { type Bot, Run } from "../types.ts";
export function BotCard({
  bot,
  poking,
  paused = false,
  onChat,
  onRun,
  onStop,
  onSettings,
  onClearMemory,
  onDelete,
}: {
  bot: Bot;
  poking: boolean;
  paused?: boolean;
  onChat: () => void;
  onRun: () => void;
  onStop: () => void;
  onSettings: () => void;
  onClearMemory: () => void;
  onDelete: () => void;
}) {
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [quickMenuFocus, setQuickMenuFocus] = useState(0);
  const [quickPos, setQuickPos] = useState<{
    left: number;
    top: number;
    maxHeight: number;
  } | null>(null);
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const quickPanelRef = useRef<HTMLDivElement>(null);
  const quickTriggerRef = useRef<HTMLButtonElement>(null);
  const quickItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const closeQuickMenu = useCallback((refocus = true) => {
    setQuickMenuOpen(false);
    if (refocus) quickTriggerRef.current?.focus();
  }, []);

  const positionPanel = useCallback(() => {
    const rect = quickTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setQuickPos({
      left: Math.max(8, Math.min(rect.right - 4, window.innerWidth - 168)),
      top: rect.bottom + 6,
      maxHeight: Math.max(160, window.innerHeight - rect.bottom - 16),
    });
  }, []);

  const unavailable = !bot.enabled || Boolean(bot.archived);
  const quickActions: { label: string; run: () => void; disabled?: boolean }[] =
    [
      { label: "Open chat", run: onChat, disabled: unavailable },
      { label: "Run now", run: onRun, disabled: unavailable || paused },
      ...(bot.run_state === "running" ? [{ label: "Stop", run: onStop }] : []),
      { label: "Settings", run: onSettings },
      { label: "Clear memory", run: onClearMemory },
      { label: "Delete", run: onDelete, disabled: unavailable },
    ];

  useEffect(() => {
    if (!quickMenuOpen) return;
    quickItemRefs.current[quickMenuFocus]?.focus();
  }, [quickMenuOpen, quickMenuFocus]);

  useEffect(() => {
    if (!quickMenuOpen) return;
    positionPanel();
    window.addEventListener("scroll", positionPanel, true);
    window.addEventListener("resize", positionPanel);
    return () => {
      window.removeEventListener("scroll", positionPanel, true);
      window.removeEventListener("resize", positionPanel);
    };
  }, [quickMenuOpen, positionPanel]);

  useEffect(() => {
    if (!quickMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        !quickMenuRef.current?.contains(t) &&
        !quickPanelRef.current?.contains(t)
      )
        closeQuickMenu(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [quickMenuOpen, closeQuickMenu]);

  const moveQuickFocus = (delta: number) => {
    setQuickMenuFocus((i) => {
      const n = quickActions.length;
      return (((i + delta) % n) + n) % n;
    });
  };

  return (
    <div className="cardwrap">
      <button
        type="button"
        className={`card${bot.archived ? " archived" : ""}`}
        data-bot-card={bot.id}
        aria-label={`${bot.name} (${bot.status})`}
        onClick={() => onChat()}
      >
        <span className="cardhead">
          <Avatar
            name={bot.name}
            id={bot.id}
            shape={bot.avatar_shape}
            color={bot.avatar_color}
            health={bot.health}
          />
          <span className="cardtext">
            <strong title={bot.name}>{bot.name}</strong>
            {bot.archived ? (
              <span className="archivebadge">Archived</span>
            ) : null}
            {bot.role_name ? (
              <em className="cardrole" title={bot.role_name}>
                ({bot.role_name})
              </em>
            ) : null}
          </span>
        </span>
        {bot.current_task && !bot.status && (
          <span className="taskline" title={bot.current_task}>
            {bot.current_task}
            {bot.current_task_updated_at && (
              <em> · {relTime(bot.current_task_updated_at)}</em>
            )}
          </span>
        )}
        {bot.status ? (
          <>
            {bot.current_task && (
              <span className="taskline" title={bot.current_task}>
                {bot.current_task}
              </span>
            )}
            <span className="statline" title={bot.status}>
              {bot.status}
              {bot.current_task_updated_at && (
                <em> · {relTime(bot.current_task_updated_at)}</em>
              )}
            </span>
          </>
        ) : null}
      </button>
      <div className="quickhead" ref={quickMenuRef}>
        <button
          type="button"
          ref={quickTriggerRef}
          className={`quickbtn${quickMenuOpen ? " open" : ""}`}
          aria-label={`Quick menu for ${bot.name}`}
          title="Quick menu"
          aria-haspopup="menu"
          aria-expanded={quickMenuOpen}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setQuickMenuFocus(0);
            setQuickMenuOpen((o) => !o);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.preventDefault();
            if (e.key === "ArrowDown" && !quickMenuOpen) {
              e.preventDefault();
              e.stopPropagation();
              setQuickMenuFocus(0);
              setQuickMenuOpen(true);
            }
          }}
        >
          <KebabIcon size={14} />
        </button>
        <StatusDot
          id={bot.id}
          health={bot.health}
          label={HEALTH_LABEL[bot.health]}
          active={bot.run_state === "running"}
        />
      </div>
      {quickMenuOpen && quickPos
        ? createPortal(
            <div
              className="quickpanel"
              ref={quickPanelRef}
              role="menu"
              aria-label={`Actions for ${bot.name}`}
              style={
                {
                  left: quickPos.left,
                  top: quickPos.top,
                  maxHeight: quickPos.maxHeight,
                } as CSSProperties
              }
            >
              {quickActions.map((a, i) => (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  ref={(el) => {
                    quickItemRefs.current[i] = el;
                  }}
                  disabled={a.disabled}
                  onClick={() => {
                    closeQuickMenu();
                    a.run();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      moveQuickFocus(1);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      moveQuickFocus(-1);
                    } else if (e.key === "Home") {
                      e.preventDefault();
                      setQuickMenuFocus(0);
                    } else if (e.key === "End") {
                      e.preventDefault();
                      setQuickMenuFocus(quickActions.length - 1);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      closeQuickMenu();
                    }
                  }}
                >
                  {a.label === "Run now" && poking ? (
                    <SpinnerIcon size={14} />
                  ) : (
                    a.label
                  )}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
