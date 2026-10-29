import {
  type CSSProperties,
  createContext,
  type ReactElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PasswordSettings, SessionSettings } from "./auth.tsx";
import { renderMarkdown } from "./markdown.ts";
import { ensurePushSubscription, PushSection } from "./push.tsx";
import { readStoredTheme, setStoredTheme } from "./theme.ts";

export interface ApiKey {
  id: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
}

interface HookDestination {
  id: string;
  name: string;
  url: string;
  event_types: string[];
  enabled: number;
  created_at: number;
  has_secret: boolean;
}

interface HookTestResult {
  ok: boolean;
  status: number | null;
  duration_ms: number;
  error: string | null;
}

const HOOK_EVENT_OPTIONS: [string, string][] = [
  ["run.finished", "Run finished"],
  ["bot.blocked", "Bot blocked"],
  ["bot.recovered", "Bot recovered"],
  ["notification.created", "Notification created"],
  ["breaker.tripped", "Breaker tripped"],
];

interface Bot {
  id: string;
  name: string;
  instructions: string;
  model_id: string | null;
  role_id: string | null;
  role_name?: string | null;
  tag_ids?: string[];
  machine_id: string | null;
  avatar_shape: number | null;
  avatar_color: number | null;
  sound: string | null;
  enabled: number;
  archived: number;
  created_at: number;
  run_state: "running" | "enabled" | "disabled";
  health: "green" | "blue" | "yellow" | "red" | "gray";
  status: string | null;
  status_level: "ok" | "issue" | "blocked" | null;
  current_task: string | null;
  current_task_updated_at: number | null;
  watchdog_hours?: number | null;
}

export interface OptimisticRunState {
  run_state: "running" | "enabled";
  health: "green" | "blue";
  authoritativeAt: number;
  expiresAt: number;
}

export type OptimisticRunStates = Record<string, OptimisticRunState>;

const OPTIMISTIC_RUN_GRACE_MS = 2000;
const OPTIMISTIC_RUN_MAX_MS = 60000;

export function optimisticRunUpdate(
  run_state: "running" | "enabled",
): OptimisticRunState {
  const at = Date.now();
  return {
    run_state,
    health: run_state === "running" ? "green" : "blue",
    authoritativeAt: at + OPTIMISTIC_RUN_GRACE_MS,
    expiresAt: at + OPTIMISTIC_RUN_MAX_MS,
  };
}

export function applyOptimisticRunStates(
  rows: Bot[],
  overrides: OptimisticRunStates,
  now = Date.now(),
): { rows: Bot[]; overrides: OptimisticRunStates } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const kept: OptimisticRunStates = {};
  for (const [id, override] of Object.entries(overrides)) {
    if (now >= override.expiresAt) continue;
    const current = byId.get(id);
    if (!current || current.run_state === override.run_state) continue;
    if (now >= override.authoritativeAt) continue;
    kept[id] = override;
  }
  return {
    rows: rows.map((row) =>
      kept[row.id]
        ? {
            ...row,
            run_state: kept[row.id].run_state,
            health: kept[row.id].health,
          }
        : row,
    ),
    overrides: kept,
  };
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

interface Tag {
  id: string;
  name: string;
  created_at: number;
  bot_count: number;
}

interface Run {
  id: string;
  status: "running" | "ok" | "error";
  trigger: "schedule" | "manual" | "chat" | "webhook" | "dm" | "continuous";
  started_at: number;
  finished_at: number | null;
  output: string | null;
  error: string | null;
}

// specs/runs/drill-down.md — inline transcript replay under a Logs row.
interface TranscriptStep {
  kind: "user" | "assistant" | "tool_call" | "tool_result";
  name?: string;
  text?: string;
  args?: string;
  duration_ms?: number | null;
  is_error?: boolean;
  retry_wait_ms?: number;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 60
    ? `${s.toFixed(1)}s`
    : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function ReplayStep({
  step,
  running = false,
  busy = false,
  onRerun,
}: {
  step: TranscriptStep;
  running?: boolean;
  busy?: boolean;
  onRerun?: (message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const clipped = step.kind === "tool_result" || step.kind === "tool_call";
  const toggle = () => setOpen(!open);
  const keyToggle = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  const clipProps = clipped
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick: toggle,
        onKeyDown: keyToggle,
      }
    : {};

  async function copyText(): Promise<void> {
    if (!step.text || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(step.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard access is best effort
    }
  }

  const showRun = step.kind === "user" && onRerun !== undefined;
  const showCopy =
    (step.kind === "assistant" || step.kind === "tool_result") && !!step.text;

  return (
    <div className={`rstep ${step.kind}${step.is_error ? " err" : ""}`}>
      <div className="rmeta">
        <span className={`rkind ${step.kind}`}>
          {step.kind.replace("_", " ")}
        </span>
        {step.name && <span className="rname">{step.name}</span>}
        {typeof step.duration_ms === "number" && (
          <span className="rtiming">{fmtMs(step.duration_ms)}</span>
        )}
        {!!step.retry_wait_ms && (
          <span className="rretry">retry wait {fmtMs(step.retry_wait_ms)}</span>
        )}
        {(showRun || showCopy) && (
          <span className="ractions">
            {showCopy && (
              <button type="button" onClick={() => void copyText()}>
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            {showRun && (
              <button
                type="button"
                disabled={running || busy}
                title={running ? "The bot is already running" : undefined}
                onClick={() => void onRerun(step.text ?? "")}
              >
                Run this
              </button>
            )}
          </span>
        )}
      </div>
      {step.args && (
        <pre
          className={`rcode${clipped && !open ? " clip" : ""}`}
          {...clipProps}
        >
          {step.args}
        </pre>
      )}
      {step.text &&
        (step.kind === "tool_result" ? (
          <pre
            className={`rcode${clipped && !open ? " clip" : ""}`}
            {...clipProps}
          >
            {step.text}
          </pre>
        ) : (
          <p className="rtext">{step.text}</p>
        ))}
    </div>
  );
}

function ReplayPanel({
  botId,
  run,
  running = false,
  onRerun,
}: {
  botId: string;
  run: Run;
  running?: boolean;
  onRerun?: (message: string) => Promise<void>;
}) {
  const [data, setData] = useState<{
    usage: { total: number } | null;
    steps: TranscriptStep[];
  } | null>(null);
  const [rerunning, setRerunning] = useState(false);
  useEffect(() => {
    let on = true;
    api<{
      usage: { total: number } | null;
      steps: TranscriptStep[];
    }>(`/api/bots/${botId}/runs/${run.id}/transcript`)
      .then((d) => on && setData(d))
      .catch(() => on && setData({ usage: null, steps: [] }));
    return () => {
      on = false;
    };
  }, [botId, run.id]);
  if (!data) return <p className="muted replay">Loading transcript…</p>;

  async function rerun(message: string): Promise<void> {
    if (!onRerun || running || rerunning) return;
    setRerunning(true);
    try {
      await onRerun(message);
    } finally {
      setRerunning(false);
    }
  }

  return (
    <div className="replay">
      <header>
        <span className={`status ${run.status}`}>{run.status}</span>
        <span>{run.trigger}</span>
        {data.usage && <span>{data.usage.total.toLocaleString()} tokens</span>}
      </header>
      {data.steps.length === 0 ? (
        <p className="muted">transcript not recorded</p>
      ) : (
        // biome-ignore lint/suspicious/noArrayIndexKey: transcript steps are append-only, position is their identity
        data.steps.map((s, i) => (
          <ReplayStep
            key={i}
            step={s}
            running={running}
            busy={rerunning}
            onRerun={onRerun ? rerun : undefined}
          />
        ))
      )}
    </div>
  );
}

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  bot_id: string | null;
  run_id?: string | null;
  target_path?: string | null;
  read: number;
  created_at: number;
}

interface NotificationsResponse {
  items: NotificationItem[];
  unread_count: number;
}

interface Trigger {
  id: string;
  kind: "schedule" | "webhook" | "continuous";
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
      style={{ "--dot-delay": `${delay}s` } as CSSProperties}
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
  const baseCol = color == null ? avatarColor(id) : AVATAR_COLORS[color];
  const col = health === "gray" ? "#6b7280" : baseCol;
  const glow =
    health === "red" || health === "gray" ? "transparent" : `${baseCol}59`;
  const blinkPeriod = 3 + rand() * 5;
  const animClass = health === null ? "" : ` anim-${health}`;
  return (
    <span
      className={`avatar${animClass}`}
      style={{
        color: col,
        ["--avatar-glow" as string]: glow,
        ["--avatar-glow-strong" as string]: `${baseCol}a6`,
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

export function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export interface Breaker {
  limit_tokens: number;
  tokens_30d: number;
  exceeded: boolean;
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

type BotModalTab = "general" | "triggers" | "logs" | "stats" | "files";

const BOT_MODAL_TABS: readonly string[] = [
  "general",
  "triggers",
  "logs",
  "stats",
  "files",
];

interface RouteSnapshot {
  tab: Tab;
  chatBotId: string | null;
  detailOpen: boolean;
  openBotId: string | null;
  modalTab: BotModalTab;
  replayRunId: string | null;
}

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

function routeHref(route: RouteSnapshot): string {
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
    if (!target || !target.enabled || paused || target.run_state === "running")
      return;
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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<PendingEntityEdit | null>(
    null,
  );
  const seenNotifIds = useRef<Set<string> | null>(null);
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

  const load = useCallback(async () => {
    try {
      const [
        botData,
        notificationData,
        roleData,
        tagData,
        pauseData,
        breakerData,
      ] = await Promise.all([
        api<Bot[]>(`/api/bots${includeArchived ? "?archived=1" : ""}`),
        api<NotificationsResponse>("/api/notifications"),
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
      setTags(tagData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [includeArchived]);

  useEffect(() => {
    void load();
    void ensurePushSubscription().catch(() => undefined);
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!detailOpen) setAvatarMenu(false);
  }, [detailOpen]);

  useEffect(() => {
    const nextModalTab = modalTabOverride.current ?? "general";
    modalTabOverride.current = null;
    setModalTab(nextModalTab);
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

  const botFilter = botQuery.trim().toLowerCase();
  const visibleBots = bots.filter(
    (bot) =>
      (statusSel.length === 0 || statusSel.includes(bot.health)) &&
      (roleSel.length === 0 || roleSel.includes(bot.role_id ?? "")) &&
      (tagSel.length === 0 ||
        (bot.tag_ids ?? []).some((t) => tagSel.includes(t))) &&
      (!botFilter || bot.name.toLowerCase().includes(botFilter)),
  );

  function toggleIn<T>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
  }

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
            {paused && (
              <>
                {" "}
                ·{" "}
                <span className="pausedcount">
                  {pauseReason === "breaker" && breaker
                    ? `over spend cap (${fmtTokens(breaker.tokens_30d)} / ${fmtTokens(breaker.limit_tokens)})`
                    : "paused"}
                </span>
              </>
            )}
          </span>
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
                .catch((e) => alert(e instanceof Error ? e.message : String(e)))
            }
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="stopall"
            aria-label="Stop all bots"
            title="Interrupt every running bot and pause everything (panic button)"
            onClick={() => setStopAllConfirm(true)}
          >
            Stop all
          </button>
          <button
            type="button"
            className="searchtoggle"
            aria-label="Open search"
            title="Search records or run commands (backtick)"
            onClick={() => setSearchOpen(true)}
          >
            Search
            <kbd className="searchshortcut" aria-hidden="true">
              `
            </kbd>
          </button>
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
                      {notifications.map((notification) => {
                        const target = notificationTargetPathFor(notification);
                        return (
                          <li
                            key={notification.id}
                            className={notification.read ? "" : "unread"}
                          >
                            <button
                              type="button"
                              className="notifbody"
                              disabled={!target && notification.read !== 0}
                              title={target ? "Open source" : "Mark as read"}
                              onClick={() => openNotification(notification)}
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
                        );
                      })}
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
                  {tags.length > 0 && (
                    <details className="filterdd">
                      <summary
                        aria-label={`Tag filter: ${tagSel.length === 0 ? "All" : `${tagSel.length} selected`}`}
                      >
                        Tag:{" "}
                        {tagSel.length === 0
                          ? "All"
                          : tagSel
                              .map(
                                (id) =>
                                  tags.find((t) => t.id === id)?.name ?? "?",
                              )
                              .join(", ")}
                      </summary>
                      <div className="filterpanel">
                        {tags.map((t) => (
                          <label key={t.id} data-name={t.name}>
                            <input
                              type="checkbox"
                              checked={tagSel.includes(t.id)}
                              onChange={() =>
                                setTagSel((v) => toggleIn(v, t.id))
                              }
                            />{" "}
                            {t.name}
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                  <label className="filtertoggle">
                    <input
                      type="checkbox"
                      checked={includeArchived}
                      onChange={(e) => setIncludeArchived(e.target.checked)}
                    />{" "}
                    Include archived
                  </label>
                </div>
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
            <div className="modal">
              <button
                type="button"
                className="mscrim"
                aria-label="Close details"
                onClick={requestCloseDetails}
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
                  {openBotRow.archived ? (
                    <span className="archivebadge detailarchive">Archived</span>
                  ) : null}
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
                  <div className="detailhead-actions">
                    <label className="switch">
                      <input
                        type="checkbox"
                        aria-label="Bot enabled"
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
                      />
                      <span className="knob" />
                      <span className="state">
                        {openBotRow.archived || !openBotRow.enabled
                          ? "Disabled"
                          : "Enabled"}
                      </span>
                    </label>
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
                      ×
                    </button>
                  </div>
                </div>
                <nav className="mtabs">
                  {(
                    ["general", "triggers", "logs", "stats", "files"] as const
                  ).map((t) => (
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
                      onCancel={requestCloseDetails}
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
                          {run.error && (
                            <pre className="error">{run.error}</pre>
                          )}
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

export function KebabIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
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
  | "tags"
  | "secrets"
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
  tags: "/tags",
  secrets: "/secrets",
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

function TagIcon({ size = 18 }: { size?: number }) {
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
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <circle cx="7" cy="7" r="1.2" />
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
  { id: "tags", label: "Tags", Icon: TagIcon },
  { id: "secrets", label: "Secrets", Icon: KeyIcon },
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

interface Provider {
  id: string;
  name: string;
  base_url: string;
  models: string[];
  has_key: boolean;
  builtin?: boolean;
}

interface BotGeneralSettings {
  default_provider_id: string | null;
  default_model: string | null;
}

type SettingsTab = "general" | "providers" | "system";

const SETTINGS_TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "providers", label: "Providers" },
  { id: "system", label: "System" },
];

function settingsHref(tab: SettingsTab): string {
  return tab === "general" ? "/settings" : `/settings?tab=${tab}`;
}

function settingsTabFromLocation(): SettingsTab {
  if (typeof location === "undefined") return "general";
  const value = new URLSearchParams(location.search).get("tab");
  return SETTINGS_TABS.some((x) => x.id === value)
    ? (value as SettingsTab)
    : "general";
}

export function SettingsPanel() {
  const guard = useNavGuard();
  const [sub, setSub] = useState<SettingsTab>(settingsTabFromLocation);
  const subRef = useRef(sub);

  useEffect(() => {
    subRef.current = sub;
  }, [sub]);

  useEffect(() => {
    if (typeof addEventListener === "undefined") return;
    const onPop = () => {
      if (location.pathname.replace(/\/+$/, "") !== "/settings") return;
      const target = settingsTabFromLocation();
      if (target === subRef.current) return;
      if (anyDirtyLabel())
        history.pushState({}, "", settingsHref(subRef.current));
      guard(() => setSub(target));
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [guard]);

  const switchTab = (next: SettingsTab) => {
    if (next === sub) return;
    guard(() => {
      setSub(next);
      if (typeof history !== "undefined")
        history.pushState({}, "", settingsHref(next));
    });
  };

  return (
    <section>
      <div className="mainhead">
        <h2>Settings</h2>
      </div>
      <nav className="mtabs" aria-label="Settings sections">
        {SETTINGS_TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            className={sub === x.id ? "sel" : ""}
            onClick={() => switchTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </nav>
      <div
        className="tabbody settingstab"
        role="tabpanel"
        aria-label={`${sub[0].toUpperCase()}${sub.slice(1)} settings`}
      >
        {sub === "general" && <SettingsGeneral key="general" />}
        {sub === "providers" && <SettingsProviders key="providers" />}
        {sub === "system" && <SettingsSystem key="system" />}
      </div>
    </section>
  );
}

export function SettingsGeneral() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [idle, setIdle] = useState(5);
  const [savedIdle, setSavedIdle] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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

  const [cap, setCap] = useState(0);
  const [savedCap, setSavedCap] = useState<number | null>(null);
  const [usage30d, setUsage30d] = useState(0);
  const [savingCap, setSavingCap] = useState(false);

  useEffect(() => {
    void api<Breaker>("/api/breaker")
      .then((b) => {
        setCap(b.limit_tokens);
        setSavedCap(b.limit_tokens);
        setUsage30d(b.tokens_30d);
      })
      .catch(() => {});
  }, []);

  const capDirty = savedCap !== null && cap !== savedCap;
  useDirtyGuard("the spend circuit breaker cap", capDirty);

  const saveCap = async () => {
    setSavingCap(true);
    try {
      const b = await api<Breaker>("/api/breaker", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit_tokens: cap }),
      });
      setSavedCap(b.limit_tokens);
      setUsage30d(b.tokens_30d);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCap(false);
    }
  };

  const [soundsOn, setSoundsOn] = useState(
    () => localStorage.getItem("bots-sounds") === "on",
  );

  const pickTheme = (t: Theme) => {
    setStoredTheme(t);
    setTheme(t);
  };

  return (
    <>
      <PasswordSettings />
      <p className="muted">Theme</p>
      <div className="themegroup" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            className={t === theme ? "sel" : ""}
            onClick={() => pickTheme(t)}
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
          aria-label="Sandbox idle timeout"
          value={idle}
          onChange={(e) => setIdle(Number(e.target.value))}
        />
        minutes
        <button type="button" disabled={saving} onClick={() => void saveIdle()}>
          Save
        </button>
        <UnsavedNote dirty={idleDirty} />
      </div>
      <p className="muted">Spend circuit breaker cap</p>
      <div className="actions">
        <input
          type="number"
          min={0}
          aria-label="Spend circuit breaker token cap"
          value={cap}
          onChange={(e) =>
            setCap(Math.max(0, Math.floor(Number(e.target.value) || 0)))
          }
        />
        tokens / trailing 30 days (0 = unlimited · {fmtTokens(usage30d)} used)
        <button
          type="button"
          disabled={savingCap}
          onClick={() => void saveCap()}
        >
          Save
        </button>
        <UnsavedNote dirty={capDirty} />
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
      <PushSection />
    </>
  );
}

export function SettingsProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(
    null,
  );
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formProvider, setFormProvider] = useState<Provider | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Provider | null>(null);

  const loadProviders = useCallback(async () => {
    const [list, settings] = await Promise.all([
      api<Provider[]>("/api/providers").catch(() => [] as Provider[]),
      api<{ default_provider_id: string | null; default_model: string | null }>(
        "/api/settings",
      ).catch(() => null),
    ]);
    setProviders(list);
    if (settings) {
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

  return (
    <>
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
              {p.builtin ? (
                <span className="muted">built-in</span>
              ) : (
                <>
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
                </>
              )}
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
    </>
  );
}

export function SettingsSystem() {
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
    void api<{ control_mcp_enabled?: boolean }>("/api/settings")
      .then((settings) => setMcpEnabled(settings.control_mcp_enabled !== false))
      .catch(() => undefined);
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

  return (
    <>
      <SessionSettings />
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

      <ConfigBackupSection />

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

      <EventDestinationsSection />
    </>
  );
}

export function EventDestinationsSection() {
  const [destinations, setDestinations] = useState<HookDestination[]>([]);
  const [editing, setEditing] = useState<{
    destination: HookDestination | null;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HookDestination | null>(
    null,
  );
  const [testState, setTestState] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setDestinations(await api<HookDestination[]>("/api/hooks"));
    } catch {
      setDestinations([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setEnabled = async (destination: HookDestination, enabled: boolean) => {
    try {
      await api(`/api/hooks/${destination.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: destination.name,
          url: destination.url,
          event_types: destination.event_types,
          enabled,
        }),
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const sendTest = async (destination: HookDestination) => {
    setTestState((current) => ({ ...current, [destination.id]: "Sending…" }));
    try {
      const result = await api<HookTestResult>(
        `/api/hooks/${destination.id}/test`,
        {
          method: "POST",
        },
      );
      const status = result.status ?? (result.ok ? "ok" : "error");
      setTestState((current) => ({
        ...current,
        [destination.id]: `${status} · ${result.duration_ms} ms${result.error ? ` · ${result.error}` : ""}`,
      }));
    } catch (e) {
      setTestState((current) => ({
        ...current,
        [destination.id]: e instanceof Error ? e.message : String(e),
      }));
    }
  };

  const remove = async (destination: HookDestination) => {
    try {
      await api(`/api/hooks/${destination.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <p className="muted">Event destinations</p>
      <ul className="plist">
        {destinations.map((destination) => (
          <li key={destination.id}>
            <div className="pinfo">
              <strong>{destination.name}</strong>
              <span className="muted">{destination.url}</span>
              <span className="muted">
                {destination.event_types.length > 0
                  ? destination.event_types
                      .map(
                        (type) =>
                          HOOK_EVENT_OPTIONS.find(
                            ([value]) => value === type,
                          )?.[1] ?? type,
                      )
                      .join(", ")
                  : "No events"}
              </span>
              <span className="muted">
                Secret: {destination.has_secret ? "••••" : "not set"}
              </span>
            </div>
            <div className="actions">
              <button
                type="button"
                disabled={
                  testState[destination.id] === "Sending…" ||
                  destination.enabled !== 1
                }
                onClick={() => void sendTest(destination)}
              >
                Send test
              </button>
              {testState[destination.id] && (
                <span className="state">{testState[destination.id]}</span>
              )}
              <button type="button" onClick={() => setEditing({ destination })}>
                Edit
              </button>
              <button
                type="button"
                onClick={() =>
                  void setEnabled(destination, destination.enabled !== 1)
                }
              >
                {destination.enabled === 1 ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(destination)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" onClick={() => setEditing({ destination: null })}>
          Add destination
        </button>
      </div>

      {editing && (
        <EventDestinationModal
          destination={editing.destination}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          text={`Delete ${confirmDelete.name}? Delivery logs are removed too.`}
          confirmLabel="Delete destination"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void remove(confirmDelete)}
        />
      )}
    </>
  );
}

function EventDestinationModal({
  destination,
  onClose,
  onSaved,
}: {
  destination: HookDestination | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(destination?.name ?? "");
  const [url, setUrl] = useState(destination?.url ?? "");
  const [secret, setSecret] = useState("");
  const [eventTypes, setEventTypes] = useState<string[]>(
    destination?.event_types ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== (destination?.name ?? "") ||
    url !== (destination?.url ?? "") ||
    secret !== "" ||
    eventTypes.join(",") !== (destination?.event_types ?? []).join(",");
  const attemptClose = useDiscardGuard(
    destination ? `destination ${destination.name}` : "this new destination",
    dirty,
    onClose,
  );

  let validUrl: URL | null = null;
  try {
    validUrl = url.trim() ? new URL(url.trim()) : null;
  } catch {
    validUrl = null;
  }
  const canSave = Boolean(
    name.trim() &&
      (validUrl?.protocol === "http:" || validUrl?.protocol === "https:"),
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        url: url.trim(),
        event_types: eventTypes,
      };
      if (secret !== "") body.secret = secret;
      await api(destination ? `/api/hooks/${destination.id}` : "/api/hooks", {
        method: destination ? "PUT" : "POST",
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
          <h2>
            {destination ? `Edit ${destination.name}` : "Add destination"}
          </h2>
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
          <input
            aria-label="Destination name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          URL
          <input
            aria-label="Destination URL"
            placeholder="https://example.com/hooks/bots"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className="field">
          Secret
          <input
            type="password"
            aria-label="Destination secret"
            placeholder={
              destination?.has_secret ? "saved — leave empty to keep" : ""
            }
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
        <p className="muted">Events</p>
        <ul className="modellist">
          {HOOK_EVENT_OPTIONS.map(([value, label]) => (
            <li key={value}>
              <label>
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={eventTypes.includes(value)}
                  onChange={() =>
                    setEventTypes((current) =>
                      current.includes(value)
                        ? current.filter((x) => x !== value)
                        : [...current, value],
                    )
                  }
                />{" "}
                {label}
              </label>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button
            type="button"
            disabled={busy || !canSave}
            onClick={() => void save()}
          >
            {busy
              ? "Saving…"
              : destination
                ? "Save destination"
                : "Add destination"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CONFIG_REPORT_ORDER = [
  "bots",
  "roles",
  "skills",
  "mcp_servers",
  "projects",
  "tags",
  "teams",
  "templates",
  "secrets",
  "api_keys",
];

const CONFIG_REPORT_LABELS: Record<string, string> = {
  bots: "Bots",
  roles: "Roles",
  skills: "Skills",
  mcp_servers: "MCP servers",
  projects: "Projects",
  tags: "Tags",
  teams: "Teams",
  templates: "Templates",
  secrets: "Secrets",
  api_keys: "API keys",
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatConfigBackupReport(value: unknown): string[] {
  if (!isJsonObject(value) || !isJsonObject(value.report)) return [];
  const report = value.report as Record<string, unknown>;
  const keys = [
    ...CONFIG_REPORT_ORDER.filter((key) => key in report),
    ...Object.keys(report)
      .filter((key) => !CONFIG_REPORT_ORDER.includes(key))
      .sort(),
  ];
  return keys.map((key) => {
    const counts = isJsonObject(report[key]) ? report[key] : {};
    const created = typeof counts.created === "number" ? counts.created : 0;
    const updated = typeof counts.updated === "number" ? counts.updated : 0;
    const label = CONFIG_REPORT_LABELS[key] ?? key.replace(/_/g, " ");
    return `${label}: ${created} created, ${updated} updated`;
  });
}

export function configRestoreBody(
  snapshot: unknown,
  secretValues: Record<string, string>,
): unknown {
  if (Object.keys(secretValues).length === 0) return snapshot;
  return { config: snapshot, secret_values: secretValues };
}

export function configBackupGeneratedKeys(value: unknown): [string, string][] {
  if (!isJsonObject(value) || !isJsonObject(value.api_key_values)) return [];
  const values = value.api_key_values as Record<string, unknown>;
  return Object.entries(values).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
}

export function ConfigBackupSection() {
  const [includeValues, setIncludeValues] = useState(false);
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportLines, setReportLines] = useState<string[]>([]);
  const [generatedKeys, setGeneratedKeys] = useState<[string, string][]>([]);
  const [missingSecrets, setMissingSecrets] = useState<string[]>([]);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});

  async function exportConfig(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await api<unknown>(
        `/api/backup/config?include_values=${includeValues ? "true" : "false"}`,
      );
      const blob = new Blob([`${JSON.stringify(result, null, 2)}\n`], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bots-config-${new Date().toISOString().replace(/:/g, "-")}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function restoreConfig(): Promise<void> {
    if (snapshot === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/backup/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(configRestoreBody(snapshot, secretValues)),
      });
      const result = (await res.json()) as unknown;
      if (!res.ok) {
        setError(
          isJsonObject(result) && typeof result.error === "string"
            ? result.error
            : `${res.status}`,
        );
        const missing =
          isJsonObject(result) && Array.isArray(result.missing_secret_names)
            ? result.missing_secret_names.filter(
                (x): x is string => typeof x === "string",
              )
            : [];
        setMissingSecrets(missing);
        setSecretValues(
          Object.fromEntries(
            missing.map((name) => [name, secretValues[name] ?? ""]),
          ),
        );
        return;
      }
      setReportLines(formatConfigBackupReport(result));
      setGeneratedKeys(configBackupGeneratedKeys(result));
      setMissingSecrets([]);
      setSecretValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const restoreDisabled =
    busy ||
    snapshot === null ||
    missingSecrets.some((name) => !secretValues[name]?.trim());

  return (
    <div className="backupconfig">
      <p className="muted">Configuration backup</p>
      <div className="actions">
        <label className="switch">
          <span id="secret-values-export-label">Secret values in export</span>
          <input
            type="checkbox"
            aria-labelledby="secret-values-export-label"
            checked={includeValues}
            onChange={() => setIncludeValues((current) => !current)}
          />
          <span className="knob" />
          <span className="state">
            {includeValues ? "Included" : "Names only"}
          </span>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportConfig()}
        >
          Export config
        </button>
      </div>
      <p className="muted">
        Secret values are omitted by default and stay server-side during
        restore.
      </p>

      <div className="actions">
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Configuration backup file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setFileName(file.name);
            setSnapshot(null);
            setError(null);
            setReportLines([]);
            setGeneratedKeys([]);
            setMissingSecrets([]);
            setSecretValues({});
            void file.text().then(
              (text) => {
                try {
                  setSnapshot(JSON.parse(text));
                } catch {
                  setError("restore file must contain valid JSON");
                }
              },
              () => setError("could not read backup file"),
            );
          }}
        />
        <button
          type="button"
          disabled={restoreDisabled}
          onClick={() => void restoreConfig()}
        >
          Restore config
        </button>
      </div>
      {fileName && <p className="muted">Selected: {fileName}</p>}

      {missingSecrets.length > 0 && (
        <>
          <p className="muted">
            Add the missing secret values to complete restore.
          </p>
          <div className="backupsecretrows">
            {missingSecrets.map((name) => (
              <label key={name} className="keyrow backupsecretrow">
                <span>{name}</span>
                <input
                  type="password"
                  aria-label={`Secret value for ${name}`}
                  autoComplete="off"
                  value={secretValues[name] ?? ""}
                  onChange={(event) =>
                    setSecretValues((current) => ({
                      ...current,
                      [name]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </>
      )}

      {error && <p className="muted">{error}</p>}
      {reportLines.length > 0 && (
        <>
          <p className="muted">Restore report</p>
          <ul className="plist">
            {reportLines.map((line) => (
              <li key={line}>
                <div className="pinfo">{line}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      {generatedKeys.length > 0 && (
        <>
          <p className="keyreveal">New API keys — shown once:</p>
          <ul className="plist">
            {generatedKeys.map(([name, value]) => (
              <li key={name}>
                <div className="pinfo">
                  <strong>{name}</strong>
                  <code>{value}</code>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
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
  const [confirmRotate, setConfirmRotate] = useState(false);
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

  const requestSave = () => {
    if (provider?.has_key && apiKey !== "") {
      setConfirmRotate(true);
      return;
    }
    void save();
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
            onClick={requestSave}
          >
            Save provider
          </button>
        </div>
      </div>
      {confirmRotate && provider && (
        <ConfirmDialog
          text={`Rotate the API key for ${provider.name}? The current key stops working immediately — existing integrations break until updated.`}
          confirmLabel="Rotate key"
          onCancel={() => setConfirmRotate(false)}
          onConfirm={() => {
            setConfirmRotate(false);
            void save();
          }}
        />
      )}
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

export function TeamsPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
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

  useEffect(() => {
    if (!openId) return;
    const team = teams.find((candidate) => candidate.id === openId);
    if (!team) return;
    setSelTeamId(team.id);
    setCreating(false);
    onOpened?.();
  }, [onOpened, openId, teams]);

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

export function ProjectsPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
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

  useEffect(() => {
    if (!openId) return;
    const project = projects.find((candidate) => candidate.id === openId);
    if (!project) return;
    setSelProject(project);
    setCreating(false);
    onOpened?.();
  }, [onOpened, openId, projects]);

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

export function RolesPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
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

  useEffect(() => {
    if (!openId) return;
    const role = roles.find((candidate) => candidate.id === openId);
    if (!role) return;
    setFormRole(role);
    setCreating(false);
    onOpened?.();
  }, [onOpened, openId, roles]);

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
  const [roleTab, setRoleTab] = useState<"general" | "mcp" | "skills">(
    "general",
  );
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
          {(
            [
              ["general", "General"],
              ["mcp", "MCP"],
              ["skills", "Skills"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={roleTab === id ? "sel" : ""}
              onClick={() => setRoleTab(id)}
            >
              {label}
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
        {roleTab === "mcp" && (
          <div className="grantlist">
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
          </div>
        )}
        {roleTab === "skills" && (
          <div className="grantlist">
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

interface UsageTotals {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  total: number;
}

function pctOf(tokens: number, window: number): number {
  if (!window || window <= 0) return 0;
  return Math.min(100, Math.round((tokens / window) * 100));
}

const CTX_ROWS: [
  string,
  "system_prompt" | "tools" | "conversation" | "free",
  string,
][] = [
  ["System prompt", "system_prompt", "sys"],
  ["Tool definitions", "tools", "tools"],
  ["Conversation", "conversation", "conv"],
  ["Free space", "free", "free"],
];

interface ContextBreakdownData {
  context_window: number | null;
  categories: {
    system_prompt: number;
    tools: number;
    conversation: number;
  };
  used: number;
  free: number | null;
}

const FILE_PREVIEW_LIMIT = 256 * 1024;

interface WorkspaceEntry {
  name: string;
  type: "dir" | "file";
  size_bytes: number;
  modified_at: number;
}

export function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

// specs/machines/workspace-browser.md — read-only browse of data/workspaces/<bot-id>.
export function BotFiles({ botId }: { botId: string }) {
  const [path, setPath] = useState("");
  const [data, setData] = useState<{
    path: string;
    entries: WorkspaceEntry[];
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<WorkspaceEntry | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    let active = true;
    void api<{ path: string; entries: WorkspaceEntry[] }>(
      `/api/bots/${botId}/workspace?path=${encodeURIComponent(path)}`,
    )
      .then((d) => active && setData(d))
      .catch(() => active && setData({ path, entries: [] }));
    return () => {
      active = false;
    };
  }, [botId, path, refreshKey]);

  const fileUrl = (p: string) =>
    `/api/bots/${botId}/workspace/file?path=${encodeURIComponent(p)}`;
  const joinPath = (name: string) => (path ? `${path}/${name}` : name);

  const openEntry = async (entry: WorkspaceEntry) => {
    if (entry.type === "dir") {
      setSelected(null);
      setPath(joinPath(entry.name));
      return;
    }
    setSelected(entry);
    setFileText(null);
    setBinary(false);
    setTruncated(false);
    if (entry.size_bytes > FILE_PREVIEW_LIMIT) return;
    setLoadingFile(true);
    try {
      const res = await fetch(fileUrl(joinPath(entry.name)));
      if (!res.ok) throw new Error(String(res.status));
      const buf = new Uint8Array(await res.arrayBuffer());
      setTruncated(buf.byteLength < entry.size_bytes);
      try {
        setFileText(new TextDecoder("utf-8", { fatal: true }).decode(buf));
      } catch {
        setBinary(true);
      }
    } catch {
      setBinary(true);
    } finally {
      setLoadingFile(false);
    }
  };

  const crumbs = path ? path.split("/") : [];
  return (
    <section>
      <div className="actions">
        <nav className="crumbs" aria-label="Workspace path">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setPath("");
            }}
          >
            workspace
          </button>
          {crumbs.map((seg, i) => (
            <span key={seg}>
              /{" "}
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setPath(crumbs.slice(0, i + 1).join("/"));
                }}
              >
                {seg}
              </button>
            </span>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setRefreshKey((k) => k + 1);
          }}
        >
          Refresh
        </button>
      </div>
      {(data?.entries.length ?? 0) === 0 && (
        <p className="muted">Empty directory.</p>
      )}
      {(data?.entries ?? []).map((entry) => (
        <div key={entry.name} className="filerow">
          <button type="button" onClick={() => void openEntry(entry)}>
            {entry.type === "dir" ? `${entry.name}/` : entry.name}
          </button>
          {entry.type === "file" && (
            <span className="muted">{fmtBytes(entry.size_bytes)}</span>
          )}
          <span className="muted">
            {new Date(entry.modified_at).toLocaleString()}
          </span>
        </div>
      ))}
      {selected && (
        <article className="fileview">
          <div className="actions">
            <strong>{selected.name}</strong>
            <a href={fileUrl(joinPath(selected.name))}>Download</a>
          </div>
          {selected.size_bytes > FILE_PREVIEW_LIMIT ? (
            <p className="muted">Larger than 256 KB — download only.</p>
          ) : loadingFile ? (
            <p className="muted">Loading…</p>
          ) : binary ? (
            <p className="muted">Binary file — download to inspect.</p>
          ) : (
            fileText !== null && (
              <>
                {truncated && <p className="muted">Truncated at 256 KB.</p>}
                <pre>{fileText}</pre>
              </>
            )
          )}
        </article>
      )}
    </section>
  );
}

export function BotStats({
  botId,
  running = false,
}: {
  botId: string;
  running?: boolean;
}) {
  const zero: UsageTotals = {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    total: 0,
  };
  const [totals, setTotals] = useState<{
    lifetime: UsageTotals;
    last30d: UsageTotals;
    budget: number | null;
  }>({ lifetime: zero, last30d: zero, budget: null });
  const [budgetText, setBudgetText] = useState("");
  const [budgetDirty, setBudgetDirty] = useState(false);

  const [ctx, setCtx] = useState<ContextBreakdownData | null>(null);

  useEffect(() => {
    let active = true;
    api<{
      lifetime: UsageTotals;
      last30d: UsageTotals;
      budget: number | null;
    }>(`/api/bots/${botId}/usage`)
      .then((data) => {
        if (!active) return;
        setTotals(data);
        setBudgetText(data.budget == null ? "" : String(data.budget));
        setBudgetDirty(false);
      })
      .catch(() => undefined);
    api<ContextBreakdownData>(`/api/bots/${botId}/context-usage`)
      .then((data) => {
        if (active) setCtx(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [botId]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      api<ContextBreakdownData>(`/api/bots/${botId}/context-usage`)
        .then(setCtx)
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [botId, running]);

  const saveBudget = async () => {
    const trimmed = budgetText.trim();
    const parsed = trimmed === "" ? null : Math.floor(Number(trimmed));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) return;
    await api(`/api/bots/${botId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token_budget: parsed }),
    }).catch(() => undefined);
    const data = await api<{
      lifetime: UsageTotals;
      last30d: UsageTotals;
      budget: number | null;
    }>(`/api/bots/${botId}/usage`).catch(() => null);
    if (data) {
      setTotals(data);
      setBudgetText(data.budget == null ? "" : String(data.budget));
    }
    setBudgetDirty(false);
  };

  const nf = new Intl.NumberFormat();
  const rows: [string, keyof UsageTotals][] = [
    ["Input", "input"],
    ["Output", "output"],
    ["Cache read", "cache_read"],
    ["Cache write", "cache_write"],
    ["Total", "total"],
  ];
  const budget = totals.budget;
  const pct =
    budget && budget > 0
      ? Math.min(100, Math.round((totals.last30d.total / budget) * 100))
      : 0;
  return (
    <section className="stats">
      {budget != null && (
        <div className="budgetbox">
          <div className="budgetline">
            <span>
              {nf.format(totals.last30d.total)} of {nf.format(budget)} tokens in
              the last 30 days ({pct}%)
            </span>
            {totals.last30d.total >= budget && (
              <span className="status error">exhausted</span>
            )}
          </div>
          <div className="budgetbar" aria-hidden="true">
            <div
              className={totals.last30d.total >= budget ? "fill over" : "fill"}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      <table className="usagetable">
        <thead>
          <tr>
            <th>Tokens</th>
            <th>Lifetime</th>
            <th>Last 30 days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key]) => (
            <tr key={key}>
              <td>{label}</td>
              <td>{nf.format(totals.lifetime[key])}</td>
              <td>{nf.format(totals.last30d[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="budgetedit">
        <label>
          30-day token budget
          <input
            type="number"
            min={1}
            step={1}
            value={budgetText}
            placeholder="unlimited"
            onChange={(e) => {
              setBudgetText(e.target.value);
              setBudgetDirty(true);
            }}
          />
        </label>
        <button
          type="button"
          disabled={!budgetDirty}
          onClick={() => void saveBudget()}
        >
          Save budget
        </button>
      </div>
      <div className="ctxbox">
        <h3>Current context (estimated)</h3>
        {ctx && ctx.context_window != null ? (
          <>
            <div className="ctxbar" aria-hidden="true">
              <div
                className="seg seg-sys"
                style={{
                  width: `${pctOf(ctx.categories.system_prompt, ctx.context_window)}%`,
                }}
              />
              <div
                className="seg seg-tools"
                style={{
                  width: `${pctOf(ctx.categories.tools, ctx.context_window)}%`,
                }}
              />
              <div
                className="seg seg-conv"
                style={{
                  width: `${pctOf(ctx.categories.conversation, ctx.context_window)}%`,
                }}
              />
            </div>
            <ul className="ctxlegend">
              {CTX_ROWS.map(([label, key, cls]) => {
                const tokens =
                  key === "free" ? (ctx.free ?? 0) : ctx.categories[key];
                return (
                  <li key={key}>
                    <span className={`dot ${cls}`} aria-hidden="true" />
                    <span>{label}</span>
                    <span>{nf.format(tokens)}</span>
                    <span>{pctOf(tokens, ctx.context_window ?? 0)}%</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="muted">
            {ctx
              ? `~${nf.format(ctx.used)} tokens in use — no model configured`
              : "Loading…"}
          </p>
        )}
      </div>
      <p className="muted">
        A run that reaches the budget stops after its current turn; raising or
        clearing the budget lets the next run proceed.
      </p>
    </section>
  );
}

function parseWatchdogHours(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 720
    ? parsed
    : "invalid";
}

export function BotGeneral({
  bot,
  onChanged,
  onCancel = () => undefined,
}: {
  bot: Bot | undefined;
  onChanged: () => void;
  onCancel?: () => void;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState(bot?.name ?? "");
  const [instructions, setInstructions] = useState(bot?.instructions ?? "");
  const [roleId, setRoleId] = useState(bot?.role_id ?? "");
  const [machineId, setMachineId] = useState(bot?.machine_id ?? "");
  const [watchdogHours, setWatchdogHours] = useState(
    bot?.watchdog_hours == null ? "" : String(bot.watchdog_hours),
  );
  const [modelId, setModelId] = useState(bot?.model_id ?? "");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(
    null,
  );
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<
    "delete" | "clear" | "restart" | "archive" | null
  >(null);
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
    void api<Provider[]>("/api/providers").then(setProviders, () =>
      setProviders([]),
    );
    void api<BotGeneralSettings>("/api/settings")
      .then((settings) => {
        setDefaultProviderId(settings.default_provider_id);
        setDefaultModel(settings.default_model);
      })
      .catch(() => undefined);
  }, []);

  const parsedWatchdog = parseWatchdogHours(watchdogHours);

  const modelOptions = Array.from(
    new Set([
      ...(bot?.model_id ? [bot.model_id] : []),
      ...(defaultProviderId
        ? (providers.find((p) => p.id === defaultProviderId)?.models ?? [])
        : []),
      ...(defaultModel ? [defaultModel] : []),
    ]),
  );

  const dirty =
    !!bot &&
    (name.trim() !== bot.name ||
      instructions !== bot.instructions ||
      roleId !== (bot.role_id ?? "") ||
      machineId !== (bot.machine_id ?? "") ||
      modelId !== (bot.model_id ?? "") ||
      parsedWatchdog === "invalid" ||
      parsedWatchdog !== (bot.watchdog_hours ?? null));
  useDirtyGuard(bot ? `the bot ${bot.name}` : "this bot", dirty);

  if (!bot) return null;
  const patchBot = (body: Record<string, unknown>) =>
    api(`/api/bots/${bot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const archiveBot = () => {
    void api(`/api/bots/${bot.id}/archive`, { method: "POST" })
      .then(onChanged)
      .catch((err) => alert(err.message));
  };

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
        <p className="rolepick">
          Watchdog hours{" "}
          <input
            type="number"
            aria-label="Watchdog hours"
            placeholder="off"
            min={1}
            max={720}
            step={1}
            value={watchdogHours}
            onChange={(e) => setWatchdogHours(e.target.value)}
          />
        </p>
        {parsedWatchdog === "invalid" && (
          <p className="muted">
            Watchdog must be a whole number from 1 to 720 hours, or empty for
            off.
          </p>
        )}
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
      <BotTags botId={bot.id} />
      <BotSecrets botId={bot.id} />
      <BotTeams botId={bot.id} />
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
        Model{" "}
        <select
          value={modelId}
          aria-label="Bot model"
          onChange={(e) => setModelId(e.target.value)}
        >
          <option value="">Server default</option>
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
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
      <div className="botdetailactions">
        <UnsavedNote dirty={dirty} />
        <button
          type="button"
          disabled={busy || !dirty || !name.trim()}
          onClick={() => {
            setBusy(true);
            patchBot({
              name: name.trim(),
              instructions,
              model_id: modelId || null,
              role_id: roleId || null,
              machine_id: machineId || null,
              watchdog_hours:
                parsedWatchdog === "invalid" ? watchdogHours : parsedWatchdog,
            })
              .then(onChanged)
              .catch((e) => alert(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Save
        </button>
        <button type="button" onClick={() => setPending("restart")}>
          Restart machine
        </button>
        <button type="button" onClick={() => setPending("clear")}>
          Clear memory
        </button>
        <button type="button" onClick={() => void openTemplateDraft()}>
          Save as template…
        </button>
        {bot.archived ? (
          <button
            type="button"
            onClick={() => {
              void api(`/api/bots/${bot.id}/unarchive`, { method: "POST" })
                .then(onChanged)
                .catch((err) => alert(err.message));
            }}
          >
            Unarchive
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (bot.run_state === "running") setPending("archive");
              else archiveBot();
            }}
          >
            Archive
          </button>
        )}
        <button
          type="button"
          className="danger"
          onClick={() => setPending("delete")}
        >
          Delete
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
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
      {pending === "archive" && (
        <ConfirmDialog
          text={`Archive bot ${bot.name}? Its running task is stopped first; it stays disabled until you unarchive and enable it.`}
          confirmLabel="Archive bot"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            archiveBot();
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

type SearchEntityType =
  | "bots"
  | "archived_bots"
  | "roles"
  | "skills"
  | "projects"
  | "tags"
  | "teams"
  | "templates";

interface SearchMatch {
  type: SearchEntityType;
  id: string;
  name: string;
  subtitle: string | null;
}

interface SearchGroupResponse {
  type: SearchEntityType;
  total: number;
  matches: SearchMatch[];
}

type PendingEntityEditType = Exclude<
  SearchEntityType,
  "bots" | "archived_bots"
>;

interface PendingEntityEdit {
  type: PendingEntityEditType;
  id: string;
}

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

const ENTITY_TABS: Record<PendingEntityEditType, Tab> = {
  roles: "roles",
  skills: "skills",
  projects: "projects",
  tags: "tags",
  teams: "teams",
  templates: "templates",
};

interface SearchCommand {
  id: string;
  label: string;
  group: "Bot actions" | "All bots" | "Navigation";
  disabledReason?: string;
  bot?: Bot;
  confirm?: { text: string; label: string };
  run: () => Promise<void>;
}

interface SearchRenderRow {
  key: string;
  kind: "search" | "command";
  match?: SearchMatch;
  action?: SearchCommand;
  selectedIndex: number | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, query }: { text: string; query: string }) {
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
  }, [commandMode, rawQuery]);

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
        label: `Open ${tab[0].toUpperCase()}${tab.slice(1)}`,
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
  const [kind, setKind] = useState<"schedule" | "webhook" | "continuous">(
    "schedule",
  );
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
                {t.kind === "webhook"
                  ? "Webhook"
                  : t.kind === "continuous"
                    ? "Continuous"
                    : "Schedule"}
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
                Type
                <select
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as
                      | "schedule"
                      | "webhook"
                      | "continuous";
                    setKind(k);
                    if (k === "continuous") setSchedule("@every 30m");
                    else if (k !== "webhook" && schedule.startsWith("@"))
                      setSchedule("0 * * * *");
                  }}
                >
                  <option value="schedule">Schedule</option>
                  <option value="webhook">Webhook</option>
                  <option value="continuous">Continuous</option>
                </select>
              </label>
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
              {kind !== "webhook" && (
                <input
                  placeholder={
                    kind === "continuous"
                      ? "@every 30m (min 1m)"
                      : "cron or @every 30m"
                  }
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
      {(trigger.kind === "schedule" || trigger.kind === "continuous") && (
        <input
          placeholder={
            trigger.kind === "continuous"
              ? "@every 30m (min 1m)"
              : "cron or @every 30m"
          }
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
              ...(trigger.kind === "webhook" ? {} : { schedule }),
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
  onRunAccepted,
  onSettings,
  onClose,
}: {
  bot: Bot | null;
  onRunAccepted?: () => void;
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
        enabled={bot.enabled === 1}
        working={bot.run_state === "running"}
        onRunAccepted={onRunAccepted}
      />
    </aside>
  );
}

export function Chat({
  botId,
  botName,
  enabled = true,
  working = false,
  onRunAccepted,
}: {
  botId: string;
  botName: string;
  enabled?: boolean;
  working?: boolean;
  onRunAccepted?: () => void;
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
    if (!text || sending || !enabled) return;
    setSending(true);
    setErr(null);
    pendingRef.current = text;
    setTurns((prev) => [...prev, { role: "user", text }]);
    setDraft("");
    try {
      const result = await api<{ runId?: string | null }>(
        `/api/bots/${botId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      if (result.runId) onRunAccepted?.();
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
          disabled={sending || !enabled}
        />
        <button type="submit" disabled={sending || !enabled || !draft.trim()}>
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
  import_info?: string | null;
}

export type McpEnvMode = "literal" | "secret";

interface McpSecretRef {
  secret: string;
}

export type McpEnvValue = string | McpSecretRef;

interface McpServer {
  id: string;
  name: string;
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, McpEnvValue>;
  enabled: number;
}

interface McpEnvRow {
  key: string;
  mode: McpEnvMode;
  value: string;
}

function isMcpSecretRef(value: unknown): value is McpSecretRef {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { secret?: unknown }).secret === "string"
  );
}

export function mcpEnvRowsFromRecord(
  env: Record<string, McpEnvValue>,
): McpEnvRow[] {
  return Object.entries(env).map(([key, value]) =>
    isMcpSecretRef(value)
      ? { key, mode: "secret", value: value.secret }
      : { key, mode: "literal", value },
  );
}

export function mcpEnvMapFromRows(
  rows: McpEnvRow[],
): Record<string, McpEnvValue> {
  const env: Record<string, McpEnvValue> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    env[key] = row.mode === "secret" ? { secret: row.value } : row.value;
  }
  return env;
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
              {Object.entries(s.env).length > 0 && (
                <p className="muted envline">
                  {Object.entries(s.env).map(([key, value]) => {
                    const secret = isMcpSecretRef(value) ? value.secret : null;
                    return (
                      <span key={key} className="envchip">
                        {`${key}=••••`}
                        {secret && <span className="srcbadge">{secret}</span>}
                      </span>
                    );
                  })}
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

export function SkillsPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
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

  useEffect(() => {
    if (!openId) return;
    const skill = skills.find((candidate) => candidate.id === openId);
    if (!skill) return;
    setEditingSkill(skill);
    setAddOpen(false);
    onOpened?.();
  }, [onOpened, openId, skills]);

  return (
    <section>
      <div className="viewhead">
        <h2>Skills</h2>
        <button type="button" onClick={() => setAddOpen(true)}>
          + Add skill
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
              {sk.import_info && (
                <span className="srcbadge">
                  {`${safeImportOrigin(sk.import_info) ?? "git"} skill`}
                </span>
              )}
              <button type="button" onClick={() => setEditingSkill(sk)}>
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
      {addOpen && (
        <AddSkillModal
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            void reloadSkills();
          }}
        />
      )}
      {editingSkill && (
        <SkillModal
          skill={editingSkill}
          onClose={() => setEditingSkill(null)}
          onSaved={() => {
            setEditingSkill(null);
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
  skill: Skill;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [instructions, setInstructions] = useState(skill.instructions);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty =
    name !== skill.name ||
    description !== skill.description ||
    instructions !== skill.instructions;
  const attemptClose = useDiscardGuard(`skill ${skill.name}`, dirty, onClose);

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Close"
        onClick={attemptClose}
      />
      <div className="dialog" role="dialog" aria-label="Skill">
        <h2>Edit skill</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api(`/api/skills/${skill.id}`, {
                method: "PATCH",
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
              {busy ? "Saving…" : "Save"}
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

function CreateSkillForm({
  onSaved,
  onDirtyChange,
}: {
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = name !== "" || description !== "" || instructions !== "";

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/skills", {
            method: "POST",
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
          {busy ? "Creating…" : "Create"}
        </button>
        <UnsavedNote dirty={dirty} />
      </div>
    </form>
  );
}

export function AddSkillModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"create" | "import">("create");
  const [formKey, setFormKey] = useState(0);
  const [createDirty, setCreateDirty] = useState(false);
  const attemptClose = useDiscardGuard("this new skill", createDirty, onClose);
  const guard = useNavGuard();

  function switchTab(next: "create" | "import") {
    if (next === tab) return;
    guard(() => {
      setCreateDirty(false);
      if (tab === "create") setFormKey((key) => key + 1);
      setTab(next);
    });
  }

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Close"
        onClick={attemptClose}
      />
      <div className="dialog tabs" role="dialog" aria-label="Add skill">
        <div className="viewhead">
          <h2>Add skill</h2>
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
          {(
            [
              ["create", "Create"],
              ["import", "Import"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "sel" : ""}
              onClick={() => switchTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="tabbody">
          {tab === "create" && (
            <CreateSkillForm
              key={formKey}
              onSaved={onSaved}
              onDirtyChange={setCreateDirty}
            />
          )}
          {tab === "import" && <ImportSkillsPane onImported={onSaved} />}
        </div>
      </div>
    </div>
  );
}

export function findDuplicateEnvKey(rows: { key: string }[]): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    const trimmed = row.key.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) return trimmed;
    seen.add(trimmed);
  }
  return null;
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
  const [envRows, setEnvRows] = useState<McpEnvRow[]>(() => {
    const rows = mcpEnvRowsFromRecord(server?.env ?? {});
    return rows.length > 0 ? rows : [{ key: "", mode: "literal", value: "" }];
  });
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [enabled, setEnabled] = useState(server ? server.enabled === 1 : true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void api<SecretMeta[]>("/api/secrets")
      .then((items) => {
        if (live) setSecrets(items);
      })
      .catch(() => {
        if (live) setSecrets([]);
      });
    return () => {
      live = false;
    };
  }, []);
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
            const duplicateKey = findDuplicateEnvKey(envRows);
            if (duplicateKey !== null) {
              setError(`duplicate environment variable key ${duplicateKey}`);
              return;
            }
            setBusy(true);
            setError(null);
            const body = {
              name,
              command,
              args: args
                .split("\n")
                .map((a) => a.trim())
                .filter(Boolean),
              env: mcpEnvMapFromRows(envRows),
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
            {envRows.map((row, i) => (
              <div className="envrow" key={i}>
                <input
                  placeholder="KEY"
                  value={row.key}
                  onChange={(e) =>
                    setEnvRows(
                      envRows.map((r, j) =>
                        j === i ? { ...r, key: e.target.value } : r,
                      ),
                    )
                  }
                />
                <div className="envvalue">
                  <div className="themegroup envmode">
                    <button
                      type="button"
                      aria-label={`Use a literal value for env var ${i + 1}`}
                      className={row.mode === "literal" ? "sel" : ""}
                      onClick={() =>
                        setEnvRows(
                          envRows.map((r, j) =>
                            j === i ? { ...r, mode: "literal" } : r,
                          ),
                        )
                      }
                    >
                      Literal
                    </button>
                    <button
                      type="button"
                      aria-label={`Use a secret reference for env var ${i + 1}`}
                      className={row.mode === "secret" ? "sel" : ""}
                      onClick={() =>
                        setEnvRows(
                          envRows.map((r, j) => {
                            if (j !== i) return r;
                            const known = secrets.some(
                              (s) => s.name === r.value,
                            );
                            return {
                              ...r,
                              mode: "secret",
                              value: known ? r.value : "",
                            };
                          }),
                        )
                      }
                    >
                      Secret
                    </button>
                  </div>
                  {row.mode === "literal" ? (
                    <input
                      placeholder="value"
                      value={row.value}
                      onChange={(e) =>
                        setEnvRows(
                          envRows.map((r, j) =>
                            j === i ? { ...r, value: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  ) : (
                    <select
                      aria-label={`Env var ${i + 1} secret`}
                      value={row.value}
                      onChange={(e) =>
                        setEnvRows(
                          envRows.map((r, j) =>
                            j === i ? { ...r, value: e.target.value } : r,
                          ),
                        )
                      }
                    >
                      <option value="">Select a secret…</option>
                      {row.value &&
                        !secrets.some((s) => s.name === row.value) && (
                          <option
                            value={row.value}
                          >{`${row.value} (missing)`}</option>
                        )}
                      {secrets.map((secret) => (
                        <option key={secret.id} value={secret.name}>
                          {secret.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
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
              onClick={() =>
                setEnvRows([
                  ...envRows,
                  { key: "", mode: "literal", value: "" },
                ])
              }
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

export function TemplatesPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
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

  useEffect(() => {
    if (!openId) return;
    const template = templates.find((candidate) => candidate.id === openId);
    if (!template) return;
    setEditing(template);
    onOpened?.();
  }, [onOpened, openId, templates]);

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

export function TagsPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const navGuard = useNavGuard();
  const [creating, setCreating] = useState(false);
  const [selTag, setSelTag] = useState<Tag | null>(null);

  const load = useCallback(async () => {
    setTags(await api<Tag[]>("/api/tags").catch(() => []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openId) return;
    const tag = tags.find((candidate) => candidate.id === openId);
    if (!tag) return;
    setSelTag(tag);
    setCreating(false);
    onOpened?.();
  }, [onOpened, openId, tags]);

  return (
    <section>
      <div className="viewhead">
        <h2>Tags</h2>
        <button type="button" onClick={() => setCreating(true)}>
          Add tag
        </button>
      </div>
      {tags.length === 0 && (
        <p className="muted">No tags yet — labels for organizing bots.</p>
      )}
      <div className="cards">
        {tags.map((tag) => (
          <button
            type="button"
            key={tag.id}
            className="card"
            onClick={() => navGuard(() => setSelTag(tag))}
          >
            <strong>{tag.name}</strong>
            <span className="preview">
              {tag.bot_count === 1 ? "1 bot" : `${tag.bot_count} bots`}
            </span>
          </button>
        ))}
      </div>
      {(creating || selTag) && (
        <TagModal
          tag={selTag}
          onClose={() => {
            setCreating(false);
            setSelTag(null);
          }}
          onSaved={() => {
            setCreating(false);
            setSelTag(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

export function TagModal({
  tag,
  onClose,
  onSaved,
}: {
  tag: Tag | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = name.trim() !== (tag?.name ?? "") && name.trim() !== "";
  const attemptClose = useDiscardGuard(
    tag ? `tag ${tag.name}` : "this new tag",
    dirty,
    onClose,
  );

  const save = async () => {
    setBusy(true);
    try {
      await api(tag ? `/api/tags/${tag.id}` : "/api/tags", {
        method: tag ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
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
        aria-label={tag ? "Edit tag" : "Create tag"}
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
        <div className="actions">
          <button type="submit" disabled={busy || !name.trim()}>
            Save
          </button>
          <UnsavedNote dirty={dirty} />
          {tag && (
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
      {confirmDel && tag && (
        <ConfirmDialog
          text={`Delete tag ${tag.name}? Bots keep running — the label is removed from them.`}
          confirmLabel="Delete tag"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            api(`/api/tags/${tag.id}`, { method: "DELETE" })
              .then(onSaved)
              .catch((e) => alert(e.message));
          }}
        />
      )}
    </div>
  );
}

export function BotTags({ botId }: { botId: string }) {
  const [all, setAll] = useState<Tag[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Tag[]>("/api/tags")
      .then(setAll)
      .catch(() => setAll([]));
    void api<{ tag_ids: string[] }>(`/api/bots/${botId}`)
      .then((b) => setAttached(b.tag_ids ?? []))
      .catch(() => undefined);
  }, [botId]);

  const save = (next: string[]) => {
    setBusy(true);
    api(`/api/bots/${botId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag_ids: next }),
    })
      .then(() => setAttached(next))
      .catch((e) => alert(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  const q = text.trim().toLowerCase();
  const suggestions = all.filter(
    (t) => !attached.includes(t.id) && t.name.toLowerCase().includes(q),
  );

  const commit = async () => {
    const name = text.trim();
    if (!name || busy) return;
    const existing = all.find((t) => t.name.toLowerCase() === q);
    if (existing) {
      if (!attached.includes(existing.id)) save([...attached, existing.id]);
      setText("");
      return;
    }
    setBusy(true);
    try {
      const created = await api<Tag>("/api/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setAll((list) => [...list, created]);
      save([...attached, created.id]);
      setText("");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="bottags">
      <span>Tags</span>
      <div className="tagchips">
        {attached.map((id) => {
          const t = all.find((x) => x.id === id);
          if (!t) return null;
          return (
            <span key={id} className="chip">
              {t.name}
              <button
                type="button"
                aria-label={`Remove ${t.name}`}
                disabled={busy}
                onClick={() => save(attached.filter((x) => x !== id))}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      <input
        className="tagadd"
        placeholder="Add tag — Enter attaches or creates"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
      />
      {q !== "" && (
        <div className="tagsuggest">
          {suggestions.slice(0, 8).map((t) => (
            <button
              type="button"
              key={t.id}
              disabled={busy}
              onClick={() => {
                save([...attached, t.id]);
                setText("");
              }}
            >
              {t.name}
            </button>
          ))}
          {suggestions.length === 0 && (
            <button type="button" disabled={busy} onClick={() => void commit()}>
              {`+ Create "${text.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function KeyIcon({ size = 18 }: { size?: number }) {
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
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

interface SecretMeta {
  id: string;
  name: string;
  key: string;
  created_at: number;
}

export function SecretsPanel() {
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const navGuard = useNavGuard();
  const [creating, setCreating] = useState(false);
  const [selSecret, setSelSecret] = useState<SecretMeta | null>(null);

  const load = useCallback(async () => {
    setSecrets(await api<SecretMeta[]>("/api/secrets").catch(() => []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="viewhead">
        <h2>Secrets</h2>
        <button type="button" onClick={() => setCreating(true)}>
          Add secret
        </button>
      </div>
      {secrets.length === 0 && (
        <p className="muted">
          No secrets yet — env vars injected into sandboxes at start.
        </p>
      )}
      <div className="cards">
        {secrets.map((s) => (
          <button
            type="button"
            key={s.id}
            className="card"
            onClick={() => navGuard(() => setSelSecret(s))}
          >
            <strong>{s.name}</strong>
            <span className="preview">
              <code>{s.key}</code>
            </span>
          </button>
        ))}
      </div>
      {(creating || selSecret) && (
        <SecretModal
          secret={selSecret}
          onClose={() => {
            setCreating(false);
            setSelSecret(null);
          }}
          onSaved={() => {
            setCreating(false);
            setSelSecret(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

export function SecretModal({
  secret,
  onClose,
  onSaved,
}: {
  secret: SecretMeta | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(secret?.name ?? "");
  const [key, setKey] = useState(secret?.key ?? "");
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const dirty =
    name.trim() !== (secret?.name ?? "") ||
    key !== (secret?.key ?? "") ||
    value !== "";

  const reveal = async () => {
    if (!secret) return;
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    try {
      const r = await api<{ value: string }>(`/api/secrets/${secret.id}/value`);
      setRevealed(r.value);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      if (secret) {
        await api(`/api/secrets/${secret.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            key,
            ...(value ? { value } : {}),
          }),
        });
      } else {
        await api("/api/secrets", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), key, value }),
        });
      }
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
        onClick={onClose}
      />
      <form
        className="dialog narrow"
        role="dialog"
        aria-label={secret ? "Edit secret" : "Create secret"}
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
          Env var key
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            pattern="[A-Za-z_][A-Za-z0-9_]*"
            required
          />
        </label>
        {secret ? (
          <div className="field">
            Value
            <div className="row">
              <input
                value={revealed !== null ? revealed : ""}
                onChange={(e) => {
                  setRevealed(e.target.value);
                  setValue(e.target.value);
                }}
                type={revealed === null ? "password" : "text"}
                placeholder="•••••••• (unchanged unless typed)"
              />
              <button
                type="button"
                onClick={() => void reveal()}
                title={revealed === null ? "Reveal saved value" : "Hide value"}
              >
                {revealed === null ? "Show" : "Hide"}
              </button>
            </div>
          </div>
        ) : (
          <label className="field">
            Value
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </label>
        )}
        <div className="actions">
          <button
            type="submit"
            disabled={busy || !name.trim() || !KEY_RE.test(key)}
          >
            Save
          </button>
          {secret && (
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
      {confirmDel && secret && (
        <ConfirmDialog
          text={`Delete ${secret.name}? Sandboxes using it must be restarted to drop the variable.`}
          confirmLabel="Delete secret"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            api(`/api/secrets/${secret.id}`, { method: "DELETE" })
              .then(onSaved)
              .catch((e) => alert(e instanceof Error ? e.message : String(e)));
          }}
        />
      )}
    </div>
  );
}

export function BotSecrets({ botId }: { botId: string }) {
  const [all, setAll] = useState<SecretMeta[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<SecretMeta[]>("/api/secrets")
      .then(setAll)
      .catch(() => setAll([]));
    void api<{ secret_ids: string[] }>(`/api/bots/${botId}`)
      .then((b) => setAttached(b.secret_ids ?? []))
      .catch(() => undefined);
  }, [botId]);

  if (all.length === 0) return null;

  const toggle = (id: string) => {
    const next = attached.includes(id)
      ? attached.filter((x) => x !== id)
      : [...attached, id];
    setBusy(true);
    api(`/api/bots/${botId}`, {
      method: "PATCH",
      body: JSON.stringify({ secret_ids: next }),
    })
      .then(() => setAttached(next))
      .catch((e) => alert(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="botsecrets">
      {all.map((s) => (
        <label key={s.id}>
          <input
            type="checkbox"
            disabled={busy}
            checked={attached.includes(s.id)}
            onChange={() => toggle(s.id)}
          />{" "}
          {s.name} <code>{s.key}</code>
        </label>
      ))}
    </div>
  );
}

function safeImportOrigin(raw: string): string | null {
  try {
    const info = JSON.parse(raw) as { origin?: string };
    return typeof info.origin === "string" ? info.origin : null;
  } catch {
    return null;
  }
}

interface SearchHit {
  id: string;
  source: string;
  skill_id: string;
  name: string;
  installs: number | null;
}

interface SkillPreviewRow {
  folder: string;
  name: string;
  description: string;
  license: string | null;
  file_count: number;
  total_size: number;
  content_hash: string;
}

function ImportSkillsPane({ onImported }: { onImported: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [source, setSource] = useState("");
  const [previews, setPreviews] = useState<SkillPreviewRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (!query.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ results: SearchHit[] }>(
        `/api/skills/search?q=${encodeURIComponent(query.trim())}`,
      );
      setHits(r.results);
    } catch (e) {
      setHits([]);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    if (!source.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ skills: SkillPreviewRow[] }>(
        "/api/skills/preview",
        { method: "POST", body: JSON.stringify({ source: source.trim() }) },
      );
      setPreviews(r.skills);
      setPicked(new Set());
    } catch (e) {
      setPreviews([]);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!picked.size || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/skills/import", {
        method: "POST",
        body: JSON.stringify({ source: source.trim(), folders: [...picked] }),
      });
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className="field">
        Search skills.sh
        <input
          value={query}
          placeholder="pdf, testing, ..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={busy || !query.trim()}
          onClick={() => void search()}
        >
          Search
        </button>
      </div>
      {hits && (
        <ul className="srclist">
          {hits.length === 0 && <li className="muted">No matches.</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <span>
                {h.name}{" "}
                <em className="muted">
                  ({h.source}
                  {h.installs !== null ? ` · ${h.installs} installs` : ""})
                </em>
              </span>
              <button
                type="button"
                onClick={() => setSource(`${h.source}@${h.skill_id}`)}
              >
                Use
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="field">
        Git source
        <input
          value={source}
          placeholder="owner/repo, https://…/tree/main/skills/pdf@pdf#v1.2"
          onChange={(e) => setSource(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={busy || !source.trim()}
          onClick={() => void preview()}
        >
          Preview
        </button>
      </div>
      {previews.length > 0 && (
        <ul className="srclist">
          {previews.map((p) => (
            <li key={p.folder}>
              <label>
                <input
                  type="checkbox"
                  checked={picked.has(p.folder)}
                  onChange={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.folder)) next.delete(p.folder);
                      else next.add(p.folder);
                      return next;
                    })
                  }
                />{" "}
                <strong>{p.name}</strong>{" "}
                <em className="muted">
                  {p.folder} · {p.file_count} files ·{" "}
                  {(p.total_size / 1024).toFixed(0)} KB
                </em>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button
          type="button"
          disabled={busy || picked.size === 0}
          onClick={() => void doImport()}
        >
          Import{" "}
          {picked.size > 0
            ? `${picked.size} skill${picked.size > 1 ? "s" : ""}`
            : ""}
        </button>
      </div>
    </>
  );
}
