import { useCallback, useState } from "react";
import { usePolling } from "../hooks/usePolling.ts";
import { api } from "../lib/api.ts";
import type { Approval } from "../types.ts";

// specs/tools/approvals.md — pending tool calls for a bot, surfaced above the
// chat log so the user can release or reject them while the run waits.
export function ApprovalStrip({ botId }: { botId: string }) {
  const [items, setItems] = useState<Approval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await api<Approval[]>(
      `/api/approvals?bot=${botId}&status=pending`,
    ).catch(() => [] as Approval[]);
    setItems(rows);
  }, [botId]);

  usePolling(load, 2500);

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    try {
      await api(`/api/approvals/${id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
      void load();
    }
  }

  if (items.length === 0) return null;
  return (
    <section className="approvals" aria-label="Pending approvals">
      {items.map((a) => (
        <div className="approval" key={a.id}>
          <span className="approval-tool">{a.tool_name}</span>
          {!!a.args_summary && (
            <code className="approval-args">{a.args_summary}</code>
          )}
          <span className="approval-actions">
            <button
              type="button"
              disabled={busy === a.id}
              onClick={() => void decide(a.id, false)}
            >
              Deny
            </button>
            <button
              type="button"
              disabled={busy === a.id}
              onClick={() => void decide(a.id, true)}
            >
              Approve
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}
