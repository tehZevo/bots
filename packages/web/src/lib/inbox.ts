import { fmt, relTime } from "./format.ts";

export type InboxKind =
  | "run_error"
  | "blocked"
  | "watchdog"
  | "breaker"
  | "notification";

export interface InboxItem {
  id: string;
  kind: InboxKind;
  bot_id: string | null;
  bot_name: string | null;
  title: string;
  detail: string;
  target_path: string | null;
  created_at: number;
  notification_id?: string | null;
  read?: number | null;
}

export const INBOX_KIND_LABELS: Record<InboxKind, string> = {
  run_error: "Run failed",
  blocked: "Blocked",
  watchdog: "Watchdog",
  breaker: "Spend cap",
  notification: "Notification",
};

export function filterInboxItems(
  items: InboxItem[],
  kinds: InboxKind[],
  botIds: string[],
): InboxItem[] {
  return items.filter(
    (item) =>
      (kinds.length === 0 || kinds.includes(item.kind)) &&
      (botIds.length === 0 ||
        (item.bot_id !== null && botIds.includes(item.bot_id))),
  );
}

export function inboxTimeLabel(ts: number, now = Date.now()): string {
  const date = new Date(ts);
  const today = new Date(now);
  return date.toDateString() === today.toDateString() ? relTime(ts) : fmt(ts);
}
