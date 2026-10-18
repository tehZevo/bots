import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface Bot {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model_id: string | null;
  role_id: string | null;
  machine_id: string | null;
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

interface Role {
  id: string;
  name: string;
  instructions: string;
  created_at: number;
  mcp_server_ids: string[];
  skill_ids: string[];
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

interface Trigger {
  id: string;
  kind: "schedule" | "webhook";
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

const AVATAR_COLORS = [
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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function StatusDot({
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

const SHAPE_PRESETS: ((r: () => number) => [number, number, number][])[] = [
  // pebble — near-circle with a tiny two-harmonic ripple
  (r) => [
    [3, 0.04 + r() * 0.02, r() * 6.28],
    [4, 0.03 + r() * 0.02, r() * 6.28],
  ],
  // egg — vertical n=2 bulge
  () => [[2, 0.15, Math.PI / 2]],
  // pear — stacked asymmetry, heavy bottom
  () => [
    [1, 0.07, Math.PI / 2],
    [2, 0.1, 0],
  ],
  // bean — crescent indent plus mild n=1
  (r) => [
    [2, 0.16, r() < 0.5 ? 0.79 : 3.93],
    [1, 0.05, r() * 6.28],
  ],
  // cushion — rounded square
  (r) => [[4, 0.09 + r() * 0.02, r() * 6.28]],
  // trilobe — soft rounded triangle
  (r) => [[3, 0.1 + r() * 0.02, r() * 6.28]],
  // hexpebble — gentle hexagon
  (r) => [[6, 0.07 + r() * 0.02, r() * 6.28]],
  // clover — five soft lobes
  (r) => [[5, 0.13, r() * 6.28]],
  // star5 / star6 — puffy rounded points
  (r) => [[5, 0.19, r() * 6.28]],
  (r) => [[6, 0.17, r() * 6.28]],
  // dimple — one flattened side at a seeded angle
  () => [[1, -0.14, 0]],
  // drop — teardrop leaning to a seeded direction
  (r) => {
    const dir = r() < 0.5 ? 0 : Math.PI;
    return [
      [1, 0.12, dir],
      [2, 0.06, dir],
    ];
  },
];

function shapeRadii(rand: () => number): number[] {
  const terms = SHAPE_PRESETS[Math.floor(rand() * SHAPE_PRESETS.length)](rand);
  rand();
  const n = 72;
  return Array.from({ length: n }, (_, i) => {
    const th = (i / n) * Math.PI * 2;
    return (
      1 + terms.reduce((r, [k, w, ph]) => r + w * Math.sin(k * th + ph), 0)
    );
  });
}

function smoothClosedPath(radii: number[], cx: number, baseR: number): string {
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

function avatarColor(id: string): string {
  return AVATAR_COLORS[fnv(id) % AVATAR_COLORS.length];
}

function Avatar({ id }: { name: string; id: string }) {
  const rand = mulberry32(fnv(id));
  const radii = shapeRadii(rand);
  const maxR = Math.max(...radii);
  const base = 46 / maxR;
  const eyeGap = 7 + rand() * 5;
  const eyeRx = 2.6 + rand() * 1.4;
  const eyeRy = eyeRx * (1.8 + rand() * 0.5);
  const gaze = (rand() - 0.5) * 3;
  const droop = rand() < 0.3;
  return (
    <span
      className="avatar"
      style={{
        color: avatarColor(id),
        ["--avatar-glow" as string]: `${avatarColor(id)}59`,
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

function relTime(ts: number): string {
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

function fmt(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

export function App() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [tab, setTab] = useState<
    "bots" | "roles" | "machines" | "integrations" | "skills" | "settings"
  >("bots");
  const [openBot, setOpenBot] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<
    "general" | "triggers" | "chat" | "logs"
  >("general");
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [botQuery, setBotQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Bot["health"]>(
    "all",
  );
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setBots(await api<Bot[]>("/api/bots"));
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
  }, [bots, openBot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (addOpen) setAddOpen(false);
      else if (detailOpen) setDetailOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [addOpen, detailOpen]);

  const botFilter = botQuery.trim().toLowerCase();
  const visibleBots = bots.filter(
    (bot) =>
      (statusFilter === "all" || bot.health === statusFilter) &&
      (!botFilter || bot.name.toLowerCase().includes(botFilter)),
  );

  const openBotRow = bots.find((b) => b.id === openBot);

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
              <input
                placeholder="Search bots by name"
                value={botQuery}
                onChange={(e) => setBotQuery(e.target.value)}
              />
              <nav className="mtabs">
                {(
                  ["all", "green", "blue", "yellow", "red", "gray"] as const
                ).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={statusFilter === s ? "sel" : ""}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === "all"
                      ? "All"
                      : HEALTH_LABEL[s][0].toUpperCase() +
                        HEALTH_LABEL[s].slice(1)}
                  </button>
                ))}
              </nav>
              <div className="cards">
                {visibleBots.map((bot) => (
                  <button
                    type="button"
                    key={bot.id}
                    className="card"
                    aria-label={`${bot.name} (${bot.status})`}
                    onClick={() => {
                      setOpenBot(bot.id);
                      setDetailOpen(true);
                    }}
                  >
                    <span className="cardhead">
                      <Avatar name={bot.name} id={bot.id} />
                      <span className="cardtext">
                        <strong>{bot.name}</strong>
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
                ))}
              </div>
              {bots.length === 0 && <p>No bots yet — press "Add bot".</p>}
              {bots.length > 0 && visibleBots.length === 0 && (
                <p className="muted">No bots match the current filters.</p>
              )}
            </>
          )}
          {tab === "roles" && <RolesPanel />}
          {tab === "machines" && <MachinesPanel />}
          {tab === "integrations" && <IntegrationsPanel />}
          {tab === "skills" && <SkillsPanel />}
          {tab === "settings" && <SettingsPanel />}
        </main>
        {detailOpen && openBotRow && (
          <div className="modal">
            <button
              type="button"
              className="mscrim"
              aria-label="Close details"
              onClick={() => setDetailOpen(false)}
            />
            <div
              className="dialog tabs"
              role="dialog"
              aria-label={`${openBotRow.name} details`}
            >
              <div className="viewhead">
                <Avatar name={openBotRow.name} id={openBotRow.id} />
                <h2>{openBotRow.name}</h2>
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
                <button
                  type="button"
                  className="close"
                  aria-label="Close"
                  onClick={() => setDetailOpen(false)}
                >
                  ×
                </button>
              </div>
              <nav className="mtabs">
                {(["general", "triggers", "chat", "logs"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={modalTab === t ? "sel" : ""}
                    onClick={() => setModalTab(t)}
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
                {modalTab === "triggers" && <Triggers botId={openBotRow.id} />}
                {modalTab === "chat" && <Chat botId={openBotRow.id} />}
                {modalTab === "logs" && (
                  <>
                    {runs.length === 0 && (
                      <p>No runs yet. Press "Run now" or wait for a trigger.</p>
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
                        {run.error && <pre className="error">{run.error}</pre>}
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
    </div>
  );
}

const BOT_NAMES = [
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

function pickBotName(used: string[]): string {
  const taken = new Set(used.map((n) => n.toLowerCase()));
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  const pool = free.length > 0 ? free : BOT_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function AddBotModal({
  usedNames,
  onClose,
  onCreated,
}: {
  usedNames: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const initialName = pickBotName(usedNames);
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
  const [systemPrompt, setSystemPrompt] = useState("");
  const [roleId, setRoleId] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [machineId, setMachineId] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Role[]>("/api/roles").then(setRoles, () => setRoles([]));
    void api<Machine[]>("/api/machines").then(
      (ms) => setMachines(ms.filter((m) => !m.builtin)),
      () => setMachines([]),
    );
  }, []);

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
        aria-label="Add bot"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/api/bots", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name,
                system_prompt: systemPrompt,
                role_id: roleId || null,
                machine_id: machineId || null,
              }),
            });
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
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="namerow">
          <input
            ref={(el) => el?.focus()}
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
          placeholder="system prompt (optional)"
          rows={3}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
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
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function BotIcon({ size = 18 }: { size?: number }) {
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

function RoleIcon({ size = 18 }: { size?: number }) {
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

function BookIcon({ size = 18 }: { size?: number }) {
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

function GearIcon({ size = 18 }: { size?: number }) {
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
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
    </svg>
  );
}

function PlugIcon({ size = 18 }: { size?: number }) {
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

function MachineIcon({ size = 18 }: { size?: number }) {
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

const NAV_ITEMS: {
  id: "bots" | "roles" | "machines" | "integrations" | "skills" | "settings";
  label: string;
  Icon: (p: { size?: number }) => ReactElement;
}[] = [
  { id: "bots", label: "Bots", Icon: BotIcon },
  { id: "roles", label: "Roles", Icon: RoleIcon },
  { id: "machines", label: "Machines", Icon: MachineIcon },
  { id: "integrations", label: "Integrations", Icon: PlugIcon },
  { id: "skills", label: "Skills", Icon: BookIcon },
  { id: "settings", label: "Settings", Icon: GearIcon },
];

function Nav({
  tab,
  rail,
  onSelect,
}: {
  tab: "bots" | "roles" | "machines" | "integrations" | "skills" | "settings";
  rail: boolean;
  onSelect: (
    tab: "bots" | "roles" | "machines" | "integrations" | "skills" | "settings",
  ) => void;
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

function SettingsPanel() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [idle, setIdle] = useState(5);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    void api<{ sandbox_idle_minutes: number }>("/api/settings")
      .then((s) => setIdle(s.sandbox_idle_minutes))
      .catch(() => {});
  }, []);

  const saveIdle = async () => {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sandbox_idle_minutes: idle }),
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

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
      <p className="muted">Theme</p>
      <nav className="sidetabs wide">
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
      </nav>
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

function ProviderFormModal({
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
        onClick={onClose}
      />
      <div className="dialog">
        <div className="viewhead">
          <h2>{provider ? `Edit ${provider.name}` : "Add provider"}</h2>
          <button
            type="button"
            className="close"
            aria-label="Cancel"
            onClick={onClose}
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

function RolesPanel() {
  const [roles, setRoles] = useState<Role[]>([]);
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
            onClick={() => setFormRole(role)}
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

function RoleFormModal({
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
      if (e.key === "Escape" && !confirmDel) onClose();
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
        onClick={onClose}
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
            onClick={onClose}
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
          <button type="button" onClick={onClose}>
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

function BotGeneral({
  bot,
  onChanged,
}: {
  bot: Bot | undefined;
  onChanged: () => void;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState(bot?.name ?? "");
  const [description, setDescription] = useState(bot?.description ?? "");
  const [roleId, setRoleId] = useState(bot?.role_id ?? "");
  const [machineId, setMachineId] = useState(bot?.machine_id ?? "");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [pending, setPending] = useState<"delete" | "clear" | null>(null);

  useEffect(() => {
    void api<Role[]>("/api/roles").then(setRoles, () => setRoles([]));
    void api<Machine[]>("/api/machines")
      .then((ms) => setMachines(ms.filter((m) => !m.builtin)))
      .catch(() => setMachines([]));
  }, []);

  if (!bot) return null;
  const dirty =
    name.trim() !== bot.name ||
    description !== bot.description ||
    roleId !== (bot.role_id ?? "") ||
    machineId !== (bot.machine_id ?? "");
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
          aria-label="Description"
          placeholder="description (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="actions">
          <button
            type="button"
            disabled={busy || !dirty || !name.trim()}
            onClick={() => {
              setBusy(true);
              patchBot({
                name: name.trim(),
                description,
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
        <button type="button" onClick={() => setPending("clear")}>
          Clear memory
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
    </>
  );
}

function ConfirmDialog({
  text,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  text: string;
  confirmLabel: string;
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
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Triggers({ botId }: { botId: string }) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [message, setMessage] = useState("");
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
              {t.kind === "webhook"
                ? `webhook ${t.id.slice(0, 8)}`
                : t.schedule}
              {t.enabled ? "" : " · paused"}
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
                  const body: Record<string, string> = { message, kind };
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
                Message
                <textarea
                  placeholder="message to inject on trigger"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </label>
              <select
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as "schedule" | "webhook")
                }
              >
                <option value="schedule">Schedule</option>
                <option value="webhook">Webhook</option>
              </select>
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
  const [message, setMessage] = useState(trigger.message);
  const [schedule, setSchedule] = useState(trigger.schedule);
  const [busy, setBusy] = useState(false);
  const dirty =
    message !== trigger.message ||
    (trigger.kind === "schedule" && schedule !== trigger.schedule);
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
        ) : (
          <span className="muted">next: {fmt(trigger.next_run_at)}</span>
        )}
      </div>
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
              message,
              ...(trigger.kind === "schedule" ? { schedule } : {}),
            }).finally(() => setBusy(false));
          }}
        >
          Save
        </button>
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

function Chat({ botId }: { botId: string }) {
  const [turns, setTurns] = useState<{ role: string; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const replyBaseRef = useRef(0);
  const [typing, setTyping] = useState(false);

  const loadChat = useCallback(async () => {
    try {
      const fresh = await api<{ role: string; text: string }[]>(
        `/api/bots/${botId}/messages`,
      );
      if (
        pendingRef.current &&
        fresh.some((t) => t.role === "user" && t.text === pendingRef.current)
      )
        pendingRef.current = null;
      const replies = fresh.filter(
        (t) => t.role === "assistant" && t.text.trim(),
      ).length;
      if (typing && replies > replyBaseRef.current) setTyping(false);
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
  }, [botId, typing]);

  useEffect(() => {
    void loadChat();
    const t = setInterval(loadChat, 3000);
    return () => clearInterval(t);
  }, [loadChat]);

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
    replyBaseRef.current = turns.filter(
      (t) => t.role === "assistant" && t.text.trim(),
    ).length;
    setTyping(true);
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
      setTyping(false);
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
        {turns.map((t, i) => (
          <div key={i} className={`chat-turn ${t.role}`}>
            <span className="who">{t.role === "user" ? "you" : "bot"}</span>
            <pre>{t.text}</pre>
          </div>
        ))}
        {typing && (
          <div className="chat-turn typing" aria-label="bot is replying">
            <span className="who">bot</span>
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
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

function IntegrationsPanel() {
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

function SkillsPanel() {
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

function SkillModal({
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

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Close"
        onClick={onClose}
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
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function McpServerModal({
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

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Close"
        onClick={onClose}
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
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MachinesPanel() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [form, setForm] = useState<Machine | "new" | null>(null);
  const [removing, setRemoving] = useState<Machine | null>(null);

  const reload = useCallback(
    () =>
      api<Machine[]>("/api/machines")
        .then(setMachines)
        .catch(() => setMachines([])),
    [],
  );

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
            {!m.builtin && m.image && <code>{m.image}</code>}
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

function MachineModal({
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

  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label="Close"
        onClick={onClose}
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
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
