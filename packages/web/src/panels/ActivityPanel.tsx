// specs/audit/log.md — Activity tab: read-only global feed with filters.
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { relTime } from "../lib/format.ts";

interface AuditRow {
  id: number;
  created_at: number;
  actor_kind: string;
  actor_name: string;
  action: string;
  target_kind: string;
  target_id: string | null;
  target_name: string | null;
  summary: string | null;
}

const ACTORS = ["", "user", "bot", "trigger", "system"];
const TYPES = [
  "",
  "auth",
  "bot",
  "chat",
  "run",
  "tool",
  "trigger",
  "key",
  "config",
  "global",
  "watchdog",
  "breaker",
  "audit",
];

export function ActivityPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actor, setActor] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (actor) params.set("actor", actor);
    if (type) params.set("type", type);
    if (q.trim()) params.set("q", q.trim());
    if (since) params.set("since", since);
    if (until) params.set("until", `${until}T23:59:59.999`);
    try {
      setRows(await api<AuditRow[]>(`/api/audit?${params.toString()}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [actor, type, q, since, until]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label="Activity">
      <h2>Activity</h2>
      <div className="actions" role="search">
        <select
          aria-label="Actor kind"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
        >
          {ACTORS.map((a) => (
            <option key={a} value={a}>
              {a ? a : "All actors"}
            </option>
          ))}
        </select>
        <select
          aria-label="Action type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t ? t : "All actions"}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Filter activity"
          placeholder="Target or summary…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="muted">
          from
          <input
            type="date"
            aria-label="Since date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
        </label>
        <label className="muted">
          to
          <input
            type="date"
            aria-label="Until date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
      </div>
      {error && <p className="muted">{error}</p>}
      {!error && rows.length === 0 && (
        <p className="muted">Nothing has happened yet.</p>
      )}
      <ul className="auditlist">
        {rows.map((r) => (
          <li key={r.id}>
            <time dateTime={new Date(r.created_at).toISOString()}>
              {relTime(r.created_at)}
            </time>
            <span className={`auditactor auditactor-${r.actor_kind}`}>
              {r.actor_kind}
            </span>
            <strong>{r.actor_name}</strong> <code>{r.action}</code>{" "}
            <span className="muted">
              {r.target_name ?? r.target_kind}
              {r.summary ? ` — ${r.summary}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
