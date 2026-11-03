import { useEffect, useState } from "react";
import { api } from "../../lib/api.ts";
import type { Tag } from "../../types.ts";
import { Multiselect } from "../Multiselect.tsx";

export function BotTags({ botId }: { botId: string }) {
  const [all, setAll] = useState<Tag[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
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

  const create = async (name: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      const created = await api<Tag>("/api/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setAll((list) => [...list, created]);
      save([...attached, created.id]);
      return true;
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
      return false;
    }
  };

  return (
    <div className="bottags">
      <span>Tags</span>
      <Multiselect
        label="Tags"
        options={all.map((t) => ({ id: t.id, name: t.name }))}
        selected={attached}
        onChange={save}
        busy={busy}
        placeholder="Search tags"
        onCreate={(name) => create(name)}
      />
    </div>
  );
}
