import {
  createContext,
  type ReactElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AccountSection } from "./auth.tsx";
import { renderMarkdown } from "./markdown.ts";

export interface ApiKey {
  id: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
}

interface Bot {
  id: string;
  name: string;
  instructions: string;
  model_id: string | null;
  role_id: string | null;
  machine_id: string | null;
  avatar_shape: number | null;
  avatar_color: number | null;
  sound: string | null;
  enabled: number;
  created_at: number;
  run_state: "running" | "enabled" | "disabled";
  health: "green" | "blue" | "yellow" | "red" | "gray";
  status: string | null;
  status_level: "ok" | "issue" | "blocked" | null;
  current_task: string | null;
  current_task_updated_at: number | null;
}

interface GrantOption {
  id: string;
  name: string;
}

interface TemplateTrigger {
  message: string;
  schedule: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  instructions: string;
  machine_id: string | null;
  role_id: string | null;
  triggers: TemplateTrigger[];
  created_at: number;
}

interface Role {
  id: string;
  name: string;
  instructions: string;
  created_at: number;
  mcp_server_ids: string[];
  skill_ids: string[];
}

interface TeamMember {
  bot_id: string;
  name: string;
  leader: boolean;
}

interface Team {
  id: string;
  name: string;
  created_at: number;
  members: TeamMember[];
  project_ids: string[];
}

interface Project {
  id: string;
  name: string;
  description: string;
  body: string;
  created_at: number;
}

interface Run {
  id: string;
  status: "running" | "ok" | "error";
  trigger: "schedule" | "manual" | "chat";
  started_at: number;
  finished_at: number | null;
  output: string | null;
  error: string | null;
}

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  bot_id: string | null;
  read: number;
  created_at: number;
}

interface NotificationsResponse {
  items: NotificationItem[];
  unread_count: number;
}

interface Trigger {
  id: string;
  kind: "schedule" | "webhook";
  name: string | null;
  message: string;
  schedule: string;
  next_run_at: number | null;
  enabled: number;
}

interface Machine {
  id: string;
  name: string;
  description: string;
  dockerfile: string;
  image: string | null;
  build_error: string | null;
  builtin: boolean;
}

export const AVATAR_COLORS = [
  "#e5484d",
  "#e9762c",
  "#f0b13b",
  "#46a758",
  "#12a594",
  "#0091ff",
  "#3e63dd",
  "#8e4ec6",
  "#d6409f",
  "#ab441f",
  "#5f6b7c",
  "#0f7b6c",
];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fnv(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function StatusDot({
  id,
  health,
  label,
  active,
}: {
  id: string;
  health: Bot["health"];
  label?: string;
  active: boolean;
}) {
  const delay = -(fnv(id) % 1200) / 1000;
  return (
    <span
      className={`dot ${health}${active ? " pulse" : ""}`}
      style={{ animationDelay: `${delay}s` }}
      {...(label ? { title: label } : {})}
    />
  );
}

const SHAPE_PRESETS: {
  name: string;
  gen: (r: () => number) => [number, number, number][];
}[] = [
  // pebble — near-circle with a tiny two-harmonic ripple
  {
    name: "pebble",
    gen: (r) => [
      [3, 0.04 + r() * 0.02, r() * 6.28],
      [4, 0.03 + r() * 0.02, r() * 6.28],
    ],
  },
  // egg — vertical n=2 bulge
  { name: "egg", gen: () => [[2, 0.15, Math.PI / 2]] },
  // pear — stacked asymmetry, heavy bottom
  {
    name: "pear",
    gen: () => [
      [1, 0.07, Math.PI / 2],
      [2, 0.1, 0],
    ],
  },
  // bean — crescent indent plus mild n=1
  {
    name: "bean",
    gen: (r) => [
      [2, 0.16, r() < 0.5 ? 0.79 : 3.93],
      [1, 0.05, r() * 6.28],
    ],
  },
  // cushion — rounded square
  { name: "cushion", gen: (r) => [[4, 0.09 + r() * 0.02, r() * 6.28]] },
  // trilobe — soft rounded triangle
  { name: "trilobe", gen: (r) => [[3, 0.1 + r() * 0.02, r() * 6.28]] },
  // hexpebble — gentle hexagon
  { name: "hexpebble", gen: (r) => [[6, 0.07 + r() * 0.02, r() * 6.28]] },
  // clover — five soft lobes
  { name: "clover", gen: (r) => [[5, 0.13, r() * 6.28]] },
  // star5 / star6 — puffy rounded points
  { name: "star5", gen: (r) => [[5, 0.19, r() * 6.28]] },
  { name: "star6", gen: (r) => [[6, 0.17, r() * 6.28]] },
  // dimple — one flattened side at a seeded angle
  { name: "dimple", gen: () => [[1, -0.14, 0]] },
  // drop — teardrop leaning to a seeded direction
  {
    name: "drop",
    gen: (r) => {
      const dir = r() < 0.5 ? 0 : Math.PI;
      return [
        [1, 0.12, dir],
        [2, 0.06, dir],
      ];
    },
  },
];

export function shapeRadii(
  rand: () => number,
  preset: number | null = null,
): number[] {
  const terms =
    SHAPE_PRESETS[preset ?? Math.floor(rand() * SHAPE_PRESETS.length)].gen(
      rand,
    );
  rand();
  const n = 72;
  return Array.from({ length: n }, (_, i) => {
    const th = (i / n) * Math.PI * 2;
    return (
      1 + terms.reduce((r, [k, w, ph]) => r + w * Math.sin(k * th + ph), 0)
    );
  });
}

export function smoothClosedPath(
  radii: number[],
  cx: number,
  baseR: number,
): string {
  const n = radii.length;
  const pts = radii.map((r, i) => {
    const th = (i / n) * Math.PI * 2;
    return [cx + Math.cos(th) * r * baseR, cx + Math.sin(th) * r * baseR];
  });
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d} Z`;
}

export function avatarColor(id: string): string {
  return AVATAR_COLORS[fnv(id) % AVATAR_COLORS.length];
}

export function Avatar({
  id,
  shape = null,
  color = null,
  health = null,
}: {
  name: string;
  id: string;
  shape?: number | null;
  color?: number | null;
  health?: Bot["health"] | null;
}) {
  const rand = mulberry32(fnv(id));
  const radii = shapeRadii(rand, shape);
  const maxR = Math.max(...radii);
  const base = 46 / maxR;
  const eyeGap = 7 + rand() * 5;
  const eyeRx = 2.6 + rand() * 1.4;
  const eyeRy = eyeRx * (1.8 + rand() * 0.5);
  const gaze = (rand() - 0.5) * 3;
  const droop = rand() < 0.3;
  const col = color == null ? avatarColor(id) : AVATAR_COLORS[color];
  const blinkPeriod = 3 + rand() * 5;
  const animClass = health === null ? "" : ` anim-${health}`;
  return (
    <span
      className={`avatar${animClass}`}
      style={{
        color: col,
        ["--avatar-glow" as string]: `${col}59`,
        ["--blink-period" as string]: `${blinkPeriod.toFixed(2)}s`,
        ["--blink-delay" as string]: `${(-rand() * blinkPeriod).toFixed(2)}s`,
      }}
      aria-hidden
    >
      <svg
        className="avatar-svg"
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
      >
        <path d={smoothClosedPath(radii, 50, base)} fill="currentColor" />
        {[-1, 1].map((side) => (
          <ellipse
            key={side}
            className="eye"
            cx={(50 + side * eyeGap + gaze).toFixed(2)}
            cy={45 - (rand() - 0.5) * 3}
            rx={eyeRx.toFixed(2)}
            ry={droop ? (eyeRy * 0.45).toFixed(2) : eyeRy.toFixed(2)}
          />
        ))}
      </svg>
    </span>
  );
}

const HEALTH_LABEL: Record<Bot["health"], string> = {
  green: "active",
  blue: "idle",
  yellow: "issues",
  red: "blocked",
  gray: "disabled",
};

function ShapePreview({ preset }: { preset: number }) {
  const radii = shapeRadii(mulberry32(1000 + preset * 7919), preset);
  const base = 46 / Math.max(...radii);
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <path d={smoothClosedPath(radii, 50, base)} fill="currentColor" />
    </svg>
  );
}

function AvatarPicker({
  bot,
  onPick,
  onClose,
}: {
  bot: Bot;
  onPick: (body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const pick = (body: Record<string, unknown>) => {
    void onPick(body).catch((e) => alert((e as Error).message));
  };
  return (
    <>
      <button
        type="button"
        className="pickscrim"
        aria-label="Close avatar picker"
        onClick={onClose}
      />
      <div className="avatarmenu" role="dialog" aria-label="Avatar picker">
        <div className="shapes">
          {SHAPE_PRESETS.map((p, i) => (
            <button
              key={p.name}
              type="button"
              className={`shapeprev${bot.avatar_shape === i ? " sel" : ""}`}
              aria-label={`Shape ${p.name}`}
              style={{
                color:
                  bot.avatar_color == null
                    ? avatarColor(bot.id)
                    : AVATAR_COLORS[bot.avatar_color],
              }}
              onClick={() => pick({ avatar_shape: i })}
            >
              <ShapePreview preset={i} />
            </button>
          ))}
        </div>
        <div className="swatches">
          {AVATAR_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`swatch${bot.avatar_color === i ? " sel" : ""}`}
              style={{ background: c, color: c }}
              aria-label={`Color ${i + 1}`}
              onClick={() => pick({ avatar_color: i })}
            />
          ))}
        </div>
        <button
          type="button"
          className="resetauto"
          disabled={bot.avatar_shape === null && bot.avatar_color === null}
          onClick={() => {
            void onPick({ avatar_shape: null, avatar_color: null })
              .then(onClose)
              .catch((e) => alert((e as Error).message));
          }}
        >
          Reset to auto
        </button>
      </div>
    </>
  );
}

export function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `${res.status}`);
  return body as T;
}

export function fmt(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

const SOUND_LIBRARY: [string, string][] = [
  ["default", "Default chime"],
  ["ping", "Ping"],
  ["chirp", "Chirp"],
  ["bell", "Bell"],
  ["blip", "Blip"],
  ["warp", "Warp"],
  ["thunk", "Thunk"],
];

function playSound(id: string): void {
  if (!id || id === "none") return;
  const a = new Audio(`/sounds/${id}.wav`);
  a.volume = 0.35;
  void a.play().catch(() => undefined);
}

export function BotCard({
  bot,
  poking,
  onOpen,
  onRun,
}: {
  bot: Bot;
  poking: boolean;
  onOpen: () => void;
  onRun: () => void;
}) {
  return (
    <div className="cardwrap">
      <button
        type="button"
        className="card"
        data-bot-card={bot.id}
        aria-label={`${bot.name} (${bot.status})`}
        onClick={() => onOpen()}
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
            <StatusDot
              id={bot.id}
              health={bot.health}
              label={HEALTH_LABEL[bot.health]}
              active={bot.run_state === "running"}
            />
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
      <button
        type="button"
        className={`runcard${poking ? " poking" : ""}`}
        aria-label={poking ? `${bot.name} is starting` : `Run ${bot.name} now`}
        title="Run now"
        disabled={!bot.enabled || !!poking}
        onClick={() => onRun()}
      >
        {poking ? <SpinnerIcon size={14} /> : <PlayIcon size={14} />}
      </button>
    </div>
  );
}

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
  const [tab, setTabRaw] = useState<Tab>(() =>
    typeof location === "undefined" ? "bots" : tabFromPath(location.pathname),
  );
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
  useEffect(() => {
    if (typeof addEventListener === "undefined") return;
    const onPop = () => {
      const target = tabFromPath(location.pathname);
      const label = anyDirtyLabel();
      if (!label) {
        setTabRaw(target);
        return;
      }
      history.pushState({}, "", TAB_PATHS[tabRef.current]);
      setPendingDiscard({ label, fn: () => setTabRaw(target) });
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const [openBot, setOpenBot] = useState<string | null>(null);
  const [chatBot, setChatBot] = useState<string | null>(null);
  const [poking, setPoking] = useState<Record<string, boolean>>({});

  const poke = (bot: Bot) => {
    if (!bot.enabled || poking[bot.id]) return;
    setPoking((p) => ({ ...p, [bot.id]: true }));
    void api<{ runId: string }>(`/api/bots/${bot.id}/run`, { method: "POST" })
      .then((r) => waitFirstAction(bot.id, r.runId))
      .catch(() => undefined)
      .finally(() => setPoking((p) => ({ ...p, [bot.id]: false })));
  };

  const [modalTab, setModalTab] = useState<"general" | "triggers" | "logs">(
    "general",
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [botQuery, setBotQuery] = useState("");
  const [statusSel, setStatusSel] = useState<Bot["health"][]>([]);
  const [roleSel, setRoleSel] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const seenNotifIds = useRef<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [botData, notificationData, roleData] = await Promise.all([
        api<Bot[]>("/api/bots"),
        api<NotificationsResponse>("/api/notifications"),
        api<Role[]>("/api/roles"),
      ]);
      setBots(botData);
      const prevSeen = seenNotifIds.current;
      if (localStorage.getItem("bots-sounds") === "on" && prevSeen) {
        const fresh = notificationData.items.filter((n) => !prevSeen.has(n.id));
        if (fresh.length > 0) {
          const owner = botData.find((b) => b.id === fresh[0].bot_id);
          playSound(owner?.sound ?? "default");
        }
      }
      seenNotifIds.current = new Set(notificationData.items.map((n) => n.id));
      setNotifications(notificationData.items);
      setUnreadNotifications(notificationData.unread_count);
      setRoles(roleData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!detailOpen) setAvatarMenu(false);
  }, [detailOpen]);

  useEffect(() => {
    setModalTab("general");
    setRuns([]);
    if (!openBot) return;
    const loadRuns = async () =>
      setRuns(await api<Run[]>(`/api/bots/${openBot}/runs`));
    void loadRuns();
    const t = setInterval(loadRuns, 3000);
    return () => clearInterval(t);
  }, [openBot]);

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
      else if (detailOpen) discardGuard(() => setDetailOpen(false));
      else if (chatBot) setChatBot(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [notificationPanelOpen, addOpen, detailOpen, chatBot]);

  const botFilter = botQuery.trim().toLowerCase();
  const visibleBots = bots.filter(
    (bot) =>
      (statusSel.length === 0 || statusSel.includes(bot.health)) &&
      (roleSel.length === 0 || roleSel.includes(bot.role_id ?? "")) &&
      (!botFilter || bot.name.toLowerCase().includes(botFilter)),
  );

  function toggleIn<T>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
  }

  const openBotRow = bots.find((b) => b.id === openBot);
  const chatBotRow = bots.find((b) => b.id === chatBot);

  async function markOneNotification(id: string): Promise<void> {
    try {
      await api(`/api/notifications/${id}/read`, { method: "POST" });
      setNotifications((items) =>
        items.map((item) => (item.id === id ? { ...item, read: 1 } : item)),
      );
      setUnreadNotifications((count) => Math.max(0, count - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function markAllRead(): Promise<void> {
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      setNotifications((items) => items.map((item) => ({ ...item, read: 1 })));
      setUnreadNotifications(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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

  const redCount = bots.filter((b) => b.health === "red").length;
  return (
    <NavGuardContext.Provider value={discardGuard}>
      <div className="app">
        <header className="statusbar">
          <button
            type="button"
            className="railtoggle"
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleRail}
          >
            {rail ? "›" : "‹"}
          </button>
          <span className="counts">
            {bots.length} total ·{" "}
            {bots.filter((b) => b.run_state === "running").length} running
            {redCount > 0 && (
              <>
                {" "}
                · <span className="redcount">{redCount} blocked</span>
              </>
            )}
          </span>
          <div className="notifwrap">
            <button
              type="button"
              aria-label={`Notifications${unreadNotifications > 0 ? `, ${unreadNotifications} unread` : ""}`}
              aria-expanded={notificationPanelOpen}
              onClick={() => setNotificationPanelOpen((open) => !open)}
            >
              🔔
              {unreadNotifications > 0 && (
                <span className="notifbadge">
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </span>
              )}
            </button>
            {notificationPanelOpen && (
              <>
                <button
                  type="button"
                  className="notifscrim"
                  aria-label="Close notifications"
                  onClick={() => setNotificationPanelOpen(false)}
                />
                <section className="notifpanel" aria-label="Notifications">
                  <div className="notifhdr">
                    <strong>Notifications</strong>
                    <div>
                      <button
                        type="button"
                        disabled={unreadNotifications === 0}
                        onClick={() => void markAllRead()}
                      >
                        Mark all read
                      </button>
                      <button
                        type="button"
                        aria-label="Close notifications"
                        onClick={() => setNotificationPanelOpen(false)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="notifempty">No notifications.</p>
                  ) : (
                    <ul className="notiflist">
                      {notifications.map((notification) => (
                        <li
                          key={notification.id}
                          className={notification.read ? "" : "unread"}
                        >
                          <button
                            type="button"
                            className="notifbody"
                            disabled={notification.read === 0}
                            title={
                              notification.read ? undefined : "Mark as read"
                            }
                            onClick={() =>
                              void markOneNotification(notification.id)
                            }
                          >
                            <strong>{notification.title}</strong>
                            <time
                              dateTime={new Date(
                                notification.created_at,
                              ).toISOString()}
                            >
                              {fmt(notification.created_at)}
                            </time>
                            <p>{notification.body}</p>
                          </button>
                          {!notification.read && (
                            <div className="notifactions">
                              <button
                                type="button"
                                onClick={() =>
                                  void markOneNotification(notification.id)
                                }
                              >
                                Mark read
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        </header>
        <div className="layout">
          <aside className={rail ? "rail" : ""}>
            {error && <p className="error">{error}</p>}
            {renderNav(rail)}
          </aside>
          <div className="topbar">
            <button
              type="button"
              className="hamburger"
              aria-label="Menu"
              onClick={() => setNavOpen(true)}
            >
              ☰
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
                  <h1>Bots</h1>
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
                <div className="filterrow">
                  <input
                    placeholder="Search bots by name"
                    value={botQuery}
                    onChange={(e) => setBotQuery(e.target.value)}
                  />
                  <details className="filterdd">
                    <summary
                      aria-label={`Status filter: ${statusSel.length === 0 ? "All" : `${statusSel.length} selected`}`}
                    >
                      Status:{" "}
                      {statusSel.length === 0
                        ? "All"
                        : statusSel
                            .map(
                              (s) =>
                                HEALTH_LABEL[s][0].toUpperCase() +
                                HEALTH_LABEL[s].slice(1),
                            )
                            .join(", ")}
                    </summary>
                    <div className="filterpanel">
                      {(
                        ["green", "blue", "yellow", "red", "gray"] as const
                      ).map((s) => (
                        <label key={s}>
                          <input
                            type="checkbox"
                            checked={statusSel.includes(s)}
                            onChange={() => setStatusSel((v) => toggleIn(v, s))}
                          />{" "}
                          {HEALTH_LABEL[s][0].toUpperCase() +
                            HEALTH_LABEL[s].slice(1)}
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="filterdd">
                    <summary
                      aria-label={`Role filter: ${roleSel.length === 0 ? "All" : `${roleSel.length} selected`}`}
                    >
                      Role:{" "}
                      {roleSel.length === 0
                        ? "All"
                        : roleSel
                            .map(
                              (id) =>
                                roles.find((r) => r.id === id)?.name ??
                                "(no role)",
                            )
                            .join(", ")}
                    </summary>
                    <div className="filterpanel">
                      <input
                        placeholder="Search roles"
                        onChange={(e) => {
                          const q = e.target.value.trim().toLowerCase();
                          for (const el of e.currentTarget.parentElement
                            ?.children ?? [])
                            if (el instanceof HTMLElement && el.dataset.name)
                              el.hidden =
                                q !== "" &&
                                !el.dataset.name.toLowerCase().includes(q);
                        }}
                      />
                      <label data-name="(no role)">
                        <input
                          type="checkbox"
                          checked={roleSel.includes("")}
                          onChange={() => setRoleSel((v) => toggleIn(v, ""))}
                        />{" "}
                        (no role)
                      </label>
                      {roles.map((r) => (
                        <label key={r.id} data-name={r.name}>
                          <input
                            type="checkbox"
                            checked={roleSel.includes(r.id)}
                            onChange={() =>
                              setRoleSel((v) => toggleIn(v, r.id))
                            }
                          />{" "}
                          {r.name}
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
                <div className="cards">
                  {visibleBots.map((bot) => (
                    <BotCard
                      key={bot.id}
                      bot={bot}
                      poking={!!poking[bot.id]}
                      onOpen={() => setChatBot(bot.id)}
                      onRun={() => poke(bot)}
                    />
                  ))}
                </div>
                {bots.length === 0 && <p>No bots yet — press "Add bot".</p>}
                {bots.length > 0 && visibleBots.length === 0 && (
                  <p className="muted">No bots match the current filters.</p>
                )}
              </>
            )}
            {tab === "roles" && <RolesPanel />}
            {tab === "teams" && <TeamsPanel />}
            {tab === "machines" && <MachinesPanel />}
            {tab === "integrations" && <IntegrationsPanel />}
            {tab === "skills" && <SkillsPanel />}
            {tab === "templates" && <TemplatesPanel />}
            {tab === "projects" && <ProjectsPanel />}
            {tab === "settings" && <SettingsPanel />}
          </main>
          {chatBotRow && (
            <ChatSidebar
              bot={chatBotRow}
              onSettings={() => {
                setOpenBot(chatBotRow.id);
                setDetailOpen(true);
              }}
              onClose={() => setChatBot(null)}
            />
          )}
          {detailOpen && openBotRow && (
            <div className="modal">
              <button
                type="button"
                className="mscrim"
                aria-label="Close details"
                onClick={() => discardGuard(() => setDetailOpen(false))}
              />
              <div
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
                  {openBotRow.current_task && !openBotRow.status && (
                    <p className="taskline">
                      {openBotRow.current_task}
                      {openBotRow.current_task_updated_at && (
                        <em>
                          {" "}
                          · {relTime(openBotRow.current_task_updated_at)}
                        </em>
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
                        <em>
                          {" "}
                          · {relTime(openBotRow.current_task_updated_at)}
                        </em>
                      )}
                    </p>
                  )}
                  <button
                    type="button"
                    className="close"
                    aria-label="Close"
                    onClick={() => discardGuard(() => setDetailOpen(false))}
                  >
                    ×
                  </button>
                </div>
                <nav className="mtabs">
                  {(["general", "triggers", "logs"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={modalTab === t ? "sel" : ""}
                      onClick={() => discardGuard(() => setModalTab(t))}
                    >
                      {t[0].toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </nav>
                <div className="tabbody">
                  {modalTab === "general" && (
                    <BotGeneral
                      key={openBotRow.id}
                      bot={openBotRow}
                      onChanged={load}
                    />
                  )}
                  {modalTab === "triggers" && (
                    <Triggers botId={openBotRow.id} />
                  )}
                  {modalTab === "logs" && (
                    <>
                      {runs.length === 0 && (
                        <p>
                          No runs yet. Press "Run now" or wait for a trigger.
                        </p>
                      )}
                      {runs.map((run) => (
                        <article key={run.id}>
                          <header>
                            <span className={`status ${run.status}`}>
                              {run.status}
                            </span>
                            <span>{run.trigger}</span>
                            <span>{fmt(run.started_at)}</span>
                            {run.finished_at && (
                              <span>→ {fmt(run.finished_at)}</span>
                            )}
                          </header>
                          {run.output && <pre>{run.output}</pre>}
                          {run.error && (
                            <pre className="error">{run.error}</pre>
                          )}
                        </article>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
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
      </div>
    </NavGuardContext.Provider>
  );
}

export const BOT_NAMES = [
  "Atlas",
  "Juno",
  "Marlow",
  "Sable",
  "Wren",
  "Nova",
  "Kestrel",
  "Orbit",
  "Tundra",
  "Quill",
  "Vesper",
  "Bramble",
  "Cinder",
  "Dune",
  "Ember",
  "Flint",
  "Gale",
  "Harbor",
  "Iris",
  "Juniper",
  "Kelp",
  "Lyra",
  "Onyx",
  "Rowan",
  "Sage",
  "Cobalt",
  "Indigo",
  "Zenith",
  "Zephyr",
  "Lark",
];

export function pickBotName(used: string[]): string {
  const taken = new Set(used.map((n) => n.toLowerCase()));
  const free = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
  const pool = free.length > 0 ? free : BOT_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function AddBotModal({
  usedNames,
  onClose,
  onCreated,
}: {
  usedNames: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const initialName = useRef(pickBotName(usedNames)).current;
  const [name, setName] = useState(initialName);
  const [suggestion, setSuggestion] = useState(initialName);

  const reshuffle = () => {
    if (name !== suggestion) return;
    let next = pickBotName([...usedNames, name]);
    while (next === name && BOT_NAMES.length > 1) {
      next = pickBotName([...usedNames, name]);
    }
    setSuggestion(next);
    setName(next);
  };
  const [instructions, setInstructions] = useState("");
  const [roleId, setRoleId] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [machineId, setMachineId] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSel, setTemplateSel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Role[]>("/api/roles").then(setRoles, () => setRoles([]));
    void api<Machine[]>("/api/machines").then(
      (ms) => setMachines(ms.filter((m) => !m.builtin)),
      () => setMachines([]),
    );
    void api<Template[]>("/api/templates")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setInstructions(t.instructions);
    setRoleId(t.role_id ?? "");
    setMachineId(t.machine_id ?? "");
  };
  const dirty =
    name !== initialName ||
    instructions !== "" ||
    roleId !== "" ||
    machineId !== "";
  const attemptClose = useDiscardGuard("this new bot", dirty, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") attemptClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [attemptClose]);

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Cancel"
        onClick={attemptClose}
      />
      <form
        className="dialog narrow"
        role="dialog"
        aria-label="Add bot"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const bot = await api<Bot>("/api/bots", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name,
                instructions,
                role_id: roleId || null,
                machine_id: machineId || null,
              }),
            });
            const tpl = templates.find((t) => t.id === templateSel);
            for (const t of tpl?.triggers ?? []) {
              await api(`/api/bots/${bot.id}/triggers`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  kind: "schedule",
                  message: t.message,
                  schedule: t.schedule,
                }),
              }).catch(() => null);
            }
            onCreated();
          } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        <div className="viewhead">
          <h2>Add bot</h2>
          <button
            type="button"
            className="close"
            aria-label="Cancel"
            onClick={attemptClose}
          >
            ×
          </button>
        </div>
        {templates.length > 0 && (
          <p className="rolepick">
            Template{" "}
            <select
              value={templateSel}
              onChange={(e) => {
                setTemplateSel(e.target.value);
                applyTemplate(e.target.value);
              }}
            >
              <option value="">None</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </p>
        )}
        <div className="namerow">
          <input
            autoFocus
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {BOT_NAMES.length > 1 && (
            <button
              type="button"
              className="shuffle"
              aria-label="Suggest another name"
              title="Suggest another name"
              onClick={reshuffle}
            >
              ↻
            </button>
          )}
        </div>
        <textarea
          placeholder="instructions (optional)"
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        <p className="rolepick">
          Role{" "}
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">None</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </p>
        <p className="rolepick">
          Machine{" "}
          <select
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
          >
            <option value="">Default</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </p>
        <div className="actions">
          <button type="submit" disabled={busy}>
            Create
          </button>
          <UnsavedNote dirty={dirty} />
          <button type="button" onClick={attemptClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function BotIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="5" y="8" width="14" height="11" rx="2.5" />
      <line x1="12" y1="4.5" x2="12" y2="8" />
      <circle cx="12" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="13" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="13" r="1.05" fill="currentColor" stroke="none" />
      <line x1="9.5" y1="16.3" x2="14.5" y2="16.3" />
    </svg>
  );
}

export function RoleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l7 3v5.2c0 4.4-3 7.9-7 9.3-4-1.4-7-4.9-7-9.3V6l7-3z" />
      <circle cx="12" cy="10.2" r="2.1" />
      <path
        d="M8.5 16.6c.8-1.7 2-2.5 3.5-2.5s2.7.8 3.5 2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BookIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  );
}

export function PlayIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  );
}

export function SpinnerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      className="spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}

export function GearIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.34 4.79 L9.71 2.06 L14.29 2.06 L13.66 4.79 L15.92 5.72 L17.41 3.35 L20.65 6.59 L18.28 8.08 L19.21 10.34 L21.94 9.71 L21.94 14.29 L19.21 13.66 L18.28 15.92 L20.65 17.41 L17.41 20.65 L15.92 18.28 L13.66 19.21 L14.29 21.94 L9.71 21.94 L10.34 19.21 L8.08 18.28 L6.59 20.65 L3.35 17.41 L5.72 15.92 L4.79 13.66 L2.06 14.29 L2.06 9.71 L4.79 10.34 L5.72 8.08 L3.35 6.59 L6.59 3.35 L8.08 5.72 Z" />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}

export function PlugIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M9 3v5" />
      <path d="M15 3v5" />
      <path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8Z" />
      <path d="M12 16.5V21" />
    </svg>
  );
}

export function MachineIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="4" width="17" height="7" rx="2" />
      <rect x="3.5" y="13" width="17" height="7" rx="2" />
      <circle cx="7.2" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7.2" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

type Tab =
  | "bots"
  | "teams"
  | "roles"
  | "machines"
  | "integrations"
  | "skills"
  | "templates"
  | "projects"
  | "settings";

const TAB_PATHS: Record<Tab, string> = {
  bots: "/bots",
  teams: "/teams",
  roles: "/roles",
  machines: "/machines",
  integrations: "/integrations",
  skills: "/skills",
  templates: "/templates",
  projects: "/projects",
  settings: "/settings",
};

function tabFromPath(path: string): Tab {
  const hit = (Object.keys(TAB_PATHS) as Tab[]).find(
    (t) =>
      TAB_PATHS[t] === path.replace(/\/+$/, "") ||
      (path === "/" && t === "bots"),
  );
  return hit ?? "bots";
}

function TeamIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.6 13.7c2.4.2 4.2 1.7 4.8 4.1" />
    </svg>
  );
}

function ProjectIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function TemplateIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="3" width="13" height="7" rx="1.5" />
      <rect x="8" y="14" width="13" height="7" rx="1.5" />
      <path d="M3 6v12" />
    </svg>
  );
}

const NAV_ITEMS: {
  id: Tab;
  label: string;
  Icon: (p: { size?: number }) => ReactElement;
}[] = [
  { id: "bots", label: "Bots", Icon: BotIcon },
  { id: "teams", label: "Teams", Icon: TeamIcon },
  { id: "roles", label: "Roles", Icon: RoleIcon },
  { id: "machines", label: "Machines", Icon: MachineIcon },
  { id: "integrations", label: "Integrations", Icon: PlugIcon },
  { id: "skills", label: "Skills", Icon: BookIcon },
  { id: "templates", label: "Templates", Icon: TemplateIcon },
  { id: "projects", label: "Projects", Icon: ProjectIcon },
  { id: "settings", label: "Settings", Icon: GearIcon },
];

function Nav({
  tab,
  rail,
  onSelect,
}: {
  tab: Tab;
  rail: boolean;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <nav className="sidetabs">
      {NAV_ITEMS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          className={tab === id ? "sel" : ""}
          onClick={() => onSelect(id)}
        >
          <Icon size={rail ? 20 : 17} />
          {!rail && label}
        </button>
      ))}
    </nav>
  );
}

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

function currentTheme(): Theme {
  const stored = localStorage.getItem("bots-theme");
  return stored === "light" || stored === "system" ? stored : "dark";
}

interface Provider {
  id: string;
  name: string;
  base_url: string;
  models: string[];
  has_key: boolean;
}

export function SettingsPanel() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [idle, setIdle] = useState(5);
  const [savedIdle, setSavedIdle] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(
    null,
  );
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formProvider, setFormProvider] = useState<Provider | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Provider | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keyName, setKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [mcpEnabled, setMcpEnabled] = useState(true);

  const loadKeys = useCallback(async () => {
    const list = await api<ApiKey[]>("/api/api-keys").catch(
      () => [] as ApiKey[],
    );
    setKeys(list);
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const createKey = async () => {
    const res = await api<{ value: string }>("/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: keyName.trim() }),
    }).catch(() => null);
    if (res?.value) {
      setRevealedKey(res.value);
      setKeyName("");
      void loadKeys();
    }
  };

  const revokeKey = async (id: string) => {
    await api(`/api/api-keys/${id}`, { method: "DELETE" }).catch(() => null);
    void loadKeys();
  };

  const loadProviders = useCallback(async () => {
    const [list, settings] = await Promise.all([
      api<Provider[]>("/api/providers").catch(() => [] as Provider[]),
      api<{
        default_provider_id: string | null;
        default_model: string | null;
        control_mcp_enabled?: boolean;
      }>("/api/settings").catch(() => null),
    ]);
    setProviders(list);
    if (settings) {
      setMcpEnabled(settings.control_mcp_enabled !== false);
      setDefaultProviderId(settings.default_provider_id);
      setDefaultModel(settings.default_model);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const saveDefaults = async (providerId: string, model: string) => {
    setDefaultProviderId(providerId);
    setDefaultModel(model);
    try {
      await api("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          default_provider_id: providerId,
          default_model: model,
        }),
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const removeProvider = async (p: Provider) => {
    try {
      await api(`/api/providers/${p.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      await loadProviders();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const defaultProvider = providers.find((p) => p.id === defaultProviderId);
  const modelOptions = defaultProvider
    ? [
        ...new Set([
          ...defaultProvider.models,
          ...(defaultModel ? [defaultModel] : []),
        ]),
      ]
    : [];

  useEffect(() => {
    void api<{ sandbox_idle_minutes: number }>("/api/settings")
      .then((s) => {
        setIdle(s.sandbox_idle_minutes);
        setSavedIdle(s.sandbox_idle_minutes);
      })
      .catch(() => {});
  }, []);

  const idleDirty = savedIdle !== null && idle !== savedIdle;
  useDirtyGuard("the sandbox idle timeout", idleDirty);

  const saveIdle = async () => {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sandbox_idle_minutes: idle }),
      });
      setSavedIdle(idle);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const [soundsOn, setSoundsOn] = useState(
    () => localStorage.getItem("bots-sounds") === "on",
  );

  const pick = (t: Theme) => {
    localStorage.setItem("bots-theme", t);
    document.documentElement.dataset.theme = t;
    setTheme(t);
  };

  return (
    <section>
      <div className="mainhead">
        <h2>Settings</h2>
      </div>
      <AccountSection />
      <p className="muted">Theme</p>
      <div className="themegroup" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            className={t === theme ? "sel" : ""}
            onClick={() => pick(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <p className="muted">Sandbox idle timeout</p>
      <div className="actions">
        <input
          type="number"
          min={0}
          max={1440}
          value={idle}
          onChange={(e) => setIdle(Number(e.target.value))}
        />
        minutes
        <button type="button" disabled={saving} onClick={() => void saveIdle()}>
          Save
        </button>
        <UnsavedNote dirty={idleDirty} />
      </div>
      <p className="muted">Notification sounds</p>
      <div className="actions">
        <label className="switch">
          <input
            type="checkbox"
            aria-label="Play notification sounds"
            checked={soundsOn}
            onChange={() => {
              const next = !soundsOn;
              setSoundsOn(next);
              localStorage.setItem("bots-sounds", next ? "on" : "off");
              if (next) playSound("default");
            }}
          />
          <span className="knob" />
          <span className="state">{soundsOn ? "On" : "Off"}</span>
        </label>
        <button type="button" onClick={() => playSound("default")}>
          Preview
        </button>
      </div>

      <p className="muted">API keys</p>
      <ul className="plist">
        {keys.map((k) => (
          <li key={k.id}>
            <div className="pinfo">
              <strong>{k.name}</strong>
              <span className="muted">created {relTime(k.created_at)}</span>
              <span className="muted">
                {k.last_used_at === null
                  ? "never used"
                  : `last used ${relTime(k.last_used_at)}`}
              </span>
            </div>
            <div className="actions">
              <button type="button" onClick={() => void revokeKey(k.id)}>
                Revoke
              </button>
            </div>
          </li>
        ))}
      </ul>
      {revealedKey !== null && (
        <p className="keyreveal">
          New key — shown once: <code>{revealedKey}</code>
        </p>
      )}
      <div className="keyrow">
        <input
          placeholder="Key name"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
        />
        <button
          type="button"
          disabled={!keyName.trim()}
          onClick={() => void createKey()}
        >
          Add key
        </button>
      </div>
      <p className="muted">
        Headless access: <a href="/api/openapi.json">OpenAPI spec</a>
      </p>

      <p className="muted">Control MCP server</p>
      <div className="tedithead">
        <label className="switch">
          <input
            type="checkbox"
            aria-label="Control MCP enabled"
            checked={mcpEnabled}
            onChange={() => {
              const next = !mcpEnabled;
              setMcpEnabled(next);
              api("/api/settings", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ control_mcp_enabled: next }),
              }).catch((e) => alert(e.message));
            }}
          />
          <span className="knob" />
          <span className="state">{mcpEnabled ? "Enabled" : "Disabled"}</span>
        </label>
        <code>/mcp</code>
      </div>

      <p className="muted">LLM providers</p>
      {providers.length === 0 && (
        <p className="muted">
          No providers configured — runs fail until you add one.
        </p>
      )}
      <ul className="plist">
        {providers.map((p) => (
          <li key={p.id}>
            <div className="pinfo">
              <strong>{p.name}</strong>
              {p.id === defaultProviderId && (
                <span className="defbadge">default</span>
              )}
              <span className="muted">{p.base_url}</span>
              <span className="muted">
                {p.models.length} model{p.models.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="actions">
              <button
                type="button"
                onClick={() => {
                  setFormProvider(p);
                  setFormOpen(true);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => setConfirmDelete(p)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            setFormProvider(null);
            setFormOpen(true);
          }}
        >
          Add provider
        </button>
      </div>
      {providers.length > 0 && (
        <>
          <p className="muted">Default model</p>
          <div className="actions">
            <select
              value={defaultProviderId ?? ""}
              onChange={(e) => {
                const p = providers.find((x) => x.id === e.target.value);
                void saveDefaults(e.target.value, p?.models[0] ?? "");
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={defaultModel ?? ""}
              onChange={(e) =>
                void saveDefaults(defaultProviderId ?? "", e.target.value)
              }
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {formOpen && (
        <ProviderFormModal
          provider={formProvider}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void loadProviders();
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          text={`Remove ${confirmDelete.name}? Runs will fail until a new default is selected.`}
          confirmLabel="Delete provider"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void removeProvider(confirmDelete)}
        />
      )}
    </section>
  );
}

export function ProviderFormModal({
  provider,
  onClose,
  onSaved,
}: {
  provider: Provider | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(provider?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>(provider?.models ?? []);
  const [detected, setDetected] = useState<string[] | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    name !== (provider?.name ?? "") ||
    baseUrl !== (provider?.base_url ?? "") ||
    apiKey !== "" ||
    models.join(",") !== (provider?.models ?? []).join(",");
  const attemptClose = useDiscardGuard(
    provider ? `provider ${provider.name}` : "this new provider",
    dirty,
    onClose,
  );

  const toggleModel = (id: string) => {
    setModels((ms) =>
      ms.includes(id) ? ms.filter((m) => m !== id) : [...ms, id],
    );
  };

  const detect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ models: string[] }>("/api/providers/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: provider?.id,
          base_url: baseUrl,
          api_key: apiKey,
        }),
      });
      setDetected(res.models);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addManual = () => {
    const id = manual.trim();
    if (!id) return;
    setModels((ms) => (ms.includes(id) ? ms : [...ms, id]));
    setDetected((d) => (d && !d.includes(id) ? [id, ...d] : d));
    setManual("");
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, base_url: baseUrl, models };
      if (apiKey !== "") body.api_key = apiKey;
      await api(provider ? `/api/providers/${provider.id}` : "/api/providers", {
        method: provider ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Cancel"
        onClick={attemptClose}
      />
      <div className="dialog">
        <div className="viewhead">
          <h2>{provider ? `Edit ${provider.name}` : "Add provider"}</h2>
          <button
            type="button"
            className="close"
            aria-label="Cancel"
            onClick={attemptClose}
          >
            ×
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <label className="field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Base URL
          <input
            placeholder="https://host/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>
        <label className="field">
          API key
          <input
            type="password"
            placeholder={provider?.has_key ? "saved — leave empty to keep" : ""}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <div className="actions">
          <button
            type="button"
            disabled={busy || !baseUrl}
            onClick={() => void detect()}
          >
            {busy ? "Working…" : "Detect models"}
          </button>
        </div>
        {detected && (
          <ul className="modellist">
            {[...models.filter((m) => !detected.includes(m)), ...detected].map(
              (id) => (
                <li key={id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={models.includes(id)}
                      onChange={() => toggleModel(id)}
                    />{" "}
                    {id}
                  </label>
                </li>
              ),
            )}
          </ul>
        )}
        {models.length > 0 && !detected && (
          <ul className="modellist">
            {models.map((id) => (
              <li key={id}>
                <label>
                  <input
                    type="checkbox"
                    checked
                    onChange={() => toggleModel(id)}
                  />{" "}
                  {id}
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="actions">
          <input
            placeholder="Add model id manually"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addManual();
            }}
          />
          <button type="button" onClick={addManual}>
            Add
          </button>
        </div>
        <div className="actions">
          <button
            type="button"
            disabled={busy || !name || !baseUrl.startsWith("http")}
            onClick={() => void save()}
          >
            Save provider
          </button>
        </div>
      </div>
    </div>
  );
}

export function Multiselect({
  label,
  options,
  selected,
  onChange,
  busy,
  placeholder,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  busy?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const sel = new Set(selected);
  const q = query.trim().toLowerCase();
  return (
    <div className="multiselect">
      <input
        aria-label={label}
        placeholder={placeholder ?? "Search…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {selected.length > 0 && (
        <span className="mschosen">{`${selected.length} selected`}</span>
      )}
      <ul className="msopts">
        {options
          .filter((o) => !q || o.name.toLowerCase().includes(q))
          .map((o) => (
            <li key={o.id}>
              <label>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={sel.has(o.id)}
                  onChange={() =>
                    onChange(
                      sel.has(o.id)
                        ? selected.filter((x) => x !== o.id)
                        : [...selected, o.id],
                    )
                  }
                />
                {o.name}
              </label>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function teamHealth(members: TeamMember[], bots: Bot[]): Bot["health"] {
  const hs = members
    .map((m) => bots.find((b) => b.id === m.bot_id)?.health)
    .filter(Boolean) as Bot["health"][];
  for (const h of ["red", "yellow", "green", "blue"] as const)
    if (hs.includes(h)) return h;
  return "gray";
}

export function TeamCreateModal({
  bots,
  busy,
  onClose,
  mutate,
}: {
  bots: Bot[];
  busy: boolean;
  onClose: () => void;
  mutate: (fn: () => Promise<unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [memberSel, setMemberSel] = useState<string[]>([]);
  const [leaderSel, setLeaderSel] = useState<string[]>([]);
  const dirty = name !== "" || memberSel.length > 0 || leaderSel.length > 0;
  const attemptClose = useDiscardGuard("this new team", dirty, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") attemptClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Cancel"
        onClick={attemptClose}
      />
      <form
        className="dialog narrow"
        role="dialog"
        aria-label="Create team"
        onSubmit={(e) => {
          e.preventDefault();
          mutate(async () => {
            const created = await api<Team>("/api/teams", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: name.trim() }),
            });
            for (const id of new Set([...memberSel, ...leaderSel]))
              await api(`/api/teams/${created.id}/members`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  bot_id: id,
                  leader: leaderSel.includes(id),
                }),
              });
            onClose();
          });
        }}
      >
        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <div className="field">
          Members
          <Multiselect
            label={`Members of new team`}
            options={bots.map((b) => ({ id: b.id, name: b.name }))}
            selected={memberSel}
            onChange={setMemberSel}
            busy={busy}
            placeholder="Add teammates…"
          />
        </div>
        <div className="field">
          Leaders (also added as members)
          <Multiselect
            label={`Leaders of new team`}
            options={bots.map((b) => ({ id: b.id, name: b.name }))}
            selected={leaderSel}
            onChange={setLeaderSel}
            busy={busy}
            placeholder="Pick leaders…"
          />
        </div>
        <div className="actions">
          <button type="submit" disabled={busy || !name.trim()}>
            Create team
          </button>
          <UnsavedNote dirty={dirty} />
          <button type="button" onClick={attemptClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function TeamsPanel() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nameQ, setNameQ] = useState("");
  const [botSel, setBotSel] = useState<string[]>([]);
  const [selTeamId, setSelTeamId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ts, bs, ps] = await Promise.all([
      api<Team[]>("/api/teams").catch(() => [] as Team[]),
      api<Bot[]>("/api/bots").catch(() => [] as Bot[]),
      api<Project[]>("/api/projects").catch(() => [] as Project[]),
    ]);
    setTeams(ts);
    setBots(bs);
    setProjects(ps.map((p) => ({ id: p.id, name: p.name })));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = (fn: () => Promise<unknown>) => {
    setBusy(true);
    fn()
      .then(load)
      .catch((e) => alert(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  const nq = nameQ.trim().toLowerCase();
  const visible = teams.filter(
    (t) =>
      (!nq || t.name.toLowerCase().includes(nq)) &&
      (botSel.length === 0 || t.members.some((m) => botSel.includes(m.bot_id))),
  );
  const selTeam = teams.find((t) => t.id === selTeamId);

  return (
    <section>
      <div className="viewhead">
        <h2>Teams</h2>
        <button type="button" onClick={() => setCreating(true)}>
          Create team
        </button>
      </div>
      <div className="filterrow">
        <input
          aria-label="Filter teams by name"
          placeholder="Search teams by name"
          value={nameQ}
          onChange={(e) => setNameQ(e.target.value)}
        />
        <Multiselect
          label="Filter teams by bots"
          options={bots.map((b) => ({ id: b.id, name: b.name }))}
          selected={botSel}
          onChange={setBotSel}
          placeholder="Filter by bots…"
        />
      </div>
      {teams.length === 0 && (
        <p className="muted">
          No teams yet — teammates DM each other in a team.
        </p>
      )}
      <div className="cards">
        {visible.map((team) => {
          const health = teamHealth(team.members, bots);
          return (
            <button
              type="button"
              key={team.id}
              className="card teamcard"
              aria-label={`Configure ${team.name}`}
              onClick={() => setSelTeamId(team.id)}
            >
              <StatusDot
                id={team.id}
                health={health}
                active={health === "green"}
              />
              <strong>{team.name}</strong>
              <em className="muted">
                {team.members.length}{" "}
                {team.members.length === 1 ? "bot" : "bots"}
              </em>
            </button>
          );
        })}
      </div>
      {creating && (
        <TeamCreateModal
          bots={bots}
          busy={busy}
          onClose={() => setCreating(false)}
          mutate={mutate}
        />
      )}
      {selTeam && (
        <TeamConfigModal
          team={selTeam}
          bots={bots}
          projects={projects}
          busy={busy}
          onClose={() => setSelTeamId(null)}
          mutate={mutate}
        />
      )}
    </section>
  );
}

export function TeamConfigModal({
  team,
  bots,
  projects,
  busy,
  onClose,
  mutate,
}: {
  team: Team;
  bots: Bot[];
  projects: { id: string; name: string }[];
  busy: boolean;
  onClose: () => void;
  mutate: (fn: () => Promise<unknown>) => void;
}) {
  const [name, setName] = useState(team.name);
  const [memberSel, setMemberSel] = useState<string[]>(
    team.members.map((m) => m.bot_id),
  );
  const [leaderSel, setLeaderSel] = useState<string[]>(
    team.members.filter((m) => m.leader).map((m) => m.bot_id),
  );
  const [attached, setAttached] = useState<string[]>(team.project_ids ?? []);
  const [confirmDel, setConfirmDel] = useState(false);

  const memberIds = Array.from(new Set([...memberSel, ...leaderSel]));
  const curLeaderIds = team.members
    .filter((m) => m.leader)
    .map((m) => m.bot_id);
  const dirty =
    name.trim() !== team.name ||
    attached.join(",") !== (team.project_ids ?? []).join(",") ||
    [...memberIds].sort().join(",") !==
      team.members
        .map((m) => m.bot_id)
        .sort()
        .join(",") ||
    leaderSel
      .filter((id) => memberIds.includes(id))
      .sort()
      .join(",") !== [...curLeaderIds].sort().join(",");

  const save = () => {
    const cur = new Map(team.members.map((m) => [m.bot_id, m.leader]));
    mutate(async () => {
      await api(`/api/teams/${team.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), project_ids: attached }),
      });
      for (const id of memberIds) {
        const leader = leaderSel.includes(id);
        if (!cur.has(id) || cur.get(id) !== leader)
          await api(`/api/teams/${team.id}/members`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ bot_id: id, leader }),
          });
      }
      for (const m of team.members)
        if (!memberIds.includes(m.bot_id))
          await api(`/api/teams/${team.id}/members/${m.bot_id}`, {
            method: "DELETE",
          });
      onClose();
    });
  };
  const attemptClose = useDiscardGuard(`team ${team.name}`, dirty, onClose);

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Cancel"
        onClick={attemptClose}
      />
      <form
        className="dialog narrow"
        role="dialog"
        aria-label={`Configure team ${team.name}`}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <div className="field">
          Members
          <Multiselect
            label={`Members of ${team.name}`}
            options={bots.map((b) => ({ id: b.id, name: b.name }))}
            selected={memberSel}
            onChange={setMemberSel}
            busy={busy}
            placeholder="Add teammates…"
          />
        </div>
        <div className="field">
          Leaders (also added as members)
          <Multiselect
            label={`Leaders of ${team.name}`}
            options={bots.map((b) => ({ id: b.id, name: b.name }))}
            selected={leaderSel}
            onChange={setLeaderSel}
            busy={busy}
            placeholder="Pick leaders…"
          />
        </div>
        <div className="field">
          Projects (inherited by all members)
          <Multiselect
            label={`Projects for ${team.name}`}
            options={projects}
            selected={attached}
            onChange={setAttached}
            busy={busy}
            placeholder="Attach projects…"
          />
        </div>
        <div className="actions">
          <button type="submit" disabled={busy || !name.trim() || !dirty}>
            Save
          </button>
          <UnsavedNote dirty={dirty} />
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => setConfirmDel(true)}
          >
            Delete
          </button>
          <button type="button" onClick={attemptClose}>
            Cancel
          </button>
        </div>
      </form>
      {confirmDel && (
        <ConfirmDialog
          text={`Delete team ${team.name}? The bots stay.`}
          confirmLabel="Delete team"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            mutate(() =>
              api(`/api/teams/${team.id}`, { method: "DELETE" }).then(onClose),
            );
          }}
        />
      )}
    </div>
  );
}

export function BotTeams({ botId }: { botId: string }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Team[]>("/api/teams")
      .then(setTeams)
      .catch(() => setTeams([]));
  }, []);

  if (teams.length === 0) return null;

  const selected = teams
    .filter((t) => t.members.some((m) => m.bot_id === botId))
    .map((t) => t.id);

  const change = (nextIds: string[]) => {
    setBusy(true);
    const added = nextIds.filter((id) => !selected.includes(id));
    const removed = selected.filter((id) => !nextIds.includes(id));
    void Promise.all([
      ...added.map((id) =>
        api(`/api/teams/${id}/members`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bot_id: botId }),
        }),
      ),
      ...removed.map((id) =>
        api(`/api/teams/${id}/members/${botId}`, { method: "DELETE" }),
      ),
    ])
      .then(() => api<Team[]>("/api/teams"))
      .then(setTeams)
      .catch((e) => alert(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Multiselect
      label="Teams"
      options={teams.map((t) => ({ id: t.id, name: t.name }))}
      selected={selected}
      onChange={change}
      busy={busy}
      placeholder="Join a team…"
    />
  );
}

export function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const navGuard = useNavGuard();
  const [creating, setCreating] = useState(false);
  const [selProject, setSelProject] = useState<Project | null>(null);

  const load = useCallback(async () => {
    setProjects(await api<Project[]>("/api/projects").catch(() => []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="viewhead">
        <h2>Projects</h2>
        <button type="button" onClick={() => setCreating(true)}>
          Add project
        </button>
      </div>
      {projects.length === 0 && (
        <p className="muted">
          No projects yet — shared context attached to bots.
        </p>
      )}
      <div className="cards">
        {projects.map((project) => (
          <button
            type="button"
            key={project.id}
            className="card"
            onClick={() => navGuard(() => setSelProject(project))}
          >
            <strong>{project.name}</strong>
            <span className="preview">{project.description}</span>
          </button>
        ))}
      </div>
      {(creating || selProject) && (
        <ProjectModal
          project={selProject}
          onClose={() => {
            setCreating(false);
            setSelProject(null);
          }}
          onSaved={() => {
            setCreating(false);
            setSelProject(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

export function ProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: Project | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [body, setBody] = useState(project?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty =
    name !== (project?.name ?? "") ||
    description !== (project?.description ?? "") ||
    body !== (project?.body ?? "");
  const attemptClose = useDiscardGuard(
    project ? `project ${project.name}` : "this new project",
    dirty,
    onClose,
  );

  const save = async () => {
    setBusy(true);
    try {
      await api(project ? `/api/projects/${project.id}` : "/api/projects", {
        method: project ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, body }),
      });
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Cancel"
        onClick={attemptClose}
      />
      <form
        className="dialog narrow"
        role="dialog"
        aria-label={project ? "Edit project" : "Create project"}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="field">
          Description (optional, one line)
          <input
            value={description}
            maxLength={120}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          Markdown body
          <textarea
            className="projectbody"
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </label>
        {body.length > 8000 && (
          <p className="muted">
            Large body ({body.length.toLocaleString()} chars) — bots attaching
            this project get a heavy prompt. Saving is still allowed.
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={busy || !name.trim() || !body.trim()}>
            Save
          </button>
          <UnsavedNote dirty={dirty} />
          {project && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => setConfirmDel(true)}
            >
              Delete
            </button>
          )}
        </div>
      </form>
      {confirmDel && project && (
        <ConfirmDialog
          text={`Delete project ${project.name}? Attached bots lose it from their prompts.`}
          confirmLabel="Delete project"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            api(`/api/projects/${project.id}`, { method: "DELETE" })
              .then(onSaved)
              .catch((e) => alert(e.message));
          }}
        />
      )}
    </div>
  );
}

export function BotProjects({ botId }: { botId: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Project[]>("/api/projects")
      .then(setProjects)
      .catch(() => setProjects([]));
    void api<{ project_ids: string[] }>(`/api/bots/${botId}`)
      .then((b) => setAttached(b.project_ids ?? []))
      .catch(() => undefined);
  }, [botId]);

  if (projects.length === 0) return null;

  const toggle = (id: string) => {
    const next = attached.includes(id)
      ? attached.filter((x) => x !== id)
      : [...attached, id];
    setBusy(true);
    api(`/api/bots/${botId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_ids: next }),
    })
      .then(() => setAttached(next))
      .catch((e) => alert(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="botteams">
      {projects.map((project) => (
        <label key={project.id}>
          <input
            type="checkbox"
            disabled={busy}
            checked={attached.includes(project.id)}
            onChange={() => toggle(project.id)}
          />
          {project.name}
        </label>
      ))}
    </div>
  );
}

export function RolesPanel() {
  const [roles, setRoles] = useState<Role[]>([]);
  const navGuard = useNavGuard();
  const [query, setQuery] = useState("");
  const [formRole, setFormRole] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  const loadRoles = useCallback(async () => {
    setRoles(await api<Role[]>("/api/roles").catch(() => []));
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const q = query.trim().toLowerCase();
  const visible = roles.filter(
    (role) =>
      !q ||
      role.name.toLowerCase().includes(q) ||
      role.instructions.toLowerCase().includes(q),
  );

  return (
    <section>
      <div className="viewhead">
        <h2>Roles</h2>
        <button type="button" onClick={() => setCreating(true)}>
          Create role
        </button>
      </div>
      <input
        placeholder="Search roles"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {roles.length === 0 && (
        <p className="muted">No roles yet — press "Create role".</p>
      )}
      {roles.length > 0 && visible.length === 0 && (
        <p className="muted">No roles match "{query}".</p>
      )}
      <div className="cards">
        {visible.map((role) => (
          <button
            type="button"
            key={role.id}
            className="card"
            onClick={() => navGuard(() => setFormRole(role))}
          >
            <strong>{role.name}</strong>
            <span className="preview">{role.instructions}</span>
          </button>
        ))}
      </div>
      {(creating || formRole) && (
        <RoleFormModal
          role={formRole}
          onClose={() => {
            setCreating(false);
            setFormRole(null);
          }}
          onSaved={() => {
            setCreating(false);
            setFormRole(null);
            void loadRoles();
          }}
        />
      )}
    </section>
  );
}

export function RoleFormModal({
  role,
  onClose,
  onSaved,
}: {
  role: Role | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [instructions, setInstructions] = useState(role?.instructions ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [roleTab, setRoleTab] = useState<"general" | "capabilities">("general");
  const [mcpOptions, setMcpOptions] = useState<GrantOption[]>([]);
  const [skillOptions, setSkillOptions] = useState<GrantOption[]>([]);
  const [mcpIds, setMcpIds] = useState<string[]>(role?.mcp_server_ids ?? []);
  const [skillIds, setSkillIds] = useState<string[]>(role?.skill_ids ?? []);
  const dirty =
    name !== (role?.name ?? "") ||
    instructions !== (role?.instructions ?? "") ||
    mcpIds.join(",") !== (role?.mcp_server_ids ?? []).join(",") ||
    skillIds.join(",") !== (role?.skill_ids ?? []).join(",");
  const attemptClose = useDiscardGuard(
    role ? `role ${role.name}` : "this new role",
    dirty,
    onClose,
  );

  useEffect(() => {
    void api<GrantOption[]>("/api/mcp-servers")
      .then(setMcpOptions)
      .catch(() => setMcpOptions([]));
    void api<GrantOption[]>("/api/skills")
      .then(setSkillOptions)
      .catch(() => setSkillOptions([]));
  }, []);

  const toggleId = (
    id: string,
    current: string[],
    setter: (v: string[]) => void,
  ) =>
    setter(
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmDel) attemptClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, confirmDel]);

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Cancel"
        onClick={attemptClose}
      />
      <form
        className="dialog narrow"
        role="dialog"
        aria-label={role ? "Edit role" : "Create role"}
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setBusy(true);
            try {
              const body = JSON.stringify({
                name,
                instructions,
                mcp_server_ids: mcpIds,
                skill_ids: skillIds,
              });
              if (role)
                await api(`/api/roles/${role.id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body,
                });
              else
                await api("/api/roles", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body,
                });
              onSaved();
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err));
              setBusy(false);
            }
          })();
        }}
      >
        <div className="viewhead">
          <h2>{role ? "Edit role" : "Create role"}</h2>
          <button
            type="button"
            className="close"
            aria-label="Cancel"
            onClick={attemptClose}
          >
            ×
          </button>
        </div>
        <nav className="mtabs">
          {(["general", "capabilities"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={roleTab === t ? "sel" : ""}
              onClick={() => setRoleTab(t)}
            >
              {t === "general" ? "General" : "Capabilities"}
            </button>
          ))}
        </nav>
        {roleTab === "general" && (
          <>
            <input
              ref={nameRef}
              placeholder="role name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <textarea
              placeholder="instructions added to assigned bots' prompts"
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              required
            />
          </>
        )}
        {roleTab === "capabilities" && (
          <div className="grantlist">
            <h3>MCP servers</h3>
            {mcpOptions.length === 0 && (
              <p className="muted">No MCP servers — add one in Integrations.</p>
            )}
            {mcpOptions.map((opt) => (
              <label key={opt.id} className="grantrow">
                <input
                  type="checkbox"
                  checked={mcpIds.includes(opt.id)}
                  onChange={() => toggleId(opt.id, mcpIds, setMcpIds)}
                />
                {opt.name}
              </label>
            ))}
            <h3>Skills</h3>
            {skillOptions.length === 0 && (
              <p className="muted">No skills — add one in Skills.</p>
            )}
            {skillOptions.map((opt) => (
              <label key={opt.id} className="grantrow">
                <input
                  type="checkbox"
                  checked={skillIds.includes(opt.id)}
                  onChange={() => toggleId(opt.id, skillIds, setSkillIds)}
                />
                {opt.name}
              </label>
            ))}
          </div>
        )}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {role ? "Save role" : "Create role"}
          </button>
          <UnsavedNote dirty={dirty} />
          {role && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => setConfirmDel(true)}
            >
              Delete role
            </button>
          )}
          <button type="button" onClick={attemptClose}>
            Cancel
          </button>
        </div>
      </form>
      {role && confirmDel && (
        <ConfirmDialog
          text={`Delete role ${role.name}? Bots using it fall back to their own prompts.`}
          confirmLabel="Delete role"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            setConfirmDel(false);
            void (async () => {
              setBusy(true);
              try {
                await api(`/api/roles/${role.id}`, { method: "DELETE" });
                onSaved();
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            })();
          }}
        />
      )}
    </div>
  );
}

export function BotGeneral({
  bot,
  onChanged,
}: {
  bot: Bot | undefined;
  onChanged: () => void;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState(bot?.name ?? "");
  const [instructions, setInstructions] = useState(bot?.instructions ?? "");
  const [roleId, setRoleId] = useState(bot?.role_id ?? "");
  const [machineId, setMachineId] = useState(bot?.machine_id ?? "");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [pending, setPending] = useState<"delete" | "clear" | "restart" | null>(
    null,
  );
  const [tplDraft, setTplDraft] = useState<
    (Omit<Template, "id" | "created_at"> & { id?: string }) | null
  >(null);

  const openTemplateDraft = async () => {
    if (!bot) return;
    const trs = await api<Trigger[]>(`/api/bots/${bot.id}/triggers`).catch(
      () => [] as Trigger[],
    );
    setTplDraft({
      name: `${bot.name} template`,
      description: "",
      instructions: bot.instructions ?? "",
      machine_id: bot.machine_id,
      role_id: bot.role_id,
      triggers: trs
        .filter((t) => t.kind === "schedule")
        .map((t) => ({ message: t.message, schedule: t.schedule })),
    });
  };

  useEffect(() => {
    void api<Role[]>("/api/roles").then(setRoles, () => setRoles([]));
    void api<Machine[]>("/api/machines")
      .then((ms) => setMachines(ms.filter((m) => !m.builtin)))
      .catch(() => setMachines([]));
  }, []);

  const dirty =
    !!bot &&
    (name.trim() !== bot.name ||
      instructions !== bot.instructions ||
      roleId !== (bot.role_id ?? "") ||
      machineId !== (bot.machine_id ?? ""));
  useDirtyGuard(bot ? `the bot ${bot.name}` : "this bot", dirty);

  if (!bot) return null;
  const patchBot = (body: Record<string, unknown>) =>
    api(`/api/bots/${bot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  return (
    <>
      <div className="profile">
        <input
          aria-label="Bot name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          aria-label="Instructions"
          placeholder="instructions (optional)"
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        <div className="actions">
          <button
            type="button"
            disabled={busy || !dirty || !name.trim()}
            onClick={() => {
              setBusy(true);
              patchBot({
                name: name.trim(),
                instructions,
                role_id: roleId || null,
                machine_id: machineId || null,
              })
                .then(onChanged)
                .catch((e) => alert(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Save
          </button>
          <UnsavedNote dirty={dirty} />
        </div>
      </div>
      <p className="statusline">
        Status:{" "}
        <StatusDot
          id={bot.id}
          health={bot.health}
          active={bot.run_state === "running"}
        />{" "}
        {HEALTH_LABEL[bot.health]}
      </p>
      <BotProjects botId={bot.id} />
      <BotTeams botId={bot.id} />
      <div className="actions">
        <label className="switch">
          <input
            type="checkbox"
            aria-label="Bot enabled"
            checked={bot.enabled !== 0}
            disabled={toggling}
            onChange={() => {
              setToggling(true);
              patchBot({ enabled: bot.enabled === 0 })
                .then(onChanged)
                .catch((e) => alert(e.message))
                .finally(() => setToggling(false));
            }}
          />
          <span className="knob" />
          <span className="state">{bot.enabled ? "Enabled" : "Disabled"}</span>
        </label>
        {bot.run_state === "running" && (
          <button
            type="button"
            onClick={() =>
              api(`/api/bots/${bot.id}/interrupt`, { method: "POST" })
                .then(onChanged)
                .catch((e) => alert(e.message))
            }
          >
            Stop
          </button>
        )}
        <button type="button" onClick={() => setPending("restart")}>
          Restart machine
        </button>
        <button type="button" onClick={() => setPending("clear")}>
          Clear memory
        </button>
        <button type="button" onClick={() => void openTemplateDraft()}>
          Save as template…
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => setPending("delete")}
        >
          Delete
        </button>
      </div>
      <p className="rolepick">
        Role{" "}
        <select
          value={roleId}
          aria-label="Bot role"
          onChange={(e) => setRoleId(e.target.value)}
        >
          <option value="">None</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </p>
      <p className="rolepick">
        Machine{" "}
        <select
          value={machineId}
          aria-label="Bot machine"
          onChange={(e) => setMachineId(e.target.value)}
        >
          <option value="">Default</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </p>
      <p className="rolepick">
        Sound{" "}
        <select
          value={bot.sound ?? ""}
          aria-label="Bot notification sound"
          onChange={(e) => {
            const v = e.target.value;
            patchBot({ sound: v === "" ? null : v })
              .then(onChanged)
              .catch((err) => alert(err.message));
          }}
        >
          <option value="">Global default</option>
          <option value="none">None</option>
          {SOUND_LIBRARY.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>{" "}
        <button
          type="button"
          onClick={() =>
            playSound(bot.sound && bot.sound !== "none" ? bot.sound : "default")
          }
        >
          Preview
        </button>
      </p>
      {pending === "delete" && (
        <ConfirmDialog
          text={`Delete bot ${bot.name}? This removes the bot, its triggers and run history.`}
          confirmLabel="Delete bot"
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            setPending(null);
            await api(`/api/bots/${bot.id}`, { method: "DELETE" });
            onChanged();
          }}
        />
      )}
      {tplDraft && (
        <TemplateEditorModal
          initial={tplDraft}
          onClose={() => setTplDraft(null)}
          onSaved={() => setTplDraft(null)}
        />
      )}
      {pending === "clear" && (
        <ConfirmDialog
          text={`Clear the stored context of ${bot.name}? The bot forgets its conversation history.`}
          confirmLabel="Clear memory"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            api(`/api/bots/${bot.id}/messages`, { method: "DELETE" }).catch(
              (e) => alert(e.message),
            );
          }}
        />
      )}
      {pending === "restart" && (
        <ConfirmDialog
          text={`Restart the machine of ${bot.name}? A running task is interrupted and the container is recreated on next shell use; anything installed outside /workspace is lost.`}
          confirmLabel="Restart machine"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            api(`/api/bots/${bot.id}/restart-machine`, { method: "POST" })
              .then(onChanged)
              .catch((e) => alert(e.message));
          }}
        />
      )}
    </>
  );
}

const dirtyEditors = new Map<string, string>();
const dirtyListeners = new Set<() => void>();

function bumpDirty(): void {
  for (const l of dirtyListeners) l();
}

export function anyDirtyLabel(): string | null {
  for (const label of dirtyEditors.values()) return label;
  return null;
}

export function clearAllDirty(): void {
  dirtyEditors.clear();
  bumpDirty();
}

function subscribeDirty(l: () => void): () => void {
  dirtyListeners.add(l);
  return () => {
    dirtyListeners.delete(l);
  };
}

export function formDirty(
  snapshot: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(snapshot))
    if (snapshot[key] !== current[key]) return true;
  return false;
}

export const NavGuardContext = createContext<(fn: () => void) => void>((fn) =>
  fn(),
);

export function useNavGuard(): (fn: () => void) => void {
  return useContext(NavGuardContext);
}

export function UnsavedNote({ dirty }: { dirty: boolean }) {
  if (!dirty) return null;
  return (
    <span className="unsavednote" role="status">
      Unsaved changes
    </span>
  );
}

export function useDirtyGuard(label: string, dirty: boolean): void {
  useEffect(() => {
    if (dirty) dirtyEditors.set(label, label);
    else dirtyEditors.delete(label);
    bumpDirty();
    return () => {
      dirtyEditors.delete(label);
      bumpDirty();
    };
  }, [label, dirty]);
}

export function useDiscardGuard(
  label: string,
  dirty: boolean,
  close: () => void,
): () => void {
  const guard = useNavGuard();
  useDirtyGuard(label, dirty);
  return () => guard(close);
}

export function ConfirmDialog({
  text,
  confirmLabel,
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
}: {
  text: string;
  confirmLabel: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="confirm">
      <button
        type="button"
        className="mscrim"
        aria-label="Cancel"
        onClick={onCancel}
      />
      <div className="dialog narrow" role="alertdialog" aria-label={text}>
        <p>{text}</p>
        <div className="actions">
          <button type="button" className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Triggers({ botId }: { botId: string }) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 * * * *");
  const [kind, setKind] = useState<"schedule" | "webhook">("schedule");
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Trigger | null>(null);
  const [rotating, setRotating] = useState<Trigger | null>(null);

  const reload = useCallback(
    () =>
      api<Trigger[]>(`/api/bots/${botId}/triggers`)
        .then((rows) => {
          setTriggers(rows);
          setSel((cur) =>
            cur === "new" || rows.some((r) => r.id === cur)
              ? cur
              : (rows[0]?.id ?? null),
          );
        })
        .catch(() => setTriggers([])),
    [botId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const current = triggers.find((t) => t.id === sel) ?? null;

  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/api/triggers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const select = (id: string | null) => {
    setSel(id);
    document.getElementById("trig-editor")?.scrollIntoView({ block: "start" });
  };

  return (
    <section className="triggers">
      <div className="trigmd">
        <nav className="tlist" aria-label="Triggers">
          <button type="button" onClick={() => select("new")}>
            + Add trigger
          </button>
          {triggers.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`trow${sel === t.id ? " sel" : ""}${t.enabled ? "" : " off"}`}
              onClick={() => select(t.id)}
            >
              <span className="trowtop">
                {t.name ||
                  (t.kind === "webhook"
                    ? `webhook ${t.id.slice(0, 8)}`
                    : t.schedule)}
              </span>
              <span className="trowsub">
                {t.kind === "webhook" ? "Webhook" : "Schedule"}
                {t.enabled ? "" : " (paused)"}
              </span>
            </button>
          ))}
        </nav>
        <div className="teditor" id="trig-editor">
          {current && (
            <button
              type="button"
              className="tback"
              onClick={() =>
                document
                  .querySelector(".tlist")
                  ?.scrollIntoView({ block: "start" })
              }
            >
              ← Triggers
            </button>
          )}
          {sel === null && (
            <p className="muted">
              No triggers — the bot only runs on &quot;Run now&quot;.
            </p>
          )}
          {sel === "new" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const body: Record<string, unknown> = {
                    message,
                    kind,
                    name: name.trim() || null,
                  };
                  if (kind === "schedule") body.schedule = schedule;
                  const res = await api<Trigger & { secret?: string }>(
                    `/api/bots/${botId}/triggers`,
                    {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify(body),
                    },
                  ).catch((err) => {
                    alert(err.message);
                    return null;
                  });
                  if (res) {
                    if (res.secret)
                      setCreated({ id: res.id, secret: res.secret });
                    setMessage("");
                    await reload();
                    setSel(res?.id ?? null);
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                Name (optional)
                <input
                  placeholder="e.g. nightly sweep"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                Message
                <textarea
                  placeholder="message to inject on trigger"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                Type
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as "schedule" | "webhook")
                  }
                >
                  <option value="schedule">Schedule</option>
                  <option value="webhook">Webhook</option>
                </select>
              </label>
              {kind === "schedule" && (
                <input
                  placeholder="cron or @every 30m"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  required
                />
              )}
              <div className="actions">
                <button type="submit" disabled={busy}>
                  Create trigger
                </button>
                <button type="button" onClick={() => setSel(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {current && (
            <TriggerEditor
              key={current.id}
              trigger={current}
              onPatch={patch}
              onRotate={() => setRotating(current)}
              onRemove={() => setRemoving(current)}
              secret={created?.id === current.id ? created.secret : null}
            />
          )}
        </div>
      </div>
      {removing && (
        <ConfirmDialog
          text={`Remove trigger ${removing.kind === "webhook" ? removing.id : removing.schedule}? Its future fires stop; past runs stay.`}
          confirmLabel="Remove trigger"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            setRemoving(null);
            api(`/api/triggers/${removing.id}`, { method: "DELETE" })
              .then(reload)
              .catch((e) => alert(e.message));
          }}
        />
      )}
      {rotating && (
        <ConfirmDialog
          text={`Rotate the webhook secret for ${rotating.id}? The current secret stops working immediately — integrations break until updated.`}
          confirmLabel="Rotate secret"
          onCancel={() => setRotating(null)}
          onConfirm={() => {
            const t = rotating;
            setRotating(null);
            api<{ secret: string }>(`/api/triggers/${t.id}/rotate-secret`, {
              method: "POST",
            })
              .then((r) => {
                setCreated({ id: t.id, secret: r.secret });
                void reload();
              })
              .catch((e) => alert(e.message));
          }}
        />
      )}
    </section>
  );
}
export function nextRunLabel(trigger: Trigger): string | null {
  if (trigger.kind !== "schedule" || trigger.enabled !== 1) return null;
  return `next: ${fmt(trigger.next_run_at)}`;
}

function TriggerEditor({
  trigger,
  onPatch,
  onRotate,
  onRemove,
  secret,
}: {
  trigger: Trigger;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  onRotate: () => void;
  onRemove: () => void;
  secret: string | null;
}) {
  const [name, setName] = useState(trigger.name ?? "");
  const [message, setMessage] = useState(trigger.message);
  const [schedule, setSchedule] = useState(trigger.schedule);
  const [busy, setBusy] = useState(false);
  const dirty =
    name !== (trigger.name ?? "") ||
    message !== trigger.message ||
    (trigger.kind === "schedule" && schedule !== trigger.schedule);
  useDirtyGuard(
    trigger.name?.trim()
      ? `the trigger ${trigger.name}`
      : `this ${trigger.kind} trigger`,
    dirty,
  );
  const nextRun = nextRunLabel(trigger);
  return (
    <>
      <div className="tedithead">
        <label className="switch">
          <input
            type="checkbox"
            aria-label="Trigger enabled"
            checked={trigger.enabled === 1}
            onChange={() =>
              void onPatch(trigger.id, { enabled: trigger.enabled !== 1 })
            }
          />
          <span className="knob" />
          <span className="state">
            {trigger.enabled === 1 ? "Enabled" : "Disabled"}
          </span>
        </label>
        {trigger.kind === "webhook" ? (
          <code>{`POST /api/webhooks/${trigger.id}`}</code>
        ) : nextRun ? (
          <span className="muted">{nextRun}</span>
        ) : null}
      </div>
      <label className="field">
        Name (optional)
        <input
          placeholder="e.g. nightly sweep"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        Message
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      {trigger.kind === "schedule" && (
        <input
          placeholder="cron or @every 30m"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
        />
      )}
      <div className="actions">
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() => {
            setBusy(true);
            void onPatch(trigger.id, {
              name: name.trim() || null,
              message,
              ...(trigger.kind === "schedule" ? { schedule } : {}),
            }).finally(() => setBusy(false));
          }}
        >
          Save
        </button>
        <UnsavedNote dirty={dirty} />
        {trigger.kind === "webhook" && (
          <button type="button" onClick={onRotate}>
            Rotate secret
          </button>
        )}
      </div>
      {secret && (
        <div className="secretbox">
          <p>
            Secret (shown once — store it now):{" "}
            <code className="secret">{secret}</code>
          </p>
        </div>
      )}
      <button type="button" className="danger" onClick={onRemove}>
        Remove
      </button>
    </>
  );
}

type ToolCallTurn = { name: string; input: unknown; output?: string };
type ChatTurn = {
  role: string;
  text: string;
  thinking?: string;
  tool_calls?: ToolCallTurn[];
  injected?: boolean;
  source?: string;
};

const INJECT_LABELS: Record<string, string> = {
  schedule: "schedule",
  manual: "manual run",
  webhook: "webhook",
};

export function ChatBar({ turn }: { turn: ChatTurn }) {
  return (
    <div className={`chat-bar ${turn.source ?? "trigger"}`}>
      <span className="who">
        {INJECT_LABELS[turn.source ?? ""] ?? turn.source ?? "trigger"}
      </span>
      <pre>{turn.text}</pre>
    </div>
  );
}

export function ChatTurnView({
  turn,
  botName,
}: {
  turn: ChatTurn;
  botName: string;
}) {
  return (
    <div className={`chat-turn ${turn.role}`}>
      <span className="who">{turn.role === "user" ? "you" : botName}</span>
      {turn.role === "user" ? (
        <pre>{turn.text}</pre>
      ) : (
        <>
          {turn.tool_calls?.map((c, j) => (
            <details className="turnsec" key={j}>
              <summary>tool: {c.name}</summary>
              <pre>{JSON.stringify(c.input, null, 2)}</pre>
              {c.output !== undefined && <pre>{c.output}</pre>}
            </details>
          ))}
          {!!turn.thinking?.trim() && (
            <details className="turnsec">
              <summary>thinking</summary>
              <pre>{turn.thinking}</pre>
            </details>
          )}
          {turn.text.trim() !== "" && (
            <div
              className="md"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.text) }}
            />
          )}
        </>
      )}
    </div>
  );
}

export function ChatSidebar({
  bot,
  onSettings,
  onClose,
}: {
  bot: Bot | null;
  onSettings: () => void;
  onClose: () => void;
}) {
  if (!bot) return null;
  return (
    <aside className="sidepanel" role="dialog" aria-label={`${bot.name} chat`}>
      <div className="viewhead">
        <Avatar
          name={bot.name}
          id={bot.id}
          shape={bot.avatar_shape}
          color={bot.avatar_color}
          health={bot.health}
        />
        <h2>{bot.name}</h2>
        <button
          type="button"
          aria-label={`${bot.name} settings`}
          onClick={onSettings}
        >
          <GearIcon size={16} />
        </button>
        <button
          type="button"
          className="close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <Chat
        key={bot.id}
        botId={bot.id}
        botName={bot.name}
        working={bot.run_state === "running"}
      />
    </aside>
  );
}

export function Chat({
  botId,
  botName,
  working = false,
}: {
  botId: string;
  botName: string;
  working?: boolean;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);

  const loadChat = useCallback(async () => {
    try {
      const fresh = await api<ChatTurn[]>(`/api/bots/${botId}/messages`);
      if (
        pendingRef.current &&
        fresh.some((t) => t.role === "user" && t.text === pendingRef.current)
      )
        pendingRef.current = null;
      setTurns(() => {
        const base = [...fresh];
        if (
          pendingRef.current &&
          !base.some((t) => t.text === pendingRef.current)
        )
          base.push({ role: "user", text: pendingRef.current });
        return base;
      });
    } catch {
      /* keep last */
    }
  }, [botId]);

  useEffect(() => {
    void loadChat();
    const t = setInterval(loadChat, working ? 800 : 3000);
    return () => clearInterval(t);
  }, [loadChat, working]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setErr(null);
    pendingRef.current = text;
    setTurns((prev) => [...prev, { role: "user", text }]);
    setDraft("");
    try {
      await api(`/api/bots/${botId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      await loadChat();
    } catch (e) {
      pendingRef.current = null;
      setTurns((prev) => prev.filter((t) => t.text !== text));
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="chat">
      <div className="chat-log">
        {turns.length === 0 && <p>No conversation yet. Say something below.</p>}
        {turns.map((t, i) =>
          t.injected ? (
            <ChatBar key={i} turn={t} />
          ) : (
            <ChatTurnView key={i} turn={t} botName={botName} />
          ),
        )}
        <div ref={bottomRef} />
      </div>
      {working && (
        <div className="chat-working" aria-label="bot is working">
          <span className="who">{botName}</span>
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      {err && <p className="error">{err}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="chat-input"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the bot…"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}

interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  created_at: number;
}

interface McpServer {
  id: string;
  name: string;
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: number;
}

export function IntegrationsPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [form, setForm] = useState<McpServer | "new" | null>(null);
  const [removing, setRemoving] = useState<McpServer | null>(null);
  const [results, setResults] = useState<
    Record<string, { tools?: number; error?: string; busy?: boolean }>
  >({});

  const reload = useCallback(
    () =>
      api<McpServer[]>("/api/mcp-servers")
        .then(setServers)
        .catch(() => setServers([])),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const test = (server: McpServer) => {
    setResults((r) => ({ ...r, [server.id]: { busy: true } }));
    api<{ tools: number }>(`/api/mcp-servers/${server.id}/test`, {
      method: "POST",
    })
      .then((res) =>
        setResults((r) => ({ ...r, [server.id]: { tools: res.tools } })),
      )
      .catch((e: Error) =>
        setResults((r) => ({ ...r, [server.id]: { error: e.message } })),
      );
  };

  return (
    <section>
      <div className="viewhead">
        <h2>Integrations</h2>
        <button type="button" onClick={() => setForm("new")}>
          Add MCP server
        </button>
      </div>
      <h3>MCP Servers</h3>
      <div className="mcpsection">
        {servers.length === 0 && (
          <p className="muted">No MCP servers yet — add one above.</p>
        )}
        {servers.map((s) => {
          const r = results[s.id];
          return (
            <div className="mcpsrv" key={s.id}>
              <header>
                <strong>{s.name}</strong>
                {!s.enabled && <span className="muted">(disabled)</span>}
                <button
                  type="button"
                  onClick={() => test(s)}
                  disabled={r?.busy}
                >
                  {r?.busy ? "Testing…" : "Test connection"}
                </button>
                <button type="button" onClick={() => setForm(s)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => setRemoving(s)}
                >
                  Delete
                </button>
              </header>
              <code>{[s.command, ...s.args].join(" ")}</code>
              {Object.keys(s.env).length > 0 && (
                <p className="muted envline">
                  {Object.keys(s.env)
                    .map((k) => `${k}=••••`)
                    .join("  ")}
                </p>
              )}
              {r?.tools !== undefined && (
                <p className="ok line">Connected — {r.tools} tools</p>
              )}
              {r?.error && <p className="error line">{r.error}</p>}
            </div>
          );
        })}
      </div>
      {removing && (
        <ConfirmDialog
          text={`Delete MCP server ${removing.name}? Bots granted this server will lose its tools.`}
          confirmLabel="Delete server"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            setRemoving(null);
            api(`/api/mcp-servers/${removing.id}`, { method: "DELETE" })
              .then(reload)
              .catch((e) => alert(e.message));
          }}
        />
      )}
      {form && (
        <McpServerModal
          server={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}

export function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillForm, setSkillForm] = useState<Skill | "new" | null>(null);
  const [removingSkill, setRemovingSkill] = useState<Skill | null>(null);

  const reloadSkills = useCallback(
    () =>
      api<Skill[]>("/api/skills")
        .then(setSkills)
        .catch(() => setSkills([])),
    [],
  );

  useEffect(() => {
    void reloadSkills();
  }, [reloadSkills]);

  return (
    <section>
      <div className="viewhead">
        <h2>Skills</h2>
        <button type="button" onClick={() => setSkillForm("new")}>
          Add skill
        </button>
      </div>
      <div className="mcpsection">
        {skills.length === 0 && (
          <p className="muted">No skills yet — add one above.</p>
        )}
        {skills.map((sk) => (
          <div className="mcpsrv" key={sk.id}>
            <header>
              <strong>{sk.name}</strong>
              <button type="button" onClick={() => setSkillForm(sk)}>
                Edit
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => setRemovingSkill(sk)}
              >
                Delete
              </button>
            </header>
            {sk.description && <p className="muted">{sk.description}</p>}
          </div>
        ))}
      </div>
      {removingSkill && (
        <ConfirmDialog
          text={`Delete skill ${removingSkill.name}? Grants referencing it will drop on next run.`}
          confirmLabel="Delete skill"
          onCancel={() => setRemovingSkill(null)}
          onConfirm={() => {
            const target = removingSkill;
            setRemovingSkill(null);
            api(`/api/skills/${target.id}`, { method: "DELETE" })
              .then(reloadSkills)
              .catch((e) => alert(e.message));
          }}
        />
      )}
      {skillForm && (
        <SkillModal
          skill={skillForm === "new" ? null : skillForm}
          onClose={() => setSkillForm(null)}
          onSaved={() => {
            setSkillForm(null);
            void reloadSkills();
          }}
        />
      )}
    </section>
  );
}

export function SkillModal({
  skill,
  onClose,
  onSaved,
}: {
  skill: Skill | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [instructions, setInstructions] = useState(skill?.instructions ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty =
    name !== (skill?.name ?? "") ||
    description !== (skill?.description ?? "") ||
    instructions !== (skill?.instructions ?? "");
  const attemptClose = useDiscardGuard(
    skill ? `skill ${skill.name}` : "this new skill",
    dirty,
    onClose,
  );

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Close"
        onClick={attemptClose}
      />
      <div className="dialog" role="dialog" aria-label="Skill">
        <h2>{skill ? "Edit skill" : "Add skill"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api(skill ? `/api/skills/${skill.id}` : "/api/skills", {
                method: skill ? "PATCH" : "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, description, instructions }),
              });
              onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Description (optional)
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Instructions (markdown)
            <textarea
              className="fixed"
              rows={12}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : skill ? "Save" : "Create"}
            </button>
            <UnsavedNote dirty={dirty} />
            <button type="button" onClick={attemptClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function McpServerModal({
  server,
  onClose,
  onSaved,
}: {
  server: McpServer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(server?.name ?? "");
  const [command, setCommand] = useState(server?.command ?? "");
  const [args, setArgs] = useState((server?.args ?? []).join("\n"));
  const [envRows, setEnvRows] = useState<[string, string][]>(() => {
    const entries = Object.entries(server?.env ?? {}) as [string, string][];
    return entries.length > 0 ? entries : [["", ""]];
  });
  const [enabled, setEnabled] = useState(server ? server.enabled === 1 : true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const snap = useRef({
    name: server?.name ?? "",
    command: server?.command ?? "",
    args: (server?.args ?? []).join("\n"),
    env: JSON.stringify(envRows),
    enabled: server ? server.enabled === 1 : true,
  }).current;
  const dirty =
    name !== snap.name ||
    command !== snap.command ||
    args !== snap.args ||
    JSON.stringify(envRows) !== snap.env ||
    enabled !== snap.enabled;
  const attemptClose = useDiscardGuard(
    server ? `MCP server ${server.name}` : "this new MCP server",
    dirty,
    onClose,
  );

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Close"
        onClick={attemptClose}
      />
      <div className="dialog" role="dialog" aria-label="MCP server">
        <h2>{server ? "Edit MCP server" : "Add MCP server"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const envMap: Record<string, string> = {};
            for (const [k, v] of envRows) {
              const key = k.trim();
              if (key) envMap[key] = v;
            }
            const body = {
              name,
              command,
              args: args
                .split("\n")
                .map((a) => a.trim())
                .filter(Boolean),
              env: envMap,
              enabled,
            };
            try {
              await api(
                server ? `/api/mcp-servers/${server.id}` : "/api/mcp-servers",
                {
                  method: server ? "PATCH" : "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(body),
                },
              );
              onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Command
            <input
              value={command}
              placeholder="npx"
              onChange={(e) => setCommand(e.target.value)}
              required
            />
          </label>
          <label>
            Args (one per line)
            <textarea
              rows={3}
              value={args}
              placeholder={"-y\n@example/mcp-server"}
              onChange={(e) => setArgs(e.target.value)}
            />
          </label>
          <fieldset className="envrows">
            <legend>Env vars</legend>
            {envRows.map(([k, v], i) => (
              <div className="envrow" key={i}>
                <input
                  placeholder="KEY"
                  value={k}
                  onChange={(e) =>
                    setEnvRows(
                      envRows.map((r, j) =>
                        j === i ? [e.target.value, r[1]] : r,
                      ),
                    )
                  }
                />
                <input
                  placeholder="value"
                  value={v}
                  onChange={(e) =>
                    setEnvRows(
                      envRows.map((r, j) =>
                        j === i ? [r[0], e.target.value] : r,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="danger ghost"
                  aria-label={`Remove env var ${i + 1}`}
                  onClick={() => setEnvRows(envRows.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="linklike"
              onClick={() => setEnvRows([...envRows, ["", ""]])}
            >
              + Add variable
            </button>
          </fieldset>
          <label className="checkrow">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="button" onClick={attemptClose}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <UnsavedNote dirty={dirty} />
          </div>
        </form>
      </div>
    </div>
  );
}

export function MachinesPanel() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [form, setForm] = useState<Machine | "new" | null>(null);
  const [removing, setRemoving] = useState<Machine | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      api<Machine[]>("/api/machines")
        .then(setMachines)
        .catch(() => setMachines([])),
    [],
  );

  const refresh = (m: Machine) => {
    setRefreshing(m.id);
    api(
      m.builtin
        ? "/api/machines/default/repull"
        : `/api/machines/${m.id}/rebuild`,
      { method: "POST" },
    )
      .then(reload)
      .catch((e) => alert(e.message))
      .finally(() => setRefreshing(null));
  };

  useEffect(() => {
    void reload();
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <section>
      <div className="viewhead">
        <h2>Machines</h2>
        <button type="button" onClick={() => setForm("new")}>
          Add machine
        </button>
      </div>
      <div className="mcpsection">
        {machines.map((m) => (
          <div className="mcpsrv" key={m.id}>
            <header>
              <strong>{m.name}</strong>
              {refreshing === m.id ? (
                <span className="muted">
                  {m.builtin ? "Pulling…" : "Building…"}
                </span>
              ) : (
                <button type="button" onClick={() => refresh(m)}>
                  {m.builtin ? "Repull" : "Rebuild"}
                </button>
              )}
              {!m.builtin && (
                <>
                  <button type="button" onClick={() => setForm(m)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setRemoving(m)}
                  >
                    Delete
                  </button>
                </>
              )}
              {m.builtin && <span className="muted">built-in</span>}
            </header>
            {m.description && <p className="line muted">{m.description}</p>}
            {m.image && <code>{m.image}</code>}
            {!m.builtin && !m.image && !m.build_error && (
              <p className="line muted">Built on first use by a bot.</p>
            )}
            {m.build_error && <pre className="error">{m.build_error}</pre>}
          </div>
        ))}
      </div>
      {removing && (
        <ConfirmDialog
          text={`Delete machine ${removing.name}? Bots still using it must switch machines first.`}
          confirmLabel="Delete machine"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const target = removing;
            setRemoving(null);
            api(`/api/machines/${target.id}`, { method: "DELETE" })
              .then(reload)
              .catch((e) => alert(e.message));
          }}
        />
      )}
      {form && (
        <MachineModal
          machine={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}

export function MachineModal({
  machine,
  onClose,
  onSaved,
}: {
  machine: Machine | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(machine?.name ?? "");
  const [description, setDescription] = useState(machine?.description ?? "");
  const [dockerfile, setDockerfile] = useState(machine?.dockerfile ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty =
    name !== (machine?.name ?? "") ||
    description !== (machine?.description ?? "") ||
    dockerfile !== (machine?.dockerfile ?? "");
  const attemptClose = useDiscardGuard(
    machine ? `machine ${machine.name}` : "this new machine",
    dirty,
    onClose,
  );

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Close"
        onClick={attemptClose}
      />
      <div className="dialog" role="dialog" aria-label="Machine">
        <h2>{machine ? "Edit machine" : "Add machine"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api(
                machine ? `/api/machines/${machine.id}` : "/api/machines",
                {
                  method: machine ? "PATCH" : "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ name, description, dockerfile }),
                },
              );
              onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Description (optional)
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Dockerfile
            <textarea
              className="code"
              rows={14}
              spellCheck={false}
              placeholder={
                "FROM ghcr.io/tehzevo/bots-sandbox:latest\nRUN apt-get update && apt-get install -y ripgrep"
              }
              value={dockerfile}
              onChange={(e) => setDockerfile(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : machine ? "Save" : "Create"}
            </button>
            <UnsavedNote dirty={dirty} />
            <button type="button" onClick={attemptClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TemplateEditorModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Omit<Template, "id" | "created_at"> & { id?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [machineId, setMachineId] = useState(initial.machine_id ?? "");
  const [roleId, setRoleId] = useState(initial.role_id ?? "");
  const [triggers, setTriggers] = useState<TemplateTrigger[]>(initial.triggers);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const snap = useRef({
    name: initial.name,
    description: initial.description,
    instructions: initial.instructions,
    machine_id: initial.machine_id ?? "",
    role_id: initial.role_id ?? "",
    triggers: JSON.stringify(initial.triggers),
  }).current;
  const dirty =
    name !== snap.name ||
    description !== snap.description ||
    instructions !== snap.instructions ||
    machineId !== snap.machine_id ||
    roleId !== snap.role_id ||
    JSON.stringify(triggers) !== snap.triggers;
  const attemptClose = useDiscardGuard(
    initial.id ? `template ${initial.name}` : "this new template",
    dirty,
    onClose,
  );

  useEffect(() => {
    void api<Role[]>("/api/roles").then(setRoles, () => setRoles([]));
    void api<Machine[]>("/api/machines")
      .then((ms) => setMachines(ms.filter((m) => !m.builtin)))
      .catch(() => setMachines([]));
  }, []);

  const missing = [
    machineId && !machines.some((m) => m.id === machineId) ? "machine" : null,
    roleId && !roles.some((r) => r.id === roleId) ? "role" : null,
  ].filter(Boolean);

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Cancel"
        onClick={attemptClose}
      />
      <form
        className="dialog narrow"
        role="dialog"
        aria-label="Template"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const body = JSON.stringify({
              name,
              description,
              instructions,
              machine_id: machineId || null,
              role_id: roleId || null,
              triggers,
            });
            await api(
              initial.id ? `/api/templates/${initial.id}` : "/api/templates",
              {
                method: initial.id ? "PATCH" : "POST",
                headers: { "content-type": "application/json" },
                body,
              },
            );
            onSaved();
          } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        <div className="viewhead">
          <h2>{initial.id ? "Edit template" : "New template"}</h2>
          <button
            type="button"
            className="close"
            aria-label="Cancel"
            onClick={attemptClose}
          >
            ×
          </button>
        </div>
        <input
          placeholder="template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          placeholder="description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <textarea
          placeholder="instructions (optional)"
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        {missing.length > 0 && (
          <p className="warnline">
            ⚠ referenced {missing.join(" and ")} deleted
          </p>
        )}
        <p className="rolepick">
          Role{" "}
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">None</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </p>
        <p className="rolepick">
          Machine{" "}
          <select
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
          >
            <option value="">Default</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </p>
        <p className="muted">Starter triggers</p>
        {triggers.map((t, i) => (
          <div className="keyrow" key={i}>
            <input
              placeholder="message"
              value={t.message}
              onChange={(e) =>
                setTriggers((ts) =>
                  ts.map((x, j) =>
                    j === i ? { ...x, message: e.target.value } : x,
                  ),
                )
              }
            />
            <input
              className="sched"
              placeholder="@every 1h"
              value={t.schedule}
              onChange={(e) =>
                setTriggers((ts) =>
                  ts.map((x, j) =>
                    j === i ? { ...x, schedule: e.target.value } : x,
                  ),
                )
              }
            />
            <button
              type="button"
              aria-label={`Remove trigger ${i + 1}`}
              onClick={() => setTriggers((ts) => ts.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setTriggers((ts) => [...ts, { message: "", schedule: "@every 1h" }])
          }
        >
          Add trigger
        </button>
        <div className="actions">
          <button type="submit" disabled={busy}>
            Save
          </button>
          <UnsavedNote dirty={dirty} />
          <button type="button" onClick={attemptClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function TemplatesPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<
    (Omit<Template, "id" | "created_at"> & { id?: string }) | null
  >(null);
  const [removing, setRemoving] = useState<Template | null>(null);

  const reload = useCallback(
    () =>
      api<Template[]>("/api/templates")
        .then(setTemplates)
        .catch(() => setTemplates([])),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section>
      <div className="viewhead">
        <h2>Templates</h2>
        <button
          type="button"
          onClick={() =>
            setEditing({
              name: "",
              description: "",
              instructions: "",
              machine_id: null,
              role_id: null,
              triggers: [],
            })
          }
        >
          Add template
        </button>
      </div>
      <div className="mcpsection">
        {templates.length === 0 && (
          <p className="muted">No templates yet — add one above.</p>
        )}
        {templates.map((t) => (
          <div className="mcpsrv" key={t.id}>
            <header>
              <strong>{t.name}</strong>
              <button type="button" onClick={() => setEditing(t)}>
                Edit
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => setRemoving(t)}
              >
                Delete
              </button>
            </header>
            {t.description && <p className="muted">{t.description}</p>}
            <p className="muted">
              {t.triggers.length} starter trigger
              {t.triggers.length === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>
      {removing && (
        <ConfirmDialog
          text={`Delete template ${removing.name}? Bots created from it are untouched.`}
          confirmLabel="Delete template"
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            void api(`/api/templates/${removing.id}`, { method: "DELETE" })
              .then(reload)
              .catch((e) => alert(e.message))
              .finally(() => setRemoving(null))
          }
        />
      )}
      {editing && (
        <TemplateEditorModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}
