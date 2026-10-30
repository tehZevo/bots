import { useEffect, useState } from "react";
import { api } from "../../lib/api.ts";
import type { Project } from "../../types.ts";
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
