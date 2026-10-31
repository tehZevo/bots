import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { CloseIcon } from "../components/icons/CloseIcon.tsx";
import { WarnIcon } from "../components/icons/WarnIcon.tsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { UnsavedNote, useDiscardGuard } from "../components/ui/discard.tsx";
import { ModalForm } from "../components/ui/Modal.tsx";
import { api } from "../lib/api.ts";
import type { Machine, Role, Template, TemplateTrigger } from "../types.ts";

export function TemplateEditorModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Omit<Template, "id" | "created_at"> & { id?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [machineId, setMachineId] = useState(initial.machine_id ?? "");
  const [roleId, setRoleId] = useState(initial.role_id ?? "");
  const [triggers, setTriggers] = useState<TemplateTrigger[]>(initial.triggers);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const snap = useRef({
    name: initial.name,
    description: initial.description,
    instructions: initial.instructions,
    machine_id: initial.machine_id ?? "",
    role_id: initial.role_id ?? "",
    triggers: JSON.stringify(initial.triggers),
  }).current;
  const dirty =
    name !== snap.name ||
    description !== snap.description ||
    instructions !== snap.instructions ||
    machineId !== snap.machine_id ||
    roleId !== snap.role_id ||
    JSON.stringify(triggers) !== snap.triggers;
  const attemptClose = useDiscardGuard(
    initial.id ? `template ${initial.name}` : "this new template",
    dirty,
    onClose,
  );

  useEffect(() => {
    void api<Role[]>("/api/roles").then(setRoles, () => setRoles([]));
    void api<Machine[]>("/api/machines")
      .then((ms) => setMachines(ms.filter((m) => !m.builtin)))
      .catch(() => setMachines([]));
  }, []);

  const missing = [
    machineId && !machines.some((m) => m.id === machineId) ? "machine" : null,
    roleId && !roles.some((r) => r.id === roleId) ? "role" : null,
  ].filter(Boolean);

  async function submitTemplate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = JSON.stringify({
        name,
        description,
        instructions,
        machine_id: machineId || null,
        role_id: roleId || null,
        triggers,
      });
      await api(
        initial.id ? `/api/templates/${initial.id}` : "/api/templates",
        {
          method: initial.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body,
        },
      );
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <ModalForm
      scrimOnCancel={attemptClose}
      className="dialog narrow"
      role="dialog"
      aria-label="Template"
      onSubmit={submitTemplate}
    >
      <div className="viewhead">
        <h2>{initial.id ? "Edit template" : "New template"}</h2>
        <button
          type="button"
          className="close"
          aria-label="Cancel"
          onClick={attemptClose}
        >
          <CloseIcon size={18} />
        </button>
      </div>
      <input
        placeholder="template name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        placeholder="description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <textarea
        placeholder="instructions (optional)"
        rows={3}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
      />
      {missing.length > 0 && (
        <p className="warnline">
          <WarnIcon size={14} /> referenced {missing.join(" and ")} deleted
        </p>
      )}
      <p className="rolepick">
        Role{" "}
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">None</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </p>
      <p className="rolepick">
        Machine{" "}
        <select
          value={machineId}
          onChange={(e) => setMachineId(e.target.value)}
        >
          <option value="">Default</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </p>
      <p className="muted">Starter triggers</p>
      {triggers.map((t, i) => (
        <div className="keyrow" key={i}>
          <input
            placeholder="message"
            value={t.message}
            onChange={(e) =>
              setTriggers((ts) =>
                ts.map((x, j) =>
                  j === i ? { ...x, message: e.target.value } : x,
                ),
              )
            }
          />
          <input
            className="sched"
            placeholder="@every 1h"
            value={t.schedule}
            onChange={(e) =>
              setTriggers((ts) =>
                ts.map((x, j) =>
                  j === i ? { ...x, schedule: e.target.value } : x,
                ),
              )
            }
          />
          <button
            type="button"
            aria-label={`Remove trigger ${i + 1}`}
            onClick={() => setTriggers((ts) => ts.filter((_, j) => j !== i))}
          >
            <CloseIcon size={18} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setTriggers((ts) => [...ts, { message: "", schedule: "@every 1h" }])
        }
      >
        Add trigger
      </button>
      <div className="actions">
        <button type="submit" disabled={busy}>
          Save
        </button>
        <UnsavedNote dirty={dirty} />
        <button type="button" onClick={attemptClose}>
          Cancel
        </button>
      </div>
    </ModalForm>
  );
}

export function TemplatesPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<
    (Omit<Template, "id" | "created_at"> & { id?: string }) | null
  >(null);
  const [removing, setRemoving] = useState<Template | null>(null);

  const reload = useCallback(
    () =>
      api<Template[]>("/api/templates")
        .then(setTemplates)
        .catch(() => setTemplates([])),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!openId) return;
    const template = templates.find((candidate) => candidate.id === openId);
    if (!template) return;
    setEditing(template);
    onOpened?.();
  }, [onOpened, openId, templates]);

  return (
    <section>
      <div className="viewhead">
        <button
          type="button"
          onClick={() =>
            setEditing({
              name: "",
              description: "",
              instructions: "",
              machine_id: null,
              role_id: null,
              triggers: [],
            })
          }
        >
          Add template
        </button>
      </div>
      <div className="mcpsection">
        {templates.length === 0 && (
          <p className="muted">No templates yet — add one above.</p>
        )}
        {templates.map((t) => (
          <div className="mcpsrv" key={t.id}>
            <header>
              <strong>{t.name}</strong>
              <button type="button" onClick={() => setEditing(t)}>
                Edit
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => setRemoving(t)}
              >
                Delete
              </button>
            </header>
            {t.description && <p className="muted">{t.description}</p>}
            <p className="muted">
              {t.triggers.length} starter trigger
              {t.triggers.length === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>
      {removing && (
        <ConfirmDialog
          text={`Delete template ${removing.name}? Bots created from it are untouched.`}
          confirmLabel="Delete template"
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            void api(`/api/templates/${removing.id}`, { method: "DELETE" })
              .then(reload)
              .catch((e) => alert(e.message))
              .finally(() => setRemoving(null))
          }
        />
      )}
      {editing && (
        <TemplateEditorModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}
