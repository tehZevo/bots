import { useEffect, useState } from "react";
import { CloseIcon } from "../../components/icons/index.ts";
import { api } from "../../lib/api.ts";
import type { Tag } from "../../types.ts";
export function BotTags({ botId }: { botId: string }) {
  const [all, setAll] = useState<Tag[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [text, setText] = useState("");
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

  const q = text.trim().toLowerCase();
  const suggestions = all.filter(
    (t) => !attached.includes(t.id) && t.name.toLowerCase().includes(q),
  );

  const commit = async () => {
    const name = text.trim();
    if (!name || busy) return;
    const existing = all.find((t) => t.name.toLowerCase() === q);
    if (existing) {
      if (!attached.includes(existing.id)) save([...attached, existing.id]);
      setText("");
      return;
    }
    setBusy(true);
    try {
      const created = await api<Tag>("/api/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setAll((list) => [...list, created]);
      save([...attached, created.id]);
      setText("");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="bottags">
      <span>Tags</span>
      <div className="tagchips">
        {attached.map((id) => {
          const t = all.find((x) => x.id === id);
          if (!t) return null;
          return (
            <span key={id} className="chip">
              {t.name}
              <button
                type="button"
                aria-label={`Remove ${t.name}`}
                disabled={busy}
                onClick={() => save(attached.filter((x) => x !== id))}
              >
                <CloseIcon size={18} />
              </button>
            </span>
          );
        })}
      </div>
      <input
        className="tagadd"
        placeholder="Add tag — Enter attaches or creates"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
      />
      {q !== "" && (
        <div className="tagsuggest">
          {suggestions.slice(0, 8).map((t) => (
            <button
              type="button"
              key={t.id}
              disabled={busy}
              onClick={() => {
                save([...attached, t.id]);
                setText("");
              }}
            >
              {t.name}
            </button>
          ))}
          {suggestions.length === 0 && (
            <button type="button" disabled={busy} onClick={() => void commit()}>
              {`+ Create "${text.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
