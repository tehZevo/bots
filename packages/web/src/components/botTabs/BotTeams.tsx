import { useEffect, useState } from "react";
import { Multiselect } from "../../components/Multiselect.tsx";
import { api } from "../../lib/api.ts";
import type { Team } from "../../types.ts";
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
