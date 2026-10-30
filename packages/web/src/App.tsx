import {
  type CSSProperties,
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PasswordSettings, SessionSettings } from "./auth.tsx";
import { AddBotModal } from "./components/AddBotModal.tsx";
import { BotCard } from "./components/BotCard.tsx";
import { BotFiles } from "./components/botTabs/BotFiles.tsx";
import { BotGeneral } from "./components/botTabs/BotGeneral.tsx";
import { BotStats } from "./components/botTabs/BotStats.tsx";
import { ChatSidebar } from "./components/Chat.tsx";
import {
  BookIcon,
  BotIcon,
  CloseIcon,
  GearIcon,
  MachineIcon,
  PlugIcon,
  RoleIcon,
  TeamIcon,
  TemplateIcon,
} from "./components/icons/index.ts";
import { Nav } from "./components/Nav.tsx";
import { ReplayPanel } from "./components/ReplayPanel.tsx";
import { ENTITY_TABS, SearchOverlay } from "./components/SearchOverlay.tsx";
import { Triggers } from "./components/Triggers.tsx";
import { ConfirmDialog } from "./components/ui/ConfirmDialog.tsx";
import { Modal, ModalForm } from "./components/ui/Modal.tsx";
import { SwitchToggle } from "./components/ui/SwitchToggle.tsx";
import { TabNav } from "./components/ui/TabNav.tsx";
import { useEscape } from "./components/ui/useEscape.ts";
import { NavItem } from "./lib/nav.ts";
import {
  applyOptimisticRunStates,
  optimisticRunUpdate,
} from "./lib/runStates.ts";
import { ProjectsPanel } from "./panels/ProjectsPanel.tsx";
import { SecretsPanel } from "./panels/SecretsPanel.tsx";
import { SettingsPanel } from "./panels/settings/SettingsPanel.tsx";
import { TagsPanel } from "./panels/TagsPanel.tsx";

export * from "./components/icons/index.ts";

import { Avatar, StatusDot } from "./components/Avatar.tsx";
import { AvatarPicker } from "./components/AvatarPicker.tsx";

export { Avatar, ShapePreview, StatusDot } from "./components/Avatar.tsx";

import {
  anyDirtyLabel,
  clearAllDirty,
  NavGuardContext,
  UnsavedNote,
  useDirtyGuard,
  useDiscardGuard,
  useNavGuard,
} from "./components/ui/discard.tsx";

export * from "./components/ui/discard.tsx";

import { ApiKeysSection } from "./panels/settings/ApiKeysSection.tsx";
import { ControlMcpSection } from "./panels/settings/ControlMcpSection.tsx";
import { ProvidersSection } from "./panels/settings/ProvidersSection.tsx";
import { SandboxIdleSection } from "./panels/settings/SandboxIdleSection.tsx";
import { SoundsSection } from "./panels/settings/SoundsSection.tsx";
import { SpendCapSection } from "./panels/settings/SpendCapSection.tsx";
import { ThemeSection } from "./panels/settings/ThemeSection.tsx";

export { AddBotModal } from "./components/AddBotModal.tsx";
export { BotCard } from "./components/BotCard.tsx";
export {
  BotFiles,
  FILE_PREVIEW_LIMIT,
  fmtBytes,
  pctOf,
} from "./components/botTabs/BotFiles.tsx";
export {
  BotGeneral,
  parseWatchdogHours,
} from "./components/botTabs/BotGeneral.tsx";
export { BotProjects } from "./components/botTabs/BotProjects.tsx";
export { BotSecrets } from "./components/botTabs/BotSecrets.tsx";
export { BotStats } from "./components/botTabs/BotStats.tsx";
export { BotTags } from "./components/botTabs/BotTags.tsx";
export { BotTeams } from "./components/botTabs/BotTeams.tsx";
export {
  Chat,
  ChatBar,
  ChatSidebar,
  ChatTurnView,
} from "./components/Chat.tsx";
export { Nav } from "./components/Nav.tsx";
export {
  ReplayPanel,
  ReplayStep,
} from "./components/ReplayPanel.tsx";
export {
  escapeRegExp,
  Highlighted,
  SearchOverlay,
} from "./components/SearchOverlay.tsx";
export {
  nextRunLabel,
  TriggerEditor,
  Triggers,
} from "./components/Triggers.tsx";
export { mergeOptimisticChatTurns } from "./lib/chat.ts";
export type { NavItem } from "./lib/nav.ts";
export {
  applyOptimisticRunStates,
  OPTIMISTIC_RUN_GRACE_MS,
  OPTIMISTIC_RUN_MAX_MS,
  optimisticRunUpdate,
} from "./lib/runStates.ts";
export {
  ProjectModal,
  ProjectsPanel,
} from "./panels/ProjectsPanel.tsx";
export {
  SecretModal,
  SecretsPanel,
} from "./panels/SecretsPanel.tsx";
export {
  CONFIG_REPORT_ORDER,
  ConfigBackupSection,
  configBackupGeneratedKeys,
  configRestoreBody,
  formatConfigBackupReport,
  isJsonObject,
} from "./panels/settings/ConfigBackupSection.tsx";
export {
  EventDestinationModal,
  EventDestinationsSection,
} from "./panels/settings/EventDestinationsSection.tsx";
export {
  ProviderFormModal,
  ProvidersSection,
  ProvidersSection as SettingsProviders,
} from "./panels/settings/ProvidersSection.tsx";
export {
  SettingsGeneral,
  SettingsPanel,
  SettingsSystem,
  settingsHref,
  settingsTabFromLocation,
} from "./panels/settings/SettingsPanel.tsx";
export {
  TagModal,
  TagsPanel,
} from "./panels/TagsPanel.tsx";

import { FilterBar } from "./components/FilterBar.tsx";
import {
  KebabIcon,
  KeyIcon,
  MenuIcon,
  PauseIcon,
  ProjectIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  SidebarToggleIcon,
  SpinnerIcon,
  StopIcon,
  TagIcon,
} from "./components/icons/index.ts";

export { FilterBar } from "./components/FilterBar.tsx";

import { Multiselect } from "./components/Multiselect.tsx";
import { filterBots } from "./lib/filterBots.ts";

export { NotificationPanel } from "./components/NotificationPanel.tsx";

import { NotificationPanel } from "./components/NotificationPanel.tsx";

export { Multiselect } from "./components/Multiselect.tsx";

import { useNotifications } from "./hooks/useNotifications.ts";
import { usePolling } from "./hooks/usePolling.ts";
import { TAB_PATHS, tabFromPath, useTabRoute } from "./hooks/useTabRoute.ts";

export * from "./lib/mcpEnv.ts";

import { TeamsPanel } from "./panels/TeamsPanel.tsx";

export {
  TeamConfigModal,
  TeamCreateModal,
  TeamsPanel,
} from "./panels/TeamsPanel.tsx";

import { RolesPanel } from "./panels/RolesPanel.tsx";

export { RoleFormModal, RolesPanel } from "./panels/RolesPanel.tsx";

import { IntegrationsPanel } from "./panels/IntegrationsPanel.tsx";

export {
  IntegrationsPanel,
  McpServerModal,
} from "./panels/IntegrationsPanel.tsx";

import { MachinesPanel } from "./panels/MachinesPanel.tsx";

export { MachineModal, MachinesPanel } from "./panels/MachinesPanel.tsx";

import {
  TemplateEditorModal,
  TemplatesPanel,
} from "./panels/TemplatesPanel.tsx";

export {
  TemplateEditorModal,
  TemplatesPanel,
} from "./panels/TemplatesPanel.tsx";

import { SkillsPanel } from "./panels/SkillsPanel.tsx";

export {
  AddSkillModal,
  SkillModal,
  SkillsPanel,
} from "./panels/SkillsPanel.tsx";

import { api } from "./lib/api.ts";
import { BOT_NAMES, pickBotName } from "./lib/botNames.ts";
import { fmt, fmtMs, fmtTokens, relTime, titleCase } from "./lib/format.ts";
import { HEALTH_LABEL, STATUS_CHIPS } from "./lib/health.ts";
import { playSound, SOUND_LIBRARY } from "./lib/sound.ts";
import { renderMarkdown } from "./markdown.ts";
import { ensurePushSubscription, PushSection } from "./push.tsx";
import { ScheduleEditor } from "./schedule.tsx";
import type {
  ApiKey,
  Bot,
  BotGeneralSettings,
  BotModalTab,
  Breaker,
  ChatTurn,
  ContextBreakdownData,
  HookDestination,
  HookTestResult,
  Machine,
  NotificationItem,
  OptimisticChatMessage,
  OptimisticRunState,
  OptimisticRunStates,
  PendingEntityEdit,
  PendingEntityEditType,
  Project,
  Provider,
  Role,
  RouteSnapshot,
  Run,
  SearchEntityType,
  SearchGroupResponse,
  SearchMatch,
  SecretMeta,
  SettingsTab,
  Tab,
  Tag,
  Team,
  Template,
  TranscriptStep,
  Trigger,
  UsageTotals,
  WorkspaceEntry,
} from "./types.ts";

async function waitFirstAction(botId: string, runId: string): Promise<void> {
  const countReplies = () =>
    api<{ role: string }[]>(`/api/bots/${botId}/messages`)
      .then((t) => t.filter((x) => x.role === "assistant").length)
      .catch(() => null);
  const base = await countReplies();
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    await new Promise((r) => setTimeout(r, 800));
    const runs = await api<Run[]>(`/api/bots/${botId}/runs`).catch(() => []);
    const run = runs.find((r) => r.id === runId);
    if (run && run.status !== "running") return;
    const now = await countReplies();
    if (base !== null && now !== null && now > base) return;
  }
}

const BOT_MODAL_TABS: readonly string[] = [
  "general",
  "triggers",
  "logs",
  "stats",
  "files",
];

function routeFromUrl(url: URL): RouteSnapshot {
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

function routeFromLocation(): RouteSnapshot {
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

function _routeHref(route: RouteSnapshot): string {
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

function notificationTargetPathFor(item: NotificationItem): string | null {
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

export function App() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [tab, , setTabRaw] = useTabRoute({ syncLocation: false });
  const [pendingDiscard, setPendingDiscard] = useState<null | {
    label: string;
    fn: () => void;
  }>(null);
  const discardGuard = useCallback((fn: () => void) => {
    const label = anyDirtyLabel();
    if (label) setPendingDiscard({ label, fn });
    else fn();
  }, []);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (anyDirtyLabel()) e.preventDefault();
    };
    addEventListener("beforeunload", h);
    return () => removeEventListener("beforeunload", h);
  }, []);
  const setTab = (t: Tab) => {
    discardGuard(() => {
      setTabRaw(t);
      if (typeof history !== "undefined")
        history.pushState({}, "", TAB_PATHS[t]);
    });
  };
  const [openBot, setOpenBot] = useState<string | null>(null);
  const [chatBot, setChatBot] = useState<string | null>(null);
  const [poking, setPoking] = useState<Record<string, boolean>>({});
  const optimisticRuns = useRef<OptimisticRunStates>({});
  const [paused, setPausedState] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [breaker, setBreaker] = useState<Breaker | null>(null);
  const [stopAllConfirm, setStopAllConfirm] = useState(false);
  const [quickConfirm, setQuickConfirm] = useState<{
    bot: Bot;
    action: "clear" | "delete";
  } | null>(null);

  const runQuickAction = (bot: Bot, action: "clear" | "delete") => {
    const path =
      action === "clear"
        ? `/api/bots/${bot.id}/messages`
        : `/api/bots/${bot.id}`;
    void api(path, { method: "DELETE" })
      .then(() => void load())
      .catch(() => undefined);
  };

  const setOptimisticRunState = useCallback(
    (botId: string, run_state: "running" | "enabled") => {
      const update = optimisticRunUpdate(run_state);
      optimisticRuns.current = { ...optimisticRuns.current, [botId]: update };
      setBots((rows) =>
        rows.map((row) =>
          row.id === botId
            ? { ...row, run_state: update.run_state, health: update.health }
            : row,
        ),
      );
    },
    [],
  );

  const stopBotWork = useCallback(
    async (botId: string): Promise<void> => {
      await api(`/api/bots/${botId}/interrupt`, { method: "POST" });
      setOptimisticRunState(botId, "enabled");
    },
    [setOptimisticRunState],
  );

  const poke = (bot: Bot) => {
    if (!bot.enabled || paused || poking[bot.id]) return;
    setPoking((p) => ({ ...p, [bot.id]: true }));
    void api<{ runId: string | null }>(`/api/bots/${bot.id}/run`, {
      method: "POST",
    })
      .then((r) => {
        if (!r.runId) return;
        setOptimisticRunState(bot.id, "running");
        return waitFirstAction(bot.id, r.runId);
      })
      .catch(() => undefined)
      .finally(() => setPoking((p) => ({ ...p, [bot.id]: false })));
  };

  const rerunTranscriptMessage = async (
    botId: string,
    message: string,
  ): Promise<void> => {
    const target = bots.find((b) => b.id === botId);
    if (!target?.enabled || paused || target.run_state === "running") return;
    try {
      const result = await api<{ runId: string | null }>(
        `/api/bots/${botId}/run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
        },
      );
      if (result.runId) setOptimisticRunState(botId, "running");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const [modalTab, setModalTab] = useState<BotModalTab>("general");
  const modalTabOverride = useRef<BotModalTab | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [botQuery, setBotQuery] = useState("");
  const [statusSel, setStatusSel] = useState<Bot["health"][]>([]);
  const [roleSel, setRoleSel] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagSel, setTagSel] = useState<string[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [replayRun, setReplayRun] = useState<string | null>(null);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<PendingEntityEdit | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const botsRef = useRef(bots);
  botsRef.current = bots;
  const openBotRef = useRef(openBot);
  openBotRef.current = openBot;
  const chatBotRef = useRef(chatBot);
  chatBotRef.current = chatBot;
  const modalTabRef = useRef(modalTab);
  modalTabRef.current = modalTab;
  const detailOpenRef = useRef(detailOpen);
  detailOpenRef.current = detailOpen;
  const replayRunRef = useRef(replayRun);
  replayRunRef.current = replayRun;
  const suppressPopEvent = useRef(false);

  const {
    notifications,
    unreadCount: unreadNotifications,
    markOne: markOneNotification,
    markAll: markAllRead,
  } = useNotifications({
    getSound: (botId) =>
      botsRef.current.find((b) => b.id === botId)?.sound ?? "default",
    onError: (err) =>
      setError(err instanceof Error ? err.message : String(err)),
  });

  const load = useCallback(async () => {
    try {
      const [botData, roleData, tagData, pauseData, breakerData] =
        await Promise.all([
          api<Bot[]>(`/api/bots${includeArchived ? "?archived=1" : ""}`),
          api<Role[]>("/api/roles"),
          api<Tag[]>("/api/tags").catch(() => []),
          api<{ paused: boolean; reason?: string | null }>("/api/pause").catch(
            () => ({ paused: false, reason: null }),
          ),
          api<Breaker>("/api/breaker").catch(() => null),
        ]);
      const applied = applyOptimisticRunStates(botData, optimisticRuns.current);
      optimisticRuns.current = applied.overrides;
      setBots(applied.rows);
      setPausedState(pauseData.paused);
      setPauseReason(pauseData.reason ?? null);
      setBreaker(breakerData);
      setRoles(roleData);
      setTags(tagData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [includeArchived]);

  useEffect(() => {
    void ensurePushSubscription().catch(() => undefined);
  }, []);
  usePolling(load, 5000);

  useEffect(() => {
    if (!detailOpen) setAvatarMenu(false);
  }, [detailOpen]);

  const loadRuns = useCallback(async () => {
    if (!openBot) return;
    setRuns(await api<Run[]>(`/api/bots/${openBot}/runs`));
  }, [openBot]);

  useEffect(() => {
    const nextModalTab = modalTabOverride.current ?? "general";
    modalTabOverride.current = null;
    setModalTab(nextModalTab);
    setRuns([]);
  }, []);
  usePolling(loadRuns, 3000, { enabled: openBot != null });

  useEffect(() => {
    if (openBot && !bots.some((b) => b.id === openBot)) {
      setOpenBot(null);
      setDetailOpen(false);
    }
    if (chatBot && !bots.some((b) => b.id === chatBot)) setChatBot(null);
  }, [bots, openBot, chatBot]);

  useEffect(() => {
    if (!chatBot) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.closest(".sidepanel") || t.closest(".modal")) return;
      const card = t.closest("[data-bot-card]");
      setChatBot(card ? card.getAttribute("data-bot-card") : null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [chatBot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (notificationPanelOpen) setNotificationPanelOpen(false);
      else if (detailOpen) requestCloseDetails();
      else if (chatBot) setChatBot(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [notificationPanelOpen, addOpen, detailOpen, chatBot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "`" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select") ||
        target?.isContentEditable
      )
        return;
      e.preventDefault();
      setSearchOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const visibleBots = filterBots(bots, {
    query: botQuery,
    statuses: statusSel,
    roleIds: roleSel,
    tagIds: tagSel,
  });

  const openBotRow = bots.find((b) => b.id === openBot);
  const chatBotRow = bots.find((b) => b.id === chatBot);
  const dismissDetails = () => setDetailOpen(false);
  const requestCloseDetails = () => discardGuard(dismissDetails);

  function switchTab(nextTab: Tab): void {
    if (tabRef.current === nextTab) return;
    setTabRaw(nextTab);
    if (typeof history !== "undefined")
      history.pushState({}, "", TAB_PATHS[nextTab]);
  }

  const navigateTab = (nextTab: Tab) => discardGuard(() => switchTab(nextTab));

  const currentRouteSnapshot = useCallback(
    (): RouteSnapshot => ({
      tab: tabRef.current,
      chatBotId: chatBotRef.current,
      detailOpen: detailOpenRef.current,
      openBotId: openBotRef.current,
      modalTab: modalTabRef.current,
      replayRunId: replayRunRef.current,
    }),
    [],
  );

  const applyRouteSnapshot = useCallback((route: RouteSnapshot): void => {
    setTabRaw(route.tab);
    if (route.tab !== "bots") {
      modalTabOverride.current = null;
      setChatBot(null);
      setOpenBot(null);
      setDetailOpen(false);
      setReplayRun(null);
      return;
    }
    if (route.detailOpen) modalTabOverride.current = route.modalTab;
    setChatBot(route.chatBotId);
    setOpenBot(route.openBotId);
    setDetailOpen(route.detailOpen);
    setModalTab(route.modalTab);
    setReplayRun(route.replayRunId);
  }, []);

  const ensureBotRouteTarget = useCallback(async (botId: string | null) => {
    if (!botId) return true;
    if (botsRef.current.some((row) => row.id === botId)) return true;
    try {
      const rows = await api<Bot[]>("/api/bots?archived=1");
      if (!rows.some((row) => row.id === botId)) return false;
      setIncludeArchived(true);
      setBots(rows);
      botsRef.current = rows;
      return true;
    } catch {
      return false;
    }
  }, []);

  const applyNotificationPath = useCallback(
    (raw: string): void => {
      if (typeof history === "undefined" || typeof location === "undefined")
        return;
      let url: URL;
      try {
        url = new URL(raw, location.origin);
      } catch {
        return;
      }
      const target = routeFromUrl(url);
      const previous = currentRouteSnapshot();
      history.replaceState({ route: previous }, "", location.href);
      history.pushState({ route: target }, "", `${url.pathname}${url.search}`);
      void (async () => {
        if (!(await ensureBotRouteTarget(target.chatBotId ?? target.openBotId)))
          return;
        applyRouteSnapshot(target);
        if (target.tab === "settings") {
          suppressPopEvent.current = true;
          window.dispatchEvent(new PopStateEvent("popstate"));
          suppressPopEvent.current = false;
        }
      })();
    },
    [applyRouteSnapshot, currentRouteSnapshot, ensureBotRouteTarget],
  );

  const navigateToNotificationPath = useCallback(
    (raw: string) => discardGuard(() => applyNotificationPath(raw)),
    [applyNotificationPath, discardGuard],
  );

  useEffect(() => {
    if (typeof addEventListener === "undefined") return;
    const onPop = (event: PopStateEvent) => {
      if (suppressPopEvent.current) return;
      const stateRoute = (event.state as { route?: RouteSnapshot } | null)
        ?.route;
      const target = stateRoute ?? routeFromLocation();
      const label = anyDirtyLabel();
      if (!label) {
        applyRouteSnapshot(target);
        if (target.tab === "settings") {
          suppressPopEvent.current = true;
          window.dispatchEvent(new PopStateEvent("popstate"));
          suppressPopEvent.current = false;
        }
        return;
      }
      const previous = currentRouteSnapshot();
      history.replaceState({ route: previous }, "", location.href);
      setPendingDiscard({ label, fn: () => applyRouteSnapshot(target) });
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [applyRouteSnapshot, currentRouteSnapshot]);

  const initialNotificationApplied = useRef(false);
  useEffect(() => {
    if (initialNotificationApplied.current || typeof location === "undefined")
      return;
    const route = routeFromLocation();
    if (!(route.tab === "bots" && (route.chatBotId || route.openBotId))) return;
    initialNotificationApplied.current = true;
    void (async () => {
      if (await ensureBotRouteTarget(route.chatBotId ?? route.openBotId)) {
        applyRouteSnapshot(route);
      }
    })();
  }, [applyRouteSnapshot, ensureBotRouteTarget]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; path?: unknown } | null;
      if (data?.type !== "bots:navigate" || typeof data.path !== "string")
        return;
      navigateToNotificationPath(data.path);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigateToNotificationPath]);

  const openSearchEntity = (match: SearchMatch) => {
    setSearchOpen(false);
    if (match.type === "archived_bots") {
      discardGuard(() => {
        void (async () => {
          try {
            const rows = await api<Bot[]>("/api/bots?archived=1");
            if (!rows.some((bot) => bot.id === match.id)) return;
            setIncludeArchived(true);
            setBots(rows);
            switchTab("bots");
            setOpenBot(match.id);
            setDetailOpen(true);
          } catch {
            /* the periodic reload will retry */
          }
        })();
      });
      return;
    }
    if (match.type === "bots") {
      discardGuard(() => {
        setChatBot(match.id);
        switchTab("bots");
      });
      return;
    }
    const entityType = match.type as PendingEntityEditType;
    const nextTab = ENTITY_TABS[entityType];
    discardGuard(() => {
      setPendingEdit({ type: entityType, id: match.id });
      switchTab(nextTab);
    });
  };

  const openSearchNewBot = () => {
    setSearchOpen(false);
    discardGuard(() => {
      switchTab("bots");
      setAddOpen(true);
    });
  };

  function openNotification(notification: NotificationItem): void {
    const target = notificationTargetPathFor(notification);
    if (!target) {
      if (notification.read === 0) void markOneNotification(notification.id);
      return;
    }
    discardGuard(() => {
      setNotificationPanelOpen(false);
      if (notification.read === 0) void markOneNotification(notification.id);
      applyNotificationPath(target);
    });
  }

  const [rail, setRail] = useState(
    () => localStorage.getItem("bots-sidebar") === "rail",
  );

  const renderNav = (collapsed: boolean) => (
    <Nav
      tab={tab}
      rail={collapsed}
      onSelect={(t) => {
        setTab(t);
        setDetailOpen(false);
        setNavOpen(false);
      }}
    />
  );

  const toggleRail = () => {
    setRail((r) => {
      localStorage.setItem("bots-sidebar", r ? "full" : "rail");
      return !r;
    });
  };

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
    <NavGuardContext.Provider value={discardGuard}>
      <div className="app">
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
              onClick={() =>
                void api("/api/pause", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ paused: !paused }),
                })
                  .then(() => void load())
                  .catch((e) =>
                    alert(e instanceof Error ? e.message : String(e)),
                  )
              }
            >
              <PauseIcon size={15} />
              <span className="actionlabel">{paused ? "Resume" : "Pause"}</span>
            </button>
            <button
              type="button"
              className="stopall"
              aria-label="Stop all bots"
              title="Interrupt every running bot and pause everything (panic button)"
              onClick={() => setStopAllConfirm(true)}
            >
              <StopIcon size={15} />
              <span className="actionlabel">Stop all</span>
            </button>
            <button
              type="button"
              className="searchtoggle"
              aria-label="Open search"
              title="Search records or run commands (backtick)"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon size={15} />
              <span className="actionlabel">Search</span>
              <kbd className="searchshortcut">`</kbd>
            </button>
          </div>
          <NotificationPanel
            items={notifications}
            unreadCount={unreadNotifications}
            open={notificationPanelOpen}
            onToggle={() => setNotificationPanelOpen((open) => !open)}
            onClose={() => setNotificationPanelOpen(false)}
            onMarkOne={(id) => void markOneNotification(id)}
            onMarkAll={() => void markAllRead()}
            onOpenItem={openNotification}
            targetFor={notificationTargetPathFor}
          />
        </header>
        <div className="layout">
          <aside className={rail ? "rail" : ""}>
            <div className="brand">
              <BotIcon size={24} />
              {!rail && <span>Bots</span>}
            </div>
            {error && <p className="error">{error}</p>}
            {renderNav(rail)}
            <button
              type="button"
              className="railtoggle"
              aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
              title={rail ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleRail}
            >
              <SidebarToggleIcon size={20} collapsed={rail} />
            </button>
          </aside>
          <div className="topbar">
            <button
              type="button"
              className="hamburger"
              aria-label="Menu"
              title="Open menu"
              onClick={() => setNavOpen(true)}
            >
              <MenuIcon size={20} />
            </button>
          </div>
          {navOpen && (
            <div className="drawer">
              <button
                type="button"
                className="scrim"
                aria-label="Close menu"
                onClick={() => setNavOpen(false)}
              />
              <div className="panel">
                <div className="hdr">
                  <div className="brand">
                    <BotIcon size={24} />
                    <span>Bots</span>
                  </div>
                </div>
                {error && <p className="error">{error}</p>}
                {renderNav(false)}
              </div>
            </div>
          )}
          <main>
            {tab === "bots" && (
              <>
                <div className="mainhead">
                  <h2>Bots</h2>
                  <button type="button" onClick={() => setAddOpen(true)}>
                    Add bot
                  </button>
                </div>
                <FilterBar
                  query={botQuery}
                  onQueryChange={setBotQuery}
                  statuses={statusSel}
                  onStatusesChange={setStatusSel}
                  roles={roles}
                  roleIds={roleSel}
                  onRoleIdsChange={setRoleSel}
                  tags={tags}
                  tagIds={tagSel}
                  onTagIdsChange={setTagSel}
                  includeArchived={includeArchived}
                  onIncludeArchivedChange={setIncludeArchived}
                />
                <div className="cards">
                  {visibleBots.map((bot) => (
                    <BotCard
                      key={bot.id}
                      bot={bot}
                      poking={!!poking[bot.id]}
                      paused={paused}
                      onChat={() => {
                        if (bot.archived) {
                          setOpenBot(bot.id);
                          setDetailOpen(true);
                        } else {
                          setChatBot(bot.id);
                        }
                      }}
                      onRun={() => poke(bot)}
                      onStop={() =>
                        void stopBotWork(bot.id)
                          .then(() => void load())
                          .catch(() => undefined)
                      }
                      onSettings={() => {
                        setOpenBot(bot.id);
                        setDetailOpen(true);
                      }}
                      onClearMemory={() =>
                        setQuickConfirm({ bot, action: "clear" })
                      }
                      onDelete={() =>
                        setQuickConfirm({ bot, action: "delete" })
                      }
                    />
                  ))}
                </div>
                {bots.length === 0 && <p>No bots yet — press "Add bot".</p>}
                {bots.length > 0 && visibleBots.length === 0 && (
                  <p className="muted">No bots match the current filters.</p>
                )}
              </>
            )}
            {tab === "roles" && (
              <RolesPanel
                openId={pendingEdit?.type === "roles" ? pendingEdit.id : null}
                onOpened={() => setPendingEdit(null)}
              />
            )}
            {tab === "teams" && (
              <TeamsPanel
                openId={pendingEdit?.type === "teams" ? pendingEdit.id : null}
                onOpened={() => setPendingEdit(null)}
              />
            )}
            {tab === "machines" && <MachinesPanel />}
            {tab === "integrations" && <IntegrationsPanel />}
            {tab === "skills" && (
              <SkillsPanel
                openId={pendingEdit?.type === "skills" ? pendingEdit.id : null}
                onOpened={() => setPendingEdit(null)}
              />
            )}
            {tab === "templates" && (
              <TemplatesPanel
                openId={
                  pendingEdit?.type === "templates" ? pendingEdit.id : null
                }
                onOpened={() => setPendingEdit(null)}
              />
            )}
            {tab === "projects" && (
              <ProjectsPanel
                openId={
                  pendingEdit?.type === "projects" ? pendingEdit.id : null
                }
                onOpened={() => setPendingEdit(null)}
              />
            )}
            {tab === "tags" && (
              <TagsPanel
                openId={pendingEdit?.type === "tags" ? pendingEdit.id : null}
                onOpened={() => setPendingEdit(null)}
              />
            )}
            {tab === "secrets" && <SecretsPanel />}
            {tab === "settings" && <SettingsPanel />}
          </main>
          {chatBotRow && (
            <ChatSidebar
              bot={chatBotRow}
              onRunAccepted={() =>
                setOptimisticRunState(chatBotRow.id, "running")
              }
              onSettings={() => {
                setOpenBot(chatBotRow.id);
                setDetailOpen(true);
              }}
              onClose={() => setChatBot(null)}
            />
          )}
          {detailOpen && openBotRow && (
            <Modal
              scrimOnCancel={requestCloseDetails}
              scrimLabel="Close details"
              className="dialog tabs"
              role="dialog"
              aria-label={`${openBotRow.name} details`}
            >
              <div className="viewhead">
                <button
                  type="button"
                  className="avatarpick"
                  aria-label="Change avatar"
                  onClick={() => setAvatarMenu((v) => !v)}
                >
                  <Avatar
                    name={openBotRow.name}
                    id={openBotRow.id}
                    shape={openBotRow.avatar_shape}
                    color={openBotRow.avatar_color}
                    health={openBotRow.health}
                  />
                </button>
                {detailOpen && avatarMenu && (
                  <AvatarPicker
                    bot={openBotRow}
                    onClose={() => setAvatarMenu(false)}
                    onPick={(body) =>
                      api(`/api/bots/${openBotRow.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(body),
                      }).then(load)
                    }
                  />
                )}
                <h2>{openBotRow.name}</h2>
                {openBotRow.archived ? (
                  <span className="archivebadge detailarchive">Archived</span>
                ) : null}
                {openBotRow.current_task && !openBotRow.status && (
                  <p className="taskline">
                    {openBotRow.current_task}
                    {openBotRow.current_task_updated_at && (
                      <em> · {relTime(openBotRow.current_task_updated_at)}</em>
                    )}
                  </p>
                )}
                {openBotRow.current_task && openBotRow.status && (
                  <p className="taskline">{openBotRow.current_task}</p>
                )}
                {openBotRow.status && (
                  <p className="statline">
                    {openBotRow.status}
                    {openBotRow.current_task_updated_at && (
                      <em> · {relTime(openBotRow.current_task_updated_at)}</em>
                    )}
                  </p>
                )}
                <div className="detailhead-actions">
                  <SwitchToggle
                    ariaLabel="Bot enabled"
                    checked={openBotRow.enabled !== 0}
                    disabled={headerBusy || Boolean(openBotRow.archived)}
                    onChange={() => {
                      setHeaderBusy(true);
                      void api(`/api/bots/${openBotRow.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          enabled: openBotRow.enabled === 0,
                        }),
                      })
                        .then(load)
                        .catch((e) => alert(e.message))
                        .finally(() => setHeaderBusy(false));
                    }}
                    stateLabel={
                      openBotRow.archived || !openBotRow.enabled
                        ? "Disabled"
                        : "Enabled"
                    }
                  />
                  {openBotRow.run_state === "running" && (
                    <button
                      type="button"
                      className="danger"
                      aria-label="Stop while running"
                      disabled={headerBusy}
                      onClick={() => {
                        setHeaderBusy(true);
                        void stopBotWork(openBotRow.id)
                          .then(load)
                          .catch((e) => alert(e.message))
                          .finally(() => setHeaderBusy(false));
                      }}
                    >
                      Stop
                    </button>
                  )}
                  <button
                    type="button"
                    className="close"
                    aria-label="Close"
                    onClick={requestCloseDetails}
                  >
                    <CloseIcon size={18} />
                  </button>
                </div>
              </div>
              <TabNav
                tabs={BOT_MODAL_TABS.map((t) => ({
                  id: t,
                  label: titleCase(t),
                }))}
                selected={modalTab}
                onSelect={(t) =>
                  discardGuard(() => setModalTab(t as BotModalTab))
                }
              />
              <div className="tabbody">
                {modalTab === "general" && (
                  <BotGeneral
                    key={openBotRow.id}
                    bot={openBotRow}
                    onChanged={load}
                    onCancel={requestCloseDetails}
                  />
                )}
                {modalTab === "triggers" && <Triggers botId={openBotRow.id} />}
                {modalTab === "logs" && (
                  <>
                    {runs.length === 0 && (
                      <p>No runs yet. Press "Run now" or wait for a trigger.</p>
                    )}
                    {runs.map((run) => (
                      <article key={run.id}>
                        <button
                          type="button"
                          className="runhead"
                          aria-expanded={replayRun === run.id}
                          title="Show the transcript replay for this run"
                          onClick={() =>
                            setReplayRun(replayRun === run.id ? null : run.id)
                          }
                        >
                          <span className={`status ${run.status}`}>
                            {run.status}
                          </span>
                          <span>{run.trigger}</span>
                          <span>{fmt(run.started_at)}</span>
                          {run.finished_at && (
                            <span>→ {fmt(run.finished_at)}</span>
                          )}
                        </button>
                        {run.output && <pre>{run.output}</pre>}
                        {run.error && <pre className="error">{run.error}</pre>}
                        {replayRun === run.id && openBot && (
                          <ReplayPanel
                            botId={openBot}
                            run={run}
                            running={openBotRow.run_state === "running"}
                            onRerun={(message) =>
                              rerunTranscriptMessage(openBot, message)
                            }
                          />
                        )}
                      </article>
                    ))}
                  </>
                )}
                {modalTab === "stats" && (
                  <BotStats
                    key={openBotRow.id}
                    botId={openBotRow.id}
                    running={openBotRow.run_state === "running"}
                  />
                )}
                {modalTab === "files" && (
                  <BotFiles key={openBotRow.id} botId={openBotRow.id} />
                )}
              </div>
            </Modal>
          )}
          {addOpen && (
            <AddBotModal
              usedNames={bots.map((b) => b.name)}
              onClose={() => setAddOpen(false)}
              onCreated={() => {
                setAddOpen(false);
                void load();
              }}
            />
          )}
        </div>
        {pendingDiscard && (
          <ConfirmDialog
            text={`Discard unsaved changes to ${pendingDiscard.label}?`}
            confirmLabel="Discard changes"
            cancelLabel="Keep editing"
            onCancel={() => setPendingDiscard(null)}
            onConfirm={() => {
              const p = pendingDiscard;
              setPendingDiscard(null);
              clearAllDirty();
              p.fn();
            }}
          />
        )}
        {quickConfirm && (
          <ConfirmDialog
            text={
              quickConfirm.action === "delete"
                ? `Delete bot ${quickConfirm.bot.name}? This removes the bot, its triggers and run history.`
                : `Clear the stored context of ${quickConfirm.bot.name}? The bot forgets its conversation history.`
            }
            confirmLabel={
              quickConfirm.action === "delete" ? "Delete bot" : "Clear memory"
            }
            onCancel={() => setQuickConfirm(null)}
            onConfirm={() => {
              runQuickAction(quickConfirm.bot, quickConfirm.action);
              setQuickConfirm(null);
            }}
          />
        )}
        {stopAllConfirm && (
          <ConfirmDialog
            text={`Stop every running bot and pause all bots? ${bots.filter((b) => b.run_state === "running").length} in flight; nothing resumes on its own.`}
            confirmLabel="Stop all"
            onCancel={() => setStopAllConfirm(false)}
            onConfirm={() => {
              setStopAllConfirm(false);
              const runningIds = bots
                .filter((b) => b.run_state === "running")
                .map((b) => b.id);
              void api<{ stopped: number }>("/api/stop-all", {
                method: "POST",
              })
                .then(() => {
                  for (const id of runningIds)
                    setOptimisticRunState(id, "enabled");
                  void load();
                })
                .catch(() => undefined);
            }}
          />
        )}
        {searchOpen && (
          <SearchOverlay
            bots={bots}
            paused={paused}
            onClose={() => setSearchOpen(false)}
            onOpenEntity={openSearchEntity}
            onNavigate={navigateTab}
            onNewBot={openSearchNewBot}
            onChanged={load}
            onRunStateChange={setOptimisticRunState}
          />
        )}
      </div>
    </NavGuardContext.Provider>
  );
}

// specs/machines/workspace-browser.md — read-only browse of data/workspaces/<bot-id>.
export interface SearchCommand {
  id: string;
  label: string;
  group: "Bot actions" | "All bots" | "Navigation";
  disabledReason?: string;
  bot?: Bot;
  confirm?: { text: string; label: string };
  run: () => Promise<void>;
}

export interface SearchRenderRow {
  key: string;
  kind: "search" | "command";
  match?: SearchMatch;
  action?: SearchCommand;
  selectedIndex: number | null;
}

export { ConfirmDialog } from "./components/ui/ConfirmDialog.tsx";
