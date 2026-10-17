import { useCallback, useEffect, useRef, useState } from "react";

interface Bot {
  id: string;
  name: string;
  system_prompt: string;
  model_id: string | null;
  role_id: string | null;
  enabled: number;
  created_at: number;
  status: "running" | "enabled" | "disabled";
}

interface Role {
  id: string;
  name: string;
  instructions: string;
  created_at: number;
}

interface Run {
  id: string;
  status: "running" | "ok" | "error";
  trigger: "schedule" | "manual";
  started_at: number;
  finished_at: number | null;
  output: string | null;
  error: string | null;
}

interface Trigger {
  id: string;
  kind: "schedule";
  message: string;
  schedule: string;
  next_run_at: number | null;
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
  const [tab, setTab] = useState<string>("bots");
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const botId = tab !== "bots" && tab !== "roles" ? tab : null;

  const select = (id: string) => {
    setTab(id);
    setNavOpen(false);
  };

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
    setRuns([]);
    if (!botId) return;
    const loadRuns = async () =>
      setRuns(await api<Run[]>(`/api/bots/${botId}/runs`));
    void loadRuns();
    const t = setInterval(loadRuns, 3000);
    return () => clearInterval(t);
  }, [botId]);

  useEffect(() => {
    if (botId && !bots.some((b) => b.id === botId)) setTab("bots");
  }, [bots, botId]);

  const nav = <Nav tab={tab} onSelect={(t) => select(t)} onCreated={load} />;

  return (
    <div className="layout">
      <aside>
        <div className="hdr">
          <h1>Bots</h1>
          <ThemeMenu />
        </div>
        {error && <p className="error">{error}</p>}
        {nav}
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
        <ThemeMenu />
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
            {nav}
          </div>
        </div>
      )}
      <main>
        {tab === "bots" && (
          <>
            <div className="cards">
              {bots.map((bot) => (
                <button
                  type="button"
                  key={bot.id}
                  className="card"
                  aria-label={`${bot.name} (${bot.status})`}
                  onClick={() => select(bot.id)}
                >
                  <span className={`dot ${bot.status}`} />
                  <strong>{bot.name}</strong>
                </button>
              ))}
            </div>
            {bots.length === 0 && (
              <p>No bots yet — create one from the menu.</p>
            )}
          </>
        )}
        {tab === "roles" && <RolesPanel />}
        {botId && (
          <div>
            <BotActions
              bot={bots.find((b) => b.id === botId)}
              onChanged={load}
            />
            <RoleSelect
              bot={bots.find((b) => b.id === botId)}
              onChanged={load}
            />
            <Triggers botId={botId} />
            {runs.length === 0 && (
              <p>No runs yet. Press "Run now" or wait for a trigger.</p>
            )}
            {runs.map((run) => (
              <article key={run.id}>
                <header>
                  <span className={`status ${run.status}`}>{run.status}</span>
                  <span>{run.trigger}</span>
                  <span>{fmt(run.started_at)}</span>
                  {run.finished_at && <span>→ {fmt(run.finished_at)}</span>}
                </header>
                {run.output && <pre>{run.output}</pre>}
                {run.error && <pre className="error">{run.error}</pre>}
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Nav({
  tab,
  onSelect,
  onCreated,
}: {
  tab: string;
  onSelect: (tab: string) => void;
  onCreated: () => void;
}) {
  return (
    <>
      <nav className="sidetabs">
        <button
          type="button"
          className={tab === "bots" ? "sel" : ""}
          onClick={() => onSelect("bots")}
        >
          Bots
        </button>
        <button
          type="button"
          className={tab === "roles" ? "sel" : ""}
          onClick={() => onSelect("roles")}
        >
          Roles
        </button>
      </nav>
      <BotForm onCreated={onCreated} />
    </>
  );
}

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

function currentTheme(): Theme {
  const stored = localStorage.getItem("bots-theme");
  return stored === "light" || stored === "system" ? stored : "dark";
}

function ThemeMenu() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const pick = (t: Theme) => {
    localStorage.setItem("bots-theme", t);
    document.documentElement.dataset.theme = t;
    setTheme(t);
    setOpen(false);
  };

  return (
    <div className="settings" ref={ref}>
      <button
        type="button"
        className="cog"
        aria-label="Settings"
        onClick={() => setOpen((o) => !o)}
      >
        ⚙
      </button>
      {open && (
        <div className="menu">
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
      )}
    </div>
  );
}

function RolesPanel() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRoles = useCallback(async () => {
    setRoles(await api<Role[]>("/api/roles").catch(() => []));
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const reset = () => {
    setName("");
    setInstructions("");
    setEditing(null);
  };

  return (
    <section>
      <h2>Roles</h2>
      {roles.length === 0 && (
        <p className="muted">No roles yet — create one below.</p>
      )}
      <div className="cards">
        {roles.map((role) => (
          <button
            type="button"
            key={role.id}
            className={editing === role.id ? "card sel" : "card"}
            onClick={() => {
              setEditing(role.id);
              setName(role.name);
              setInstructions(role.instructions);
            }}
          >
            <strong>{role.name}</strong>
            <span className="preview">{role.instructions}</span>
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const body = JSON.stringify({ name, instructions });
            if (editing)
              await api(`/api/roles/${editing}`, {
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
            reset();
            await loadRoles();
          } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          placeholder="role name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <textarea
          placeholder="instructions added to assigned bots' prompts"
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          required
        />
        <div className="actions">
          <button type="submit" disabled={busy}>
            {editing ? "Save role" : "Create role"}
          </button>
          {editing && (
            <button type="button" onClick={reset}>
              Cancel
            </button>
          )}
          {editing && (
            <button
              type="button"
              className="danger"
              onClick={async () => {
                await api(`/api/roles/${editing}`, { method: "DELETE" }).catch(
                  (e) => alert(e.message),
                );
                reset();
                await loadRoles();
              }}
            >
              Delete role
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function RoleSelect({
  bot,
  onChanged,
}: {
  bot: Bot | undefined;
  onChanged: () => void;
}) {
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    void api<Role[]>("/api/roles").then(setRoles, () => setRoles([]));
  }, []);

  if (!bot) return null;
  return (
    <p className="rolepick">
      Role{" "}
      <select
        value={bot.role_id ?? ""}
        onChange={(e) =>
          api(`/api/bots/${bot.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ role_id: e.target.value || null }),
          })
            .then(onChanged)
            .catch((e) => alert(e.message))
        }
      >
        <option value="">None</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
    </p>
  );
}

function BotActions({
  bot,
  onChanged,
}: {
  bot: Bot | undefined;
  onChanged: () => void;
}) {
  if (!bot) return null;
  const post = (path: string, init?: RequestInit) =>
    api(path, init).catch((e) => alert(e.message));
  return (
    <div className="actions">
      <strong>{bot.name}</strong>
      <button
        type="button"
        onClick={() => post(`/api/bots/${bot.id}/run`, { method: "POST" })}
      >
        Run now
      </button>
      <button
        type="button"
        onClick={() =>
          post(`/api/bots/${bot.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled: bot.enabled === 0 }),
          }).then(onChanged)
        }
      >
        {bot.enabled ? "Disable" : "Enable"}
      </button>
      <button
        type="button"
        onClick={() =>
          post(`/api/bots/${bot.id}/messages`, { method: "DELETE" })
        }
      >
        Clear memory
      </button>
      <button
        type="button"
        className="danger"
        onClick={async () => {
          await post(`/api/bots/${bot.id}`, { method: "DELETE" });
          onChanged();
        }}
      >
        Delete
      </button>
    </div>
  );
}

function BotForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/bots", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, system_prompt: systemPrompt }),
          });
          setName("");
          setSystemPrompt("");
          onCreated();
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        placeholder="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <textarea
        placeholder="system prompt (optional)"
        rows={2}
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
      />
      <button type="submit" disabled={busy}>
        Create bot
      </button>
    </form>
  );
}

function Triggers({ botId }: { botId: string }) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [message, setMessage] = useState("");
  const [schedule, setSchedule] = useState("0 * * * *");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Trigger[]>(`/api/bots/${botId}/triggers`).then(setTriggers, () =>
      setTriggers([]),
    );
  }, [botId]);

  const post = (init: RequestInit) =>
    api(`/api/bots/${botId}/triggers`, init).catch((e) => alert(e.message));

  return (
    <section className="triggers">
      <h2>Triggers</h2>
      {triggers.length === 0 && (
        <p className="muted">No triggers — the bot only runs on "Run now".</p>
      )}
      {triggers.map((t) => (
        <div className="trigger" key={t.id}>
          <code>{t.schedule}</code>
          <span>{fmt(t.next_run_at)}</span>
          <p>{t.message}</p>
          <button
            type="button"
            className="danger"
            onClick={() =>
              api(`/api/triggers/${t.id}`, { method: "DELETE" })
                .then(() =>
                  api<Trigger[]>(`/api/bots/${botId}/triggers`).then(
                    setTriggers,
                  ),
                )
                .catch((e) => alert(e.message))
            }
          >
            Remove
          </button>
        </div>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await post({
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message, schedule }),
            });
            setMessage("");
            const fresh = await api<Trigger[]>(
              `/api/bots/${botId}/triggers`,
            ).catch(() => triggers);
            setTriggers(fresh);
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea
          placeholder="message to inject on trigger"
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
        <input
          placeholder="cron or @every 30m"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          Add trigger
        </button>
      </form>
    </section>
  );
}
