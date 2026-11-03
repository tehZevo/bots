import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { fmt, fmtMs } from "../lib/format.ts";

interface Delivery {
  id: number;
  created_at: number;
  status: number;
  outcome: string;
  duration_ms: number;
  preview: string;
}

export function TriggerDeliveries({ triggerId }: { triggerId: string }) {
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    api<Delivery[]>(`/api/triggers/${triggerId}/deliveries`)
      .then((data) => {
        if (live) setRows(data);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, [triggerId]);

  if (rows === null) return <p className="muted">Loading deliveries…</p>;
  if (rows.length === 0) return <p className="muted">No webhook calls yet.</p>;

  return (
    <div className="deliveries">
      <p className="muted">Recent calls (newest first)</p>
      {rows.map((row) => (
        <div className="delivery" key={row.id}>
          <button
            type="button"
            className="deliveryhead"
            onClick={() => setOpen(open === row.id ? null : row.id)}
          >
            <span className={`badge ${badgeClass(row.outcome)}`}>
              {row.status}
            </span>
            <span className="deliveryoutcome">{row.outcome}</span>
            <span className="muted">{fmt(row.created_at)}</span>
            <span className="muted">{fmtMs(row.duration_ms)}</span>
          </button>
          {open === row.id && row.preview !== "" && (
            <pre className="deliverypreview">{row.preview}</pre>
          )}
        </div>
      ))}
    </div>
  );
}

function badgeClass(outcome: string): string {
  if (outcome === "accepted") return "ok";
  if (outcome === "unauthorized" || outcome === "not_found") return "error";
  return "warn";
}
