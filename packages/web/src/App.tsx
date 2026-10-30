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
import { Avatar, StatusDot } from "./components/Avatar.tsx";
import { AvatarPicker } from "./components/AvatarPicker.tsx";
import { BotDetailModal } from "./components/BotDetailModal.tsx";
import { ChatSidebar } from "./components/Chat.tsx";
import {
  BookIcon,
  BotIcon,
  CloseIcon,
  GearIcon,
  KebabIcon,
  KeyIcon,
  MachineIcon,
  MenuIcon,
  PauseIcon,
  PlugIcon,
  ProjectIcon,
  RefreshIcon,
  RoleIcon,
  SearchIcon,
  SendIcon,
  SidebarToggleIcon,
  SpinnerIcon,
  StopIcon,
  TagIcon,
  TeamIcon,
  TemplateIcon,
} from "./components/icons/index.ts";
import { Multiselect } from "./components/Multiselect.tsx";
import { NotificationPanel } from "./components/NotificationPanel.tsx";
import { ReplayPanel } from "./components/ReplayPanel.tsx";
import { ENTITY_TABS, SearchOverlay } from "./components/SearchOverlay.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { Triggers } from "./components/Triggers.tsx";
import { ConfirmDialog } from "./components/ui/ConfirmDialog.tsx";
import {
  anyDirtyLabel,
  clearAllDirty,
  NavGuardContext,
  UnsavedNote,
  useDirtyGuard,
  useDiscardGuard,
  useNavGuard,
} from "./components/ui/discard.tsx";
import { Modal, ModalForm } from "./components/ui/Modal.tsx";
import { SwitchToggle } from "./components/ui/SwitchToggle.tsx";
import { TabNav } from "./components/ui/TabNav.tsx";
import { useEscape } from "./components/ui/useEscape.ts";
import { useNotifications } from "./hooks/useNotifications.ts";
import { usePolling } from "./hooks/usePolling.ts";
import { TAB_PATHS, tabFromPath, useTabRoute } from "./hooks/useTabRoute.ts";
import { api } from "./lib/api.ts";
import {
  BOT_MODAL_TABS,
  notificationTargetPathFor,
  routeFromLocation,
  routeFromUrl,
  routeHref,
} from "./lib/appRoute.ts";
import { BOT_NAMES, pickBotName } from "./lib/botNames.ts";
import { filterBots } from "./lib/filterBots.ts";
import { fmt, fmtMs, fmtTokens, relTime, titleCase } from "./lib/format.ts";
import { HEALTH_LABEL, STATUS_CHIPS } from "./lib/health.ts";
import { NavItem } from "./lib/nav.ts";
import {
  applyOptimisticRunStates,
  optimisticRunUpdate,
} from "./lib/runStates.ts";
import { playSound, SOUND_LIBRARY } from "./lib/sound.ts";
import { renderMarkdown } from "./markdown.ts";
import { BotsPanel } from "./panels/BotsPanel.tsx";
import { IntegrationsPanel } from "./panels/IntegrationsPanel.tsx";
import { MachinesPanel } from "./panels/MachinesPanel.tsx";
import { ProjectsPanel } from "./panels/ProjectsPanel.tsx";
import { RolesPanel } from "./panels/RolesPanel.tsx";
import { SecretsPanel } from "./panels/SecretsPanel.tsx";
import { SkillsPanel } from "./panels/SkillsPanel.tsx";
import { ApiKeysSection } from "./panels/settings/ApiKeysSection.tsx";
import { ControlMcpSection } from "./panels/settings/ControlMcpSection.tsx";
import { ProvidersSection } from "./panels/settings/ProvidersSection.tsx";
import { SandboxIdleSection } from "./panels/settings/SandboxIdleSection.tsx";
import { SettingsPanel } from "./panels/settings/SettingsPanel.tsx";
import { SoundsSection } from "./panels/settings/SoundsSection.tsx";
import { SpendCapSection } from "./panels/settings/SpendCapSection.tsx";
import { ThemeSection } from "./panels/settings/ThemeSection.tsx";
import { TagsPanel } from "./panels/TagsPanel.tsx";
import { TeamsPanel } from "./panels/TeamsPanel.tsx";
import {
  TemplateEditorModal,
  TemplatesPanel,
} from "./panels/TemplatesPanel.tsx";
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
  const [addOpen, setAddOpen] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
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

  const toggleRail = () => {
    setRail((r) => {
      localStorage.setItem("bots-sidebar", r ? "full" : "rail");
      return !r;
    });
  };

  return (
    <NavGuardContext.Provider value={discardGuard}>
      <div className="app">
        <StatusBar
          bots={bots}
          paused={paused}
          pauseReason={pauseReason}
          breaker={breaker}
          onPauseToggle={() =>
            void api("/api/pause", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ paused: !paused }),
            })
              .then(() => void load())
              .catch((e) => alert(e instanceof Error ? e.message : String(e)))
          }
          onStopAll={() => setStopAllConfirm(true)}
          onSearch={() => setSearchOpen(true)}
          tab={tab}
          onBrandClick={() => {
            setTab("bots");
            setNavOpen(false);
          }}
        >
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
        </StatusBar>
        <div className="layout">
          <Sidebar
            tab={tab}
            rail={rail}
            error={error}
            navOpen={navOpen}
            onSelectTab={(t) => {
              setTab(t);
              setDetailOpen(false);
              setNavOpen(false);
            }}
            onToggleRail={toggleRail}
            onOpenNav={() => setNavOpen(true)}
            onCloseNav={() => setNavOpen(false)}
          />
          <main>
            {tab === "bots" && (
              <BotsPanel
                bots={bots}
                roles={roles}
                tags={tags}
                paused={paused}
                poking={poking}
                includeArchived={includeArchived}
                onIncludeArchivedChange={setIncludeArchived}
                onAddBot={() => setAddOpen(true)}
                onChat={(bot) => {
                  if (bot.archived) {
                    setOpenBot(bot.id);
                    setDetailOpen(true);
                  } else {
                    setChatBot(bot.id);
                  }
                }}
                onRun={(bot) => poke(bot)}
                onStop={(bot) =>
                  void stopBotWork(bot.id)
                    .then(() => void load())
                    .catch(() => undefined)
                }
                onSettings={(bot) => {
                  setOpenBot(bot.id);
                  setDetailOpen(true);
                }}
                onQuickAction={(bot, action) =>
                  setQuickConfirm({ bot, action })
                }
              />
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
            <BotDetailModal
              bot={openBotRow}
              openBotId={openBotRow.id}
              tabs={BOT_MODAL_TABS}
              modalTab={modalTab}
              onSelectTab={(t) =>
                discardGuard(() => setModalTab(t as BotModalTab))
              }
              runs={runs}
              replayRun={replayRun}
              onToggleReplay={setReplayRun}
              onChanged={load}
              onClose={requestCloseDetails}
              onStop={stopBotWork}
              onRerun={(message) =>
                rerunTranscriptMessage(openBotRow.id, message)
              }
            />
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
