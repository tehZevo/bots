import { useEffect, useState } from "react";
import { Multiselect } from "../../components/Multiselect.tsx";
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

  const change = (next: string[]) => {
    setBusy(true);
    api(`/api/bots/${botId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret_ids: next }),
    })
      .then(() => setAttached(next))
      .catch((e) => alert(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Multiselect
      label="Secrets"
      options={all.map((s) => ({ id: s.id, name: `${s.name} (${s.key})` }))}
      selected={attached}
      onChange={change}
      busy={busy}
      placeholder="Search secrets…"
    />
  );
}
