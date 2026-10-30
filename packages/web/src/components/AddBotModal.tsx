import { type FormEvent, useEffect, useRef, useState } from "react";
import { CloseIcon, RefreshIcon } from "../components/icons/index.ts";
import { UnsavedNote, useDiscardGuard } from "../components/ui/discard.tsx";
import { ModalForm } from "../components/ui/Modal.tsx";
import { useEscape } from "../components/ui/useEscape.ts";
import { api } from "../lib/api.ts";
import { BOT_NAMES, pickBotName } from "../lib/botNames.ts";
import type { Bot, Machine, Role, Template } from "../types.ts";
export function AddBotModal({
  usedNames,
  onClose,
  onCreated,
}: {
  usedNames: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const initialName = useRef(pickBotName(usedNames)).current;
  const [name, setName] = useState(initialName);
  const [suggestion, setSuggestion] = useState(initialName);

  const reshuffle = () => {
    if (name !== suggestion) return;
    let next = pickBotName([...usedNames, name]);
    while (next === name && BOT_NAMES.length > 1) {
      next = pickBotName([...usedNames, name]);
    }
    setSuggestion(next);
    setName(next);
  };
  const [instructions, setInstructions] = useState("");
  const [roleId, setRoleId] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [machineId, setMachineId] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSel, setTemplateSel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Role[]>("/api/roles").then(setRoles, () => setRoles([]));
    void api<Machine[]>("/api/machines").then(
      (ms) => setMachines(ms.filter((m) => !m.builtin)),
      () => setMachines([]),
    );
    void api<Template[]>("/api/templates")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setInstructions(t.instructions);
    setRoleId(t.role_id ?? "");
    setMachineId(t.machine_id ?? "");
  };
  const dirty =
    name !== initialName ||
    instructions !== "" ||
    roleId !== "" ||
    machineId !== "";
  const attemptClose = useDiscardGuard("this new bot", dirty, onClose);
  useEscape(attemptClose);

  async function submitNewBot(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const bot = await api<Bot>("/api/bots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          instructions,
          role_id: roleId || null,
          machine_id: machineId || null,
        }),
      });
      const tpl = templates.find((t) => t.id === templateSel);
      for (const t of tpl?.triggers ?? []) {
        await api(`/api/bots/${bot.id}/triggers`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "schedule",
            message: t.message,
            schedule: t.schedule,
          }),
        }).catch(() => null);
      }
      onCreated();
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
      aria-label="Add bot"
      onSubmit={submitNewBot}
    >
      <div className="viewhead">
        <h2>Add bot</h2>
        <button
          type="button"
          className="close"
          aria-label="Cancel"
          onClick={attemptClose}
        >
          <CloseIcon size={18} />
        </button>
      </div>
      {templates.length > 0 && (
        <p className="rolepick">
          Template{" "}
          <select
            value={templateSel}
            onChange={(e) => {
              setTemplateSel(e.target.value);
              applyTemplate(e.target.value);
            }}
          >
            <option value="">None</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </p>
      )}
      <div className="namerow">
        <input
          placeholder="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        {BOT_NAMES.length > 1 && (
          <button
            type="button"
            className="shuffle"
            aria-label="Suggest another name"
            title="Suggest another name"
            onClick={reshuffle}
          >
            <RefreshIcon size={17} />
          </button>
        )}
      </div>
      <textarea
        placeholder="instructions (optional)"
        rows={3}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
      />
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
      <div className="actions">
        <button type="submit" disabled={busy}>
          Create
        </button>
        <UnsavedNote dirty={dirty} />
        <button type="button" onClick={attemptClose}>
          Cancel
        </button>
      </div>
    </ModalForm>
  );
}
