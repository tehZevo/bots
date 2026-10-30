import { useEffect, useState } from "react";
import { UnsavedNote, useDirtyGuard } from "../../components/ui/discard.tsx";
import { api } from "../../lib/api.ts";

export function SandboxIdleSection() {
  const [idle, setIdle] = useState(5);
  const [savedIdle, setSavedIdle] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<{ sandbox_idle_minutes: number }>("/api/settings")
      .then((s) => {
        setIdle(s.sandbox_idle_minutes);
        setSavedIdle(s.sandbox_idle_minutes);
      })
      .catch(() => {});
  }, []);

  const idleDirty = savedIdle !== null && idle !== savedIdle;
  useDirtyGuard("the sandbox idle timeout", idleDirty);

  const saveIdle = async () => {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sandbox_idle_minutes: idle }),
      });
      setSavedIdle(idle);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="muted">Sandbox idle timeout</p>
      <div className="actions">
        <input
          type="number"
          min={0}
          max={1440}
          aria-label="Sandbox idle timeout"
          value={idle}
          onChange={(e) => setIdle(Number(e.target.value))}
        />
        minutes
        <button type="button" disabled={saving} onClick={() => void saveIdle()}>
          Save
        </button>
        <UnsavedNote dirty={idleDirty} />
      </div>
    </>
  );
}
