import { TAB_PATHS, tabFromPath } from "../hooks/useTabRoute.ts";
import type { BotModalTab, NotificationItem, RouteSnapshot } from "../types.ts";

export const BOT_MODAL_TABS: readonly string[] = [
  "general",
  "triggers",
  "logs",
  "stats",
  "files",
];

export function routeFromUrl(url: URL): RouteSnapshot {
  const tab = tabFromPath(url.pathname);
  let chatBotId: string | null = null;
  let openBotId: string | null = null;
  let detailOpen = false;
  let modalTab: BotModalTab = "general";
  let replayRunId: string | null = null;
  if (tab === "bots") {
    chatBotId = url.searchParams.get("bot");
    const openParam = url.searchParams.get("open");
    const runParam = url.searchParams.get("run");
    const modalParam = url.searchParams.get("mtab");
    replayRunId = runParam;
    if (modalParam && BOT_MODAL_TABS.includes(modalParam)) {
      modalTab = modalParam as BotModalTab;
    }
    if (runParam) {
      openBotId = openParam ?? chatBotId;
      detailOpen = Boolean(openBotId);
      modalTab = "logs";
    } else if (openParam) {
      openBotId = openParam;
      detailOpen = true;
    }
  }
  return { tab, chatBotId, detailOpen, openBotId, modalTab, replayRunId };
}

export function routeFromLocation(): RouteSnapshot {
  if (typeof location === "undefined") {
    return {
      tab: "bots",
      chatBotId: null,
      detailOpen: false,
      openBotId: null,
      modalTab: "general",
      replayRunId: null,
    };
  }
  return routeFromUrl(new URL(location.href));
}

export function routeHref(route: RouteSnapshot): string {
  if (route.tab === "settings" && typeof location !== "undefined") {
    return `${location.pathname}${location.search}`;
  }
  const base = TAB_PATHS[route.tab];
  if (route.tab !== "bots") return base;
  const params = new URLSearchParams();
  if (route.chatBotId) params.set("bot", route.chatBotId);
  if (route.replayRunId && route.openBotId) {
    params.set("run", route.replayRunId);
  } else if (route.detailOpen && route.openBotId) {
    params.set("open", route.openBotId);
    if (route.modalTab !== "general") params.set("mtab", route.modalTab);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function notificationTargetPathFor(
  item: NotificationItem,
): string | null {
  if (item.target_path) return item.target_path;
  if (item.kind === "breaker") return "/settings?tab=system";
  if (!item.bot_id) return null;
  const chat = `/bots?bot=${encodeURIComponent(item.bot_id)}`;
  if (
    item.kind === "run_error" ||
    item.kind === "watchdog" ||
    item.kind === "blocked" ||
    item.kind === "recovered"
  ) {
    return item.run_id
      ? `${chat}&run=${encodeURIComponent(item.run_id)}`
      : chat;
  }
  return null;
}
