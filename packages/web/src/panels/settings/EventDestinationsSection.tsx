import { useCallback, useEffect, useState } from "react";

const HOOK_EVENT_OPTIONS: [string, string][] = [
  ["run.finished", "Run finished"],
  ["bot.blocked", "Bot blocked"],
  ["bot.recovered", "Bot recovered"],
  ["notification.created", "Notification created"],
  ["breaker.tripped", "Breaker tripped"],
];

import { CloseIcon } from "../../components/icons/index.ts";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.tsx";
import { useDiscardGuard } from "../../components/ui/discard.tsx";
import { Modal } from "../../components/ui/Modal.tsx";
import { api } from "../../lib/api.ts";
import type { HookDestination, HookTestResult } from "../../types.ts";
export function EventDestinationsSection() {
  const [destinations, setDestinations] = useState<HookDestination[]>([]);
  const [editing, setEditing] = useState<{
    destination: HookDestination | null;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HookDestination | null>(
    null,
  );
  const [testState, setTestState] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setDestinations(await api<HookDestination[]>("/api/hooks"));
    } catch {
      setDestinations([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setEnabled = async (destination: HookDestination, enabled: boolean) => {
    try {
      await api(`/api/hooks/${destination.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: destination.name,
          url: destination.url,
          event_types: destination.event_types,
          enabled,
        }),
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const sendTest = async (destination: HookDestination) => {
    setTestState((current) => ({ ...current, [destination.id]: "Sending…" }));
    try {
      const result = await api<HookTestResult>(
        `/api/hooks/${destination.id}/test`,
        {
          method: "POST",
        },
      );
      const status = result.status ?? (result.ok ? "ok" : "error");
      setTestState((current) => ({
        ...current,
        [destination.id]: `${status} · ${result.duration_ms} ms${result.error ? ` · ${result.error}` : ""}`,
      }));
    } catch (e) {
      setTestState((current) => ({
        ...current,
        [destination.id]: e instanceof Error ? e.message : String(e),
      }));
    }
  };

  const remove = async (destination: HookDestination) => {
    try {
      await api(`/api/hooks/${destination.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <p className="muted">Event destinations</p>
      <ul className="plist">
        {destinations.map((destination) => (
          <li key={destination.id}>
            <div className="pinfo">
              <strong>{destination.name}</strong>
              <span className="muted">{destination.url}</span>
              <span className="muted">
                {destination.event_types.length > 0
                  ? destination.event_types
                      .map(
                        (type) =>
                          HOOK_EVENT_OPTIONS.find(
                            ([value]) => value === type,
                          )?.[1] ?? type,
                      )
                      .join(", ")
                  : "No events"}
              </span>
              <span className="muted">
                Secret: {destination.has_secret ? "••••" : "not set"}
              </span>
            </div>
            <div className="actions">
              <button
                type="button"
                disabled={
                  testState[destination.id] === "Sending…" ||
                  destination.enabled !== 1
                }
                onClick={() => void sendTest(destination)}
              >
                Send test
              </button>
              {testState[destination.id] && (
                <span className="state">{testState[destination.id]}</span>
              )}
              <button type="button" onClick={() => setEditing({ destination })}>
                Edit
              </button>
              <button
                type="button"
                onClick={() =>
                  void setEnabled(destination, destination.enabled !== 1)
                }
              >
                {destination.enabled === 1 ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(destination)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" onClick={() => setEditing({ destination: null })}>
          Add destination
        </button>
      </div>

      {editing && (
        <EventDestinationModal
          destination={editing.destination}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          text={`Delete ${confirmDelete.name}? Delivery logs are removed too.`}
          confirmLabel="Delete destination"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void remove(confirmDelete)}
        />
      )}
    </>
  );
}

export function EventDestinationModal({
  destination,
  onClose,
  onSaved,
}: {
  destination: HookDestination | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(destination?.name ?? "");
  const [url, setUrl] = useState(destination?.url ?? "");
  const [secret, setSecret] = useState("");
  const [eventTypes, setEventTypes] = useState<string[]>(
    destination?.event_types ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== (destination?.name ?? "") ||
    url !== (destination?.url ?? "") ||
    secret !== "" ||
    eventTypes.join(",") !== (destination?.event_types ?? []).join(",");
  const attemptClose = useDiscardGuard(
    destination ? `destination ${destination.name}` : "this new destination",
    dirty,
    onClose,
  );

  let validUrl: URL | null = null;
  try {
    validUrl = url.trim() ? new URL(url.trim()) : null;
  } catch {
    validUrl = null;
  }
  const canSave = Boolean(
    name.trim() &&
      (validUrl?.protocol === "http:" || validUrl?.protocol === "https:"),
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        url: url.trim(),
        event_types: eventTypes,
      };
      if (secret !== "") body.secret = secret;
      await api(destination ? `/api/hooks/${destination.id}` : "/api/hooks", {
        method: destination ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal scrimOnCancel={attemptClose} className="dialog">
      <div className="viewhead">
        <h2>{destination ? `Edit ${destination.name}` : "Add destination"}</h2>
        <button
          type="button"
          className="close"
          aria-label="Cancel"
          onClick={attemptClose}
        >
          <CloseIcon size={18} />
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <label className="field">
        Name
        <input
          aria-label="Destination name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        URL
        <input
          aria-label="Destination URL"
          placeholder="https://example.com/hooks/bots"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="field">
        Secret
        <input
          type="password"
          aria-label="Destination secret"
          placeholder={
            destination?.has_secret ? "saved — leave empty to keep" : ""
          }
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
      </label>
      <p className="muted">Events</p>
      <ul className="modellist">
        {HOOK_EVENT_OPTIONS.map(([value, label]) => (
          <li key={value}>
            <label>
              <input
                type="checkbox"
                aria-label={label}
                checked={eventTypes.includes(value)}
                onChange={() =>
                  setEventTypes((current) =>
                    current.includes(value)
                      ? current.filter((x) => x !== value)
                      : [...current, value],
                  )
                }
              />{" "}
              {label}
            </label>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button
          type="button"
          disabled={busy || !canSave}
          onClick={() => void save()}
        >
          {busy
            ? "Saving…"
            : destination
              ? "Save destination"
              : "Add destination"}
        </button>
      </div>
    </Modal>
  );
}
