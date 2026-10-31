import { useEffect, useState } from "react";
import { UnsavedNote, useDirtyGuard } from "../../components/ui/discard.tsx";
import { api } from "../../lib/api.ts";

export function SandboxCapsSection() {
  const [memMb, setMemMb] = useState(1024);
  const [cpu, setCpu] = useState("1");
  const [saved, setSaved] = useState<{ mem: number; cpu: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<{ sandbox_memory_mb: number; sandbox_cpu: number }>(
      "/api/settings",
    )
      .then((s) => {
        setMemMb(s.sandbox_memory_mb);
        const cpuText = String(s.sandbox_cpu);
        setCpu(cpuText);
        setSaved({ mem: s.sandbox_memory_mb, cpu: cpuText });
      })
      .catch(() => {});
  }, []);

  const dirty =
    saved !== null && (memMb !== saved.mem || cpu.trim() !== saved.cpu);
  useDirtyGuard("the sandbox resource caps", dirty);

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sandbox_memory_mb: memMb,
          sandbox_cpu: Number(cpu),
        }),
      });
      setSaved({ mem: memMb, cpu: cpu.trim() });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="muted">Sandbox resource caps</p>
      <div className="actions">
        <input
          type="number"
          min={64}
          max={131072}
          aria-label="Sandbox memory cap in megabytes"
          value={memMb}
          onChange={(e) => setMemMb(Number(e.target.value))}
        />
        MB memory
      </div>
      <div className="actions">
        <input
          type="number"
          min={0.1}
          max={32}
          step={0.1}
          aria-label="Sandbox CPU cap in cores"
          value={cpu}
          onChange={(e) => setCpu(e.target.value)}
        />
        CPUs
        <button type="button" disabled={saving} onClick={() => void save()}>
          Save
        </button>
        <UnsavedNote dirty={dirty} />
      </div>
    </>
  );
}
