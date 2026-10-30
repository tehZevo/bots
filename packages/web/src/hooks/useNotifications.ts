import { useCallback, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { playSound } from "../lib/sound.ts";
import type { NotificationItem, NotificationsResponse } from "../types.ts";
import { usePolling } from "./usePolling.ts";

export interface UseNotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markOne: (id: string) => Promise<void>;
  markAll: () => Promise<void>;
}

// Owns the notification feed: polling, seen-id detection with first-load
// silence, the owner-bot sound chime (when `bots-sounds` is on), and unread
// bookkeeping through the mark actions.
export function useNotifications(
  options: {
    getSound?: (botId: string | null) => string;
    onError?: (err: unknown) => void;
  } = {},
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const seenIds = useRef<Set<string> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const fail = useCallback((err: unknown) => {
    optionsRef.current.onError?.(err);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<NotificationsResponse>("/api/notifications");
      const prevSeen = seenIds.current;
      if (localStorage.getItem("bots-sounds") === "on" && prevSeen) {
        const fresh = data.items.filter((n) => !prevSeen.has(n.id));
        if (fresh.length > 0) {
          const sound = optionsRef.current.getSound?.(fresh[0].bot_id ?? null);
          playSound(sound ?? "default");
        }
      }
      seenIds.current = new Set(data.items.map((n) => n.id));
      setNotifications(data.items);
      setUnreadCount(data.unread_count);
    } catch (err) {
      fail(err);
    }
  }, [fail]);

  const markOne = useCallback(
    async (id: string): Promise<void> => {
      try {
        await api(`/api/notifications/${id}/read`, { method: "POST" });
        setNotifications((items) =>
          items.map((item) => (item.id === id ? { ...item, read: 1 } : item)),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch (err) {
        fail(err);
      }
    },
    [fail],
  );

  const markAll = useCallback(async (): Promise<void> => {
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      setNotifications((items) => items.map((item) => ({ ...item, read: 1 })));
      setUnreadCount(0);
    } catch (err) {
      fail(err);
    }
  }, [fail]);

  usePolling(refresh, 5000);

  return { notifications, unreadCount, refresh, markOne, markAll };
}
