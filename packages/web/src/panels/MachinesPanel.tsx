import { useCallback, useState } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { UnsavedNote, useDiscardGuard } from "../components/ui/discard.tsx";
import { Modal } from "../components/ui/Modal.tsx";
import { usePolling } from "../hooks/usePolling.ts";
import { api } from "../lib/api.ts";
import type { Machine } from "../types.ts";

export function MachinesPanel() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [form, setForm] = useState<Machine | "new" | null>(null);
  const [removing, setRemoving] = useState<Machine | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      api<Machine[]>("/api/machines")
        .then(setMachines)
        .catch(() => setMachines([])),
    [],
  );

  const refresh = (m: Machine) => {
    setRefreshing(m.id);
    api(
      m.builtin
        ? "/api/machines/default/repull"
        : `/api/machines/${m.id}/rebuild`,
      { method: "POST" },
    )
      .then(reload)
      .catch((e) => alert(e.message))
      .finally(() => setRefreshing(null));
  };

  usePolling(reload, 4000);

  return (
    <section>
      <div className="viewhead">
        <h2>Machines</h2>
        <button type="button" onClick={() => setForm("new")}>
          Add machine
        </button>
      </div>
      <div className="mcpsection">
        {machines.map((m) => (
          <div className="mcpsrv" key={m.id}>
            <header>
              <strong>{m.name}</strong>
              {refreshing === m.id ? (
                <span className="muted">
                  {m.builtin ? "Pulling…" : "Building…"}
                </span>
              ) : (
                <button type="button" onClick={() => refresh(m)}>
                  {m.builtin ? "Repull" : "Rebuild"}
                </button>
              )}
              {!m.builtin && (
                <>
                  <button type="button" onClick={() => setForm(m)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setRemoving(m)}
                  >
                    Delete
                  </button>
                </>
              )}
              {m.builtin && <span className="muted">built-in</span>}
            </header>
            {m.description && <p className="line muted">{m.description}</p>}
            {m.image && <code>{m.image}</code>}
            {!m.builtin && !m.image && !m.build_error && (
              <p className="line muted">Built on first use by a bot.</p>
            )}
            {m.build_error && <pre className="error">{m.build_error}</pre>}
          </div>
        ))}
      </div>
      {removing && (
        <ConfirmDialog
          text={`Delete machine ${removing.name}? Bots still using it must switch machines first.`}
          confirmLabel="Delete machine"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const target = removing;
            setRemoving(null);
            api(`/api/machines/${target.id}`, { method: "DELETE" })
              .then(reload)
              .catch((e) => alert(e.message));
          }}
        />
      )}
      {form && (
        <MachineModal
          machine={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}

export function MachineModal({
  machine,
  onClose,
  onSaved,
}: {
  machine: Machine | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(machine?.name ?? "");
  const [description, setDescription] = useState(machine?.description ?? "");
  const [dockerfile, setDockerfile] = useState(machine?.dockerfile ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty =
    name !== (machine?.name ?? "") ||
    description !== (machine?.description ?? "") ||
    dockerfile !== (machine?.dockerfile ?? "");
  const attemptClose = useDiscardGuard(
    machine ? `machine ${machine.name}` : "this new machine",
    dirty,
    onClose,
  );

  return (
    <Modal
      scrimOnCancel={attemptClose}
      scrimLabel="Close"
      className="dialog"
      role="dialog"
      aria-label="Machine"
    >
      <h2>{machine ? "Edit machine" : "Add machine"}</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(
              machine ? `/api/machines/${machine.id}` : "/api/machines",
              {
                method: machine ? "PATCH" : "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, description, dockerfile }),
              },
            );
            onSaved();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Description (optional)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Dockerfile
          <textarea
            className="code"
            rows={14}
            spellCheck={false}
            placeholder={
              "FROM ghcr.io/tehzevo/bots-sandbox:latest\nRUN apt-get update && apt-get install -y ripgrep"
            }
            value={dockerfile}
            onChange={(e) => setDockerfile(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : machine ? "Save" : "Create"}
          </button>
          <UnsavedNote dirty={dirty} />
          <button type="button" onClick={attemptClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
