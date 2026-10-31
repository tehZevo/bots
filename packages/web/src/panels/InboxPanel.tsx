import { useState } from "react";
import { BellIcon } from "../components/icons/BellIcon.tsx";
import { toggleIn } from "../lib/filterBots.ts";
import {
  filterInboxItems,
  INBOX_KIND_LABELS,
  type InboxItem,
  type InboxKind,
  inboxTimeLabel,
} from "../lib/inbox.ts";

function InboxKindIcon({ kind }: { kind: InboxKind }) {
  const shared = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "watchdog")
    return (
      <svg {...shared}>
        <circle cx="12" cy="13" r="8" />
        <polyline points="12 9 12 13 15 15" />
        <path d="M9 3h6" />
      </svg>
    );
  if (kind === "breaker")
    return (
      <svg {...shared}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    );
  if (kind === "notification") return <BellIcon size={18} />;
  return (
    <svg {...shared}>
      <path d="M12 9v4" />
      <path d="M10.37 3.65 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.63 3.65a2 2 0 0 0-3.26 0Z" />
      <circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function InboxPanel({
  items,
  unreadCount,
  lastResolvedAt,
  onOpenItem,
  onMarkRead,
  onMarkAllRead,
}: {
  items: InboxItem[];
  unreadCount: number;
  lastResolvedAt: number | null;
  onOpenItem: (item: InboxItem) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const [kindSel, setKindSel] = useState<InboxKind[]>([]);
  const [botSel, setBotSel] = useState<string[]>([]);
  const visible = filterInboxItems(items, kindSel, botSel);
  const inboxBots = [...new Map(items.map((i) => [i.bot_id, i.bot_name]))]
    .filter(([id]) => id !== null)
    .sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? "")) as [
    string,
    string,
  ][];

  return (
    <>
      <div className="mainhead">
        <h2>Inbox</h2>
        <button
          type="button"
          disabled={unreadCount === 0}
          onClick={() => onMarkAllRead()}
        >
          Mark all read
        </button>
      </div>
      <div className="filterrow">
        <details className="filterdd">
          <summary
            aria-label={`Kind filter: ${kindSel.length === 0 ? "All" : `${kindSel.length} selected`}`}
          >
            Kind:{" "}
            {kindSel.length === 0
              ? "All"
              : kindSel.map((k) => INBOX_KIND_LABELS[k]).join(", ")}
          </summary>
          <div className="filterpanel">
            {(Object.keys(INBOX_KIND_LABELS) as InboxKind[]).map((kind) => (
              <label key={kind} data-name={INBOX_KIND_LABELS[kind]}>
                <input
                  type="checkbox"
                  checked={kindSel.includes(kind)}
                  onChange={() => setKindSel((v) => toggleIn(v, kind))}
                />{" "}
                {INBOX_KIND_LABELS[kind]}
              </label>
            ))}
          </div>
        </details>
        <details className="filterdd">
          <summary
            aria-label={`Bot filter: ${botSel.length === 0 ? "All" : `${botSel.length} selected`}`}
          >
            Bot:{" "}
            {botSel.length === 0
              ? "All"
              : botSel
                  .map(
                    (id) =>
                      inboxBots.find(([botId]) => botId === id)?.[1] ?? "?",
                  )
                  .join(", ")}
          </summary>
          <div className="filterpanel">
            {inboxBots.map(([id, name]) => (
              <label key={id} data-name={name}>
                <input
                  type="checkbox"
                  checked={botSel.includes(id)}
                  onChange={() => setBotSel((v) => toggleIn(v, id))}
                />{" "}
                {name ?? "?"}
              </label>
            ))}
          </div>
        </details>
      </div>
      {visible.length === 0 ? (
        <section className="inboxempty" aria-live="polite">
          <strong>All clear</strong>
          <span>
            Last resolved{" "}
            {lastResolvedAt ? inboxTimeLabel(lastResolvedAt) : "—"}
          </span>
        </section>
      ) : (
        <ul className="inboxlist" aria-label="Inbox items">
          {visible.map((item) => {
            const unread = Boolean(item.notification_id && !item.read);
            return (
              <li key={item.id} className={unread ? "unread" : ""}>
                <button
                  type="button"
                  className="inboxrow"
                  disabled={!item.target_path && !unread}
                  onClick={() => onOpenItem(item)}
                >
                  <span className={`inboxicon ${item.kind}`}>
                    <InboxKindIcon kind={item.kind} />
                  </span>
                  <span className="inboxcopy">
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </span>
                  <time dateTime={new Date(item.created_at).toISOString()}>
                    {inboxTimeLabel(item.created_at)}
                  </time>
                </button>
                {unread && (
                  <div className="notifactions">
                    <button
                      type="button"
                      onClick={() => onMarkRead(item.notification_id ?? "")}
                    >
                      Mark read
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
