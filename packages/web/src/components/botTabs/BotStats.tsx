import { useCallback, useEffect, useState } from "react";
import { usePolling } from "../../hooks/usePolling.ts";
import { api } from "../../lib/api.ts";
import type { ContextBreakdownData, UsageTotals } from "../../types.ts";
import { CTX_ROWS, pctOf } from "./BotFiles.tsx";
export function BotStats({
  botId,
  running = false,
}: {
  botId: string;
  running?: boolean;
}) {
  const zero: UsageTotals = {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    total: 0,
  };
  const [totals, setTotals] = useState<{
    lifetime: UsageTotals;
    last30d: UsageTotals;
    budget: number | null;
  }>({ lifetime: zero, last30d: zero, budget: null });
  const [budgetText, setBudgetText] = useState("");
  const [budgetDirty, setBudgetDirty] = useState(false);

  const [ctx, setCtx] = useState<ContextBreakdownData | null>(null);

  useEffect(() => {
    let active = true;
    api<{
      lifetime: UsageTotals;
      last30d: UsageTotals;
      budget: number | null;
    }>(`/api/bots/${botId}/usage`)
      .then((data) => {
        if (!active) return;
        setTotals(data);
        setBudgetText(data.budget == null ? "" : String(data.budget));
        setBudgetDirty(false);
      })
      .catch(() => undefined);
    api<ContextBreakdownData>(`/api/bots/${botId}/context-usage`)
      .then((data) => {
        if (active) setCtx(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [botId]);

  const loadCtx = useCallback(
    () =>
      api<ContextBreakdownData>(`/api/bots/${botId}/context-usage`).then(
        setCtx,
      ),
    [botId],
  );
  usePolling(loadCtx, 3000, { enabled: running, immediate: false });

  const saveBudget = async () => {
    const trimmed = budgetText.trim();
    const parsed = trimmed === "" ? null : Math.floor(Number(trimmed));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) return;
    await api(`/api/bots/${botId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token_budget: parsed }),
    }).catch(() => undefined);
    const data = await api<{
      lifetime: UsageTotals;
      last30d: UsageTotals;
      budget: number | null;
    }>(`/api/bots/${botId}/usage`).catch(() => null);
    if (data) {
      setTotals(data);
      setBudgetText(data.budget == null ? "" : String(data.budget));
    }
    setBudgetDirty(false);
  };

  const nf = new Intl.NumberFormat();
  const rows: [string, keyof UsageTotals][] = [
    ["Input", "input"],
    ["Output", "output"],
    ["Cache read", "cache_read"],
    ["Cache write", "cache_write"],
    ["Total", "total"],
  ];
  const budget = totals.budget;
  const pct =
    budget && budget > 0
      ? Math.min(100, Math.round((totals.last30d.total / budget) * 100))
      : 0;
  return (
    <section className="stats">
      {budget != null && (
        <div className="budgetbox">
          <div className="budgetline">
            <span>
              {nf.format(totals.last30d.total)} of {nf.format(budget)} tokens in
              the last 30 days ({pct}%)
            </span>
            {totals.last30d.total >= budget && (
              <span className="status error">exhausted</span>
            )}
          </div>
          <div className="budgetbar" aria-hidden="true">
            <div
              className={totals.last30d.total >= budget ? "fill over" : "fill"}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      <table className="usagetable">
        <thead>
          <tr>
            <th>Tokens</th>
            <th>Lifetime</th>
            <th>Last 30 days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key]) => (
            <tr key={key}>
              <td>{label}</td>
              <td>{nf.format(totals.lifetime[key])}</td>
              <td>{nf.format(totals.last30d[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="budgetedit">
        <label>
          30-day token budget
          <input
            type="number"
            min={1}
            step={1}
            value={budgetText}
            placeholder="unlimited"
            onChange={(e) => {
              setBudgetText(e.target.value);
              setBudgetDirty(true);
            }}
          />
        </label>
        <button
          type="button"
          disabled={!budgetDirty}
          onClick={() => void saveBudget()}
        >
          Save budget
        </button>
      </div>
      <div className="ctxbox">
        <h3>Current context (estimated)</h3>
        {ctx && ctx.context_window != null ? (
          <>
            <div className="ctxbar" aria-hidden="true">
              <div
                className="seg seg-sys"
                style={{
                  width: `${pctOf(ctx.categories.system_prompt, ctx.context_window)}%`,
                }}
              />
              <div
                className="seg seg-tools"
                style={{
                  width: `${pctOf(ctx.categories.tools, ctx.context_window)}%`,
                }}
              />
              <div
                className="seg seg-conv"
                style={{
                  width: `${pctOf(ctx.categories.conversation, ctx.context_window)}%`,
                }}
              />
            </div>
            <ul className="ctxlegend">
              {CTX_ROWS.map(([label, key, cls]) => {
                const tokens =
                  key === "free" ? (ctx.free ?? 0) : ctx.categories[key];
                return (
                  <li key={key}>
                    <span className={`dot ${cls}`} aria-hidden="true" />
                    <span>{label}</span>
                    <span>{nf.format(tokens)}</span>
                    <span>{pctOf(tokens, ctx.context_window ?? 0)}%</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="muted">
            {ctx
              ? `~${nf.format(ctx.used)} tokens in use — no model configured`
              : "Loading…"}
          </p>
        )}
      </div>
      <p className="muted">
        A run that reaches the budget stops after its current turn; raising or
        clearing the budget lets the next run proceed.
      </p>
    </section>
  );
}
