import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { fmtMs } from "../lib/format.ts";
import type { Run, TranscriptStep } from "../types.ts";
export function ReplayStep({ step }: { step: TranscriptStep }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const clipped = step.kind === "tool_result" || step.kind === "tool_call";
  const toggle = () => setOpen(!open);
  const keyToggle = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  const clipProps = clipped
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick: toggle,
        onKeyDown: keyToggle,
      }
    : {};

  async function copyText(): Promise<void> {
    if (!step.text || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(step.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard access is best effort
    }
  }

  const showCopy =
    (step.kind === "assistant" || step.kind === "tool_result") && !!step.text;

  return (
    <div className={`rstep ${step.kind}${step.is_error ? " err" : ""}`}>
      <div className="rmeta">
        <span className={`rkind ${step.kind}`}>
          {step.kind.replace("_", " ")}
        </span>
        {step.name && <span className="rname">{step.name}</span>}
        {typeof step.duration_ms === "number" && (
          <span className="rtiming">{fmtMs(step.duration_ms)}</span>
        )}
        {!!step.retry_wait_ms && (
          <span className="rretry">retry wait {fmtMs(step.retry_wait_ms)}</span>
        )}
        {showCopy && (
          <span className="ractions">
            <button type="button" onClick={() => void copyText()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </span>
        )}
      </div>
      {step.args && (
        <pre
          className={`rcode${clipped && !open ? " clip" : ""}`}
          {...clipProps}
        >
          {step.args}
        </pre>
      )}
      {step.text &&
        (step.kind === "tool_result" ? (
          <pre
            className={`rcode${clipped && !open ? " clip" : ""}`}
            {...clipProps}
          >
            {step.text}
          </pre>
        ) : (
          <p className="rtext">{step.text}</p>
        ))}
    </div>
  );
}

export function ReplayPanel({ botId, run }: { botId: string; run: Run }) {
  const [data, setData] = useState<{
    usage: { total: number } | null;
    steps: TranscriptStep[];
  } | null>(null);
  useEffect(() => {
    let on = true;
    api<{
      usage: { total: number } | null;
      steps: TranscriptStep[];
    }>(`/api/bots/${botId}/runs/${run.id}/transcript`)
      .then((d) => on && setData(d))
      .catch(() => on && setData({ usage: null, steps: [] }));
    return () => {
      on = false;
    };
  }, [botId, run.id]);
  if (!data) return <p className="muted replay">Loading transcript…</p>;

  return (
    <div className="replay">
      <header>
        <span className={`status ${run.status}`}>{run.status}</span>
        <span>{run.trigger}</span>
        {data.usage && <span>{data.usage.total.toLocaleString()} tokens</span>}
      </header>
      {data.steps.length === 0 ? (
        <p className="muted">transcript not recorded</p>
      ) : (
        // biome-ignore lint/suspicious/noArrayIndexKey: transcript steps are append-only, position is their identity
        data.steps.map((s, i) => <ReplayStep key={i} step={s} />)
      )}
    </div>
  );
}
