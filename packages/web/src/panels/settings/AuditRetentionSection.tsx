import { useEffect, useState } from "react";
import { UnsavedNote, useDirtyGuard } from "../../components/ui/discard.tsx";
import { api } from "../../lib/api.ts";

export function AuditRetentionSection() {
  const [days, setDays] = useState(0);
  const [savedDays, setSavedDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<{ audit_retention_days: number }>("/api/settings")
      .then((s) => {
        setDays(s.audit_retention_days ?? 0);
        setSavedDays(s.audit_retention_days ?? 0);
      })
      .catch(() => {});
  }, []);

  const dirty = savedDays !== null && days !== savedDays;
  useDirtyGuard("the audit retention period", dirty);

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audit_retention_days: days }),
      });
      setSavedDays(days);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="muted">Audit log retention</p>
      <div className="actions">
        <input
          type="number"
          min={0}
          max={3650}
          aria-label="Audit log retention days"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        />
        days (0 = keep forever)
        <button type="button" disabled={saving} onClick={() => void save()}>
          Save
        </button>
        <UnsavedNote dirty={dirty} />
      </div>
    </>
  );
}
