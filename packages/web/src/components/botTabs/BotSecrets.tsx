import { useEffect, useState } from "react";
import { api } from "../../lib/api.ts";
import type { SecretMeta } from "../../types.ts";
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
