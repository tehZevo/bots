import { useState } from "react";
import { ApprovalIcon } from "../components/icons/ApprovalIcon.tsx";
import { BellIcon } from "../components/icons/BellIcon.tsx";
import { Multiselect } from "../components/Multiselect.tsx";
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
  if (kind === "approval") return <ApprovalIcon size={18} />;
  if (kind === "question")
    return (
      <svg {...shared} aria-hidden>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
        <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.3" />
        <circle cx="12" cy="16.8" r=".8" fill="currentColor" stroke="none" />
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

function QuestionActions({
  item,
  onAnswer,
  onOpenChat,
}: {
  item: InboxItem;
  onAnswer: (id: string, answer: string) => void;
  onOpenChat: (botId: string) => void;
}) {
  const [other, setOther] = useState(false);
  const [text, setText] = useState("");
  const id = item.question_id as string;
  return (
    <div className="notifactions questionactions">
      {(item.question_options ?? []).map((option) => (
        <button key={option} type="button" onClick={() => onAnswer(id, option)}>
          {option}
        </button>
      ))}
      {item.question_allow_other && !other && (
        <button type="button" onClick={() => setOther(true)}>
          Other…
        </button>
      )}
      {item.question_allow_other && other && (
        <form
          className="questionother"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onAnswer(id, text.trim());
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type an answer"
            aria-label="Other answer"
          />
          <button type="submit" disabled={!text.trim()}>
            Send
          </button>
        </form>
      )}
      {item.bot_id && (
        <button
          type="button"
          className="questionchat"
          onClick={() => onOpenChat(item.bot_id as string)}
        >
          Chat
        </button>
      )}
    </div>
  );
}

export function InboxPanel({
  items,
  unreadCount,
  lastResolvedAt,
  onOpenItem,
  onMarkRead,
  onMarkAllRead,
  onDecideApproval,
  onAnswerQuestion,
  onOpenChat,
}: {
  items: InboxItem[];
  unreadCount: number;
  lastResolvedAt: number | null;
  onOpenItem: (item: InboxItem) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDecideApproval: (id: string, approve: boolean) => void;
  onAnswerQuestion: (id: string, answer: string) => void;
  onOpenChat: (botId: string) => void;
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
        <Multiselect
          label="Kind"
          options={(Object.keys(INBOX_KIND_LABELS) as InboxKind[]).map((k) => ({
            id: k,
            name: INBOX_KIND_LABELS[k],
          }))}
          selected={kindSel}
          onChange={setKindSel}
          filterable={false}
        />
        {inboxBots.length > 0 && (
          <Multiselect
            label="Bot"
            options={inboxBots.map(([id, name]) => ({
              id,
              name: name ?? "?",
            }))}
            selected={botSel}
            onChange={setBotSel}
            placeholder="Search bots"
          />
        )}
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
                {item.question_id && (
                  <QuestionActions
                    item={item}
                    onAnswer={onAnswerQuestion}
                    onOpenChat={onOpenChat}
                  />
                )}
                {(unread || item.approval_id) && (
                  <div className="notifactions">
                    {item.approval_id && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onDecideApproval(item.approval_id as string, false)
                          }
                        >
                          Deny
                        </button>
                        <button
                          type="button"
                          className="primary"
                          onClick={() =>
                            onDecideApproval(item.approval_id as string, true)
                          }
                        >
                          Approve
                        </button>
                      </>
                    )}
                    {unread && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(item.notification_id ?? "")}
                      >
                        Mark read
                      </button>
                    )}
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
