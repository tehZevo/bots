import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { UnsavedNote, useDirtyGuard } from "../components/ui/discard.tsx";
import { SwitchToggle } from "../components/ui/SwitchToggle.tsx";
import { api } from "../lib/api.ts";
import { fmt } from "../lib/format.ts";
import { ScheduleEditor } from "../schedule.tsx";
import { Run, type Trigger } from "../types.ts";
export function Triggers({ botId }: { botId: string }) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 * * * *");
  const [kind, setKind] = useState<"schedule" | "webhook" | "continuous">(
    "schedule",
  );
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Trigger | null>(null);
  const [rotating, setRotating] = useState<Trigger | null>(null);

  const reload = useCallback(
    () =>
      api<Trigger[]>(`/api/bots/${botId}/triggers`)
        .then((rows) => {
          setTriggers(rows);
          setSel((cur) =>
            cur === "new" || rows.some((r) => r.id === cur)
              ? cur
              : (rows[0]?.id ?? null),
          );
        })
        .catch(() => setTriggers([])),
    [botId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const current = triggers.find((t) => t.id === sel) ?? null;

  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/api/triggers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const select = (id: string | null) => {
    setSel(id);
    document.getElementById("trig-editor")?.scrollIntoView({ block: "start" });
  };

  return (
    <section className="triggers">
      <div className="trigmd">
        <nav className="tlist" aria-label="Triggers">
          <button type="button" onClick={() => select("new")}>
            + Add trigger
          </button>
          {triggers.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`trow${sel === t.id ? " sel" : ""}${t.enabled ? "" : " off"}`}
              onClick={() => select(t.id)}
            >
              <span className="trowtop">
                {t.name ||
                  (t.kind === "webhook"
                    ? `webhook ${t.id.slice(0, 8)}`
                    : t.schedule)}
              </span>
              <span className="trowsub">
                {t.kind === "webhook"
                  ? "Webhook"
                  : t.kind === "continuous"
                    ? "Continuous"
                    : "Schedule"}
                {t.enabled ? "" : " (paused)"}
              </span>
            </button>
          ))}
        </nav>
        <div className="teditor" id="trig-editor">
          {current && (
            <button
              type="button"
              className="tback"
              onClick={() =>
                document
                  .querySelector(".tlist")
                  ?.scrollIntoView({ block: "start" })
              }
            >
              ← Triggers
            </button>
          )}
          {sel === null && (
            <p className="muted">
              No triggers — the bot only runs on &quot;Run now&quot;.
            </p>
          )}
          {sel === "new" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const body: Record<string, unknown> = {
                    message,
                    kind,
                    name: name.trim() || null,
                  };
                  if (kind === "schedule") body.schedule = schedule;
                  const res = await api<Trigger & { secret?: string }>(
                    `/api/bots/${botId}/triggers`,
                    {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify(body),
                    },
                  ).catch((err) => {
                    alert(err.message);
                    return null;
                  });
                  if (res) {
                    if (res.secret)
                      setCreated({ id: res.id, secret: res.secret });
                    setMessage("");
                    await reload();
                    setSel(res?.id ?? null);
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                Type
                <select
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as
                      | "schedule"
                      | "webhook"
                      | "continuous";
                    setKind(k);
                    if (k === "continuous") setSchedule("@every 30m");
                    else if (k !== "webhook" && schedule.startsWith("@"))
                      setSchedule("0 * * * *");
                  }}
                >
                  <option value="schedule">Schedule</option>
                  <option value="webhook">Webhook</option>
                  <option value="continuous">Continuous</option>
                </select>
              </label>
              <label className="field">
                Name (optional)
                <input
                  placeholder="e.g. nightly sweep"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                Message
                <textarea
                  placeholder="message to inject on trigger"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </label>
              {kind === "schedule" && (
                <ScheduleEditor value={schedule} onChange={setSchedule} />
              )}
              {kind === "continuous" && (
                <input
                  placeholder="@every 30m (min 1m)"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  required
                />
              )}
              <div className="actions">
                <button type="submit" disabled={busy}>
                  Create trigger
                </button>
                <button type="button" onClick={() => setSel(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {current && (
            <TriggerEditor
              key={current.id}
              trigger={current}
              onPatch={patch}
              onRotate={() => setRotating(current)}
              onRemove={() => setRemoving(current)}
              secret={created?.id === current.id ? created.secret : null}
            />
          )}
        </div>
      </div>
      {removing && (
        <ConfirmDialog
          text={`Remove trigger ${removing.kind === "webhook" ? removing.id : removing.schedule}? Its future fires stop; past runs stay.`}
          confirmLabel="Remove trigger"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            setRemoving(null);
            api(`/api/triggers/${removing.id}`, { method: "DELETE" })
              .then(reload)
              .catch((e) => alert(e.message));
          }}
        />
      )}
      {rotating && (
        <ConfirmDialog
          text={`Rotate the webhook secret for ${rotating.id}? The current secret stops working immediately — integrations break until updated.`}
          confirmLabel="Rotate secret"
          onCancel={() => setRotating(null)}
          onConfirm={() => {
            const t = rotating;
            setRotating(null);
            api<{ secret: string }>(`/api/triggers/${t.id}/rotate-secret`, {
              method: "POST",
            })
              .then((r) => {
                setCreated({ id: t.id, secret: r.secret });
                void reload();
              })
              .catch((e) => alert(e.message));
          }}
        />
      )}
    </section>
  );
}

export function nextRunLabel(trigger: Trigger): string | null {
  if (trigger.kind !== "schedule" || trigger.enabled !== 1) return null;
  return `next: ${fmt(trigger.next_run_at)}`;
}

export function TriggerEditor({
  trigger,
  onPatch,
  onRotate,
  onRemove,
  secret,
}: {
  trigger: Trigger;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  onRotate: () => void;
  onRemove: () => void;
  secret: string | null;
}) {
  const [name, setName] = useState(trigger.name ?? "");
  const [message, setMessage] = useState(trigger.message);
  const [schedule, setSchedule] = useState(trigger.schedule);
  const [busy, setBusy] = useState(false);
  const dirty =
    name !== (trigger.name ?? "") ||
    message !== trigger.message ||
    (trigger.kind === "schedule" && schedule !== trigger.schedule);
  useDirtyGuard(
    trigger.name?.trim()
      ? `the trigger ${trigger.name}`
      : `this ${trigger.kind} trigger`,
    dirty,
  );
  const nextRun = nextRunLabel(trigger);
  return (
    <>
      <div className="tedithead">
        <SwitchToggle
          ariaLabel="Trigger enabled"
          checked={trigger.enabled === 1}
          onChange={() =>
            void onPatch(trigger.id, { enabled: trigger.enabled !== 1 })
          }
          stateLabel={trigger.enabled === 1 ? "Enabled" : "Disabled"}
        />
        {trigger.kind === "webhook" ? (
          <code>{`POST /api/webhooks/${trigger.id}`}</code>
        ) : nextRun ? (
          <span className="muted">{nextRun}</span>
        ) : null}
      </div>
      <label className="field">
        Name (optional)
        <input
          placeholder="e.g. nightly sweep"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        Message
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      {trigger.kind === "schedule" && (
        <ScheduleEditor value={schedule} onChange={setSchedule} />
      )}
      {trigger.kind === "continuous" && (
        <input
          placeholder="@every 30m (min 1m)"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
        />
      )}
      <div className="actions">
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() => {
            setBusy(true);
            void onPatch(trigger.id, {
              name: name.trim() || null,
              message,
              ...(trigger.kind === "webhook" ? {} : { schedule }),
            }).finally(() => setBusy(false));
          }}
        >
          Save
        </button>
        <UnsavedNote dirty={dirty} />
        {trigger.kind === "webhook" && (
          <button type="button" onClick={onRotate}>
            Rotate secret
          </button>
        )}
      </div>
      {secret && (
        <div className="secretbox">
          <p>
            Secret (shown once — store it now):{" "}
            <code className="secret">{secret}</code>
          </p>
        </div>
      )}
      <button type="button" className="danger" onClick={onRemove}>
        Remove
      </button>
    </>
  );
}
