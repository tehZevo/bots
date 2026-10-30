import { useEffect, useState } from "react";
import { UnsavedNote, useDirtyGuard } from "../../components/ui/discard.tsx";
import { api } from "../../lib/api.ts";
import { fmtTokens } from "../../lib/format.ts";
import type { Breaker } from "../../types.ts";

export function SpendCapSection() {
  const [cap, setCap] = useState(0);
  const [savedCap, setSavedCap] = useState<number | null>(null);
  const [usage30d, setUsage30d] = useState(0);
  const [savingCap, setSavingCap] = useState(false);

  useEffect(() => {
    void api<Breaker>("/api/breaker")
      .then((b) => {
        setCap(b.limit_tokens);
        setSavedCap(b.limit_tokens);
        setUsage30d(b.tokens_30d);
      })
      .catch(() => {});
  }, []);

  const capDirty = savedCap !== null && cap !== savedCap;
  useDirtyGuard("the spend circuit breaker cap", capDirty);

  const saveCap = async () => {
    setSavingCap(true);
    try {
      const b = await api<Breaker>("/api/breaker", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit_tokens: cap }),
      });
      setSavedCap(b.limit_tokens);
      setUsage30d(b.tokens_30d);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCap(false);
    }
  };

  return (
    <>
      <p className="muted">Spend circuit breaker cap</p>
      <div className="actions">
        <input
          type="number"
          min={0}
          aria-label="Spend circuit breaker token cap"
          value={cap}
          onChange={(e) =>
            setCap(Math.max(0, Math.floor(Number(e.target.value) || 0)))
          }
        />
        tokens / trailing 30 days (0 = unlimited · {fmtTokens(usage30d)} used)
        <button
          type="button"
          disabled={savingCap}
          onClick={() => void saveCap()}
        >
          Save
        </button>
        <UnsavedNote dirty={capDirty} />
      </div>
    </>
  );
}
