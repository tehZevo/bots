import { useCallback, useEffect, useRef, useState } from "react";

interface Bot {
  id: string;
  name: string;
  description: string;
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
  const [tab, setTab] = useState<"bots" | "roles" | "settings">("bots");
  const [openBot, setOpenBot] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<"general" | "triggers" | "logs">(
    "general",
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [botQuery, setBotQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "running" | "enabled" | "disabled"
  >("all");
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
      (statusFilter === "all" || bot.status === statusFilter) &&
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
          {bots.filter((b) => b.status === "running").length} running
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
                {(["all", "running", "enabled", "disabled"] as const).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      className={statusFilter === s ? "sel" : ""}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s[0].toUpperCase() + s.slice(1)}
                    </button>
                  ),
                )}
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
                    <span className={`dot ${bot.status}`} title={bot.status} />
                    <strong>{bot.name}</strong>
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
                <h2>{openBotRow.name}</h2>
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
                {(["general", "triggers", "logs"] as const).map((t) => (
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
                  <>
                    <BotProfile
                      key={openBotRow.id}
                      bot={openBotRow}
                      onChanged={load}
                    />
                    <p className="statusline">
                      Status: <span className={`dot ${openBotRow.status}`} />{" "}
                      {openBotRow.status}
                    </p>
                    <BotActions bot={openBotRow} onChanged={load} />
                    <RoleSelect bot={openBotRow} onChanged={load} />
                  </>
                )}
                {modalTab === "triggers" && <Triggers botId={openBotRow.id} />}
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

function AddBotModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [roleId, setRoleId] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Role[]>("/api/roles").then(setRoles, () => setRoles([]));
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
        <input
          ref={(el) => el?.focus()}
          placeholder="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
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

const NAV_ITEMS = [
  { id: "bots", label: "Bots", icon: "▣" },
  { id: "roles", label: "Roles", icon: "❖" },
  { id: "settings", label: "Settings", icon: "⚙" },
] as const;

function Nav({
  tab,
  rail,
  onSelect,
}: {
  tab: "bots" | "roles" | "settings";
  rail: boolean;
  onSelect: (tab: "bots" | "roles" | "settings") => void;
}) {
  return (
    <nav className="sidetabs">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.label}
          className={tab === item.id ? "sel" : ""}
          onClick={() => onSelect(item.id)}
        >
          {rail ? item.icon : item.label}
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
  const [roleTab, setRoleTab] = useState<"general">("general");
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
              const body = JSON.stringify({ name, instructions });
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
          {(["general"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={roleTab === t ? "sel" : ""}
              onClick={() => setRoleTab(t)}
            >
              General
            </button>
          ))}
        </nav>
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

function BotProfile({
  bot,
  onChanged,
}: {
  bot: Bot | undefined;
  onChanged: () => void;
}) {
  const [name, setName] = useState(bot?.name ?? "");
  const [description, setDescription] = useState(bot?.description ?? "");
  const [busy, setBusy] = useState(false);

  if (!bot) return null;
  const dirty = name.trim() !== bot.name || description !== bot.description;
  return (
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
      {dirty && (
        <div className="actions">
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => {
              setBusy(true);
              api(`/api/bots/${bot.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, description }),
              })
                .then(onChanged)
                .catch((e) => alert(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

function BotActions({
  bot,
  onChanged,
}: {
  bot: Bot | undefined;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<"delete" | "clear" | null>(null);
  if (!bot) return null;
  const post = (path: string, init?: RequestInit) =>
    api(path, init).catch((e) => alert(e.message));
  return (
    <>
      <div className="actions">
        {bot.status === "running" && (
          <button
            type="button"
            onClick={() =>
              post(`/api/bots/${bot.id}/interrupt`, { method: "POST" }).then(
                onChanged,
              )
            }
          >
            Stop
          </button>
        )}
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
      {pending === "delete" && (
        <ConfirmDialog
          text={`Delete bot ${bot.name}? This removes the bot, its triggers and run history.`}
          confirmLabel="Delete bot"
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            setPending(null);
            await post(`/api/bots/${bot.id}`, { method: "DELETE" });
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
            post(`/api/bots/${bot.id}/messages`, { method: "DELETE" });
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
  const [message, setMessage] = useState("");
  const [schedule, setSchedule] = useState("0 * * * *");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Trigger | null>(null);

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
            onClick={() => setRemoving(t)}
          >
            Remove
          </button>
        </div>
      ))}
      {removing && (
        <ConfirmDialog
          text={`Remove trigger ${removing.schedule}? Its future fires stop; past runs stay.`}
          confirmLabel="Remove trigger"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            setRemoving(null);
            api(`/api/triggers/${removing.id}`, { method: "DELETE" })
              .then(() =>
                api<Trigger[]>(`/api/bots/${botId}/triggers`).then(setTriggers),
              )
              .catch((e) => alert(e.message));
          }}
        />
      )}
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
