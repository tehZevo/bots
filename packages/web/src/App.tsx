import { useCallback, useEffect, useState } from "react";

interface Bot {
  id: string;
  name: string;
  system_prompt: string;
  model_id: string | null;
  enabled: number;
  created_at: number;
  status: "running" | "enabled" | "disabled";
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
  const [selected, setSelected] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    if (!selected) return;
    const loadRuns = async () =>
      setRuns(await api<Run[]>(`/api/bots/${selected}/runs`));
    void loadRuns();
    const t = setInterval(loadRuns, 3000);
    return () => clearInterval(t);
  }, [selected]);

  return (
    <div className="layout">
      <aside>
        <h1>Bots</h1>
        {error && <p className="error">{error}</p>}
        <ul>
          {bots.map((bot) => (
            <li key={bot.id}>
              <button
                type="button"
                className={selected === bot.id ? "sel" : ""}
                onClick={() => setSelected(bot.id)}
              >
                <span className={bot.enabled ? "dot on" : "dot"} /> {bot.name}
              </button>
            </li>
          ))}
        </ul>
        <BotForm onCreated={load} />
      </aside>
      <div className="mobilebar">
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="" disabled>
            Select a bot…
          </option>
          {bots.map((bot) => (
            <option key={bot.id} value={bot.id}>
              {bot.enabled ? "●" : "○"} {bot.name}
            </option>
          ))}
        </select>
        <details className="newbot">
          <summary>New bot</summary>
          <BotForm onCreated={load} />
        </details>
      </div>
      <main>
        <nav className="tabs">
          <button
            type="button"
            className={!selected ? "tab sel" : "tab"}
            onClick={() => setSelected(null)}
          >
            Bots
          </button>
          {selected && (
            <button type="button" className="tab sel">
              {bots.find((b) => b.id === selected)?.name ?? "Bot"}
            </button>
          )}
        </nav>
        {!selected && (
          <>
            <div className="cards">
              {bots.map((bot) => (
                <button
                  type="button"
                  key={bot.id}
                  className="card"
                  onClick={() => setSelected(bot.id)}
                >
                  <strong>{bot.name}</strong>
                  <span className={`status ${bot.status}`}>{bot.status}</span>
                </button>
              ))}
            </div>
            {bots.length === 0 && <p>No bots yet — create one above.</p>}
          </>
        )}
        {selected && (
          <div>
            <BotActions
              bot={bots.find((b) => b.id === selected)}
              onChanged={load}
            />
            <Triggers botId={selected} />
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
