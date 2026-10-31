import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.tsx";
import { UnsavedNote, useDirtyGuard } from "../../components/ui/discard.tsx";
import { api } from "../../lib/api.ts";
import { playSound, SOUND_LIBRARY } from "../../lib/sound.ts";
import { TemplateEditorModal } from "../../panels/TemplatesPanel.tsx";
import type {
  Bot,
  BotGeneralSettings,
  Machine,
  Provider,
  Role,
  Template,
  Trigger,
} from "../../types.ts";
import { BotProjects } from "./BotProjects.tsx";
import { BotSecrets } from "./BotSecrets.tsx";
import { BotTags } from "./BotTags.tsx";
import { BotTeams } from "./BotTeams.tsx";
export function parseWatchdogHours(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 720
    ? parsed
    : "invalid";
}

export function BotGeneral({
  bot,
  onChanged,
  onCancel = () => undefined,
}: {
  bot: Bot | undefined;
  onChanged: () => void;
  onCancel?: () => void;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState(bot?.name ?? "");
  const [instructions, setInstructions] = useState(bot?.instructions ?? "");
  const [roleId, setRoleId] = useState(bot?.role_id ?? "");
  const [machineId, setMachineId] = useState(bot?.machine_id ?? "");
  const [watchdogHours, setWatchdogHours] = useState(
    bot?.watchdog_hours == null ? "" : String(bot.watchdog_hours),
  );
  const [modelId, setModelId] = useState(bot?.model_id ?? "");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(
    null,
  );
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<
    "delete" | "clear" | "restart" | "archive" | null
  >(null);
  const [tplDraft, setTplDraft] = useState<
    (Omit<Template, "id" | "created_at"> & { id?: string }) | null
  >(null);

  const openTemplateDraft = async () => {
    if (!bot) return;
    const trs = await api<Trigger[]>(`/api/bots/${bot.id}/triggers`).catch(
      () => [] as Trigger[],
    );
    setTplDraft({
      name: `${bot.name} template`,
      description: "",
      instructions: bot.instructions ?? "",
      machine_id: bot.machine_id,
      role_id: bot.role_id,
      triggers: trs
        .filter((t) => t.kind === "schedule")
        .map((t) => ({ message: t.message, schedule: t.schedule })),
    });
  };

  useEffect(() => {
    void api<Role[]>("/api/roles").then(setRoles, () => setRoles([]));
    void api<Machine[]>("/api/machines")
      .then((ms) => setMachines(ms.filter((m) => !m.builtin)))
      .catch(() => setMachines([]));
    void api<Provider[]>("/api/providers").then(setProviders, () =>
      setProviders([]),
    );
    void api<BotGeneralSettings>("/api/settings")
      .then((settings) => {
        setDefaultProviderId(settings.default_provider_id);
        setDefaultModel(settings.default_model);
      })
      .catch(() => undefined);
  }, []);

  const parsedWatchdog = parseWatchdogHours(watchdogHours);

  const modelOptions = Array.from(
    new Set([
      ...(bot?.model_id ? [bot.model_id] : []),
      ...(defaultProviderId
        ? (providers.find((p) => p.id === defaultProviderId)?.models ?? [])
        : []),
      ...(defaultModel ? [defaultModel] : []),
    ]),
  );

  const dirty =
    !!bot &&
    (name.trim() !== bot.name ||
      instructions !== bot.instructions ||
      roleId !== (bot.role_id ?? "") ||
      machineId !== (bot.machine_id ?? "") ||
      modelId !== (bot.model_id ?? "") ||
      parsedWatchdog === "invalid" ||
      parsedWatchdog !== (bot.watchdog_hours ?? null));
  useDirtyGuard(bot ? `the bot ${bot.name}` : "this bot", dirty);

  if (!bot) return null;
  const patchBot = (body: Record<string, unknown>) =>
    api(`/api/bots/${bot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const archiveBot = () => {
    void api(`/api/bots/${bot.id}/archive`, { method: "POST" })
      .then(onChanged)
      .catch((err) => alert(err.message));
  };

  return (
    <div className="botgeneral">
      <label className="field">
        <span>Name</span>
        <input
          aria-label="Bot name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field watchdog-field">
        <span>Watchdog hours</span>
        <div className="unit-control">
          <input
            type="number"
            aria-label="Watchdog hours"
            placeholder="off"
            min={1}
            max={720}
            step={1}
            value={watchdogHours}
            onChange={(e) => setWatchdogHours(e.target.value)}
          />
          <span>hours</span>
        </div>
      </label>
      {parsedWatchdog === "invalid" && (
        <p className="muted field-error">
          Watchdog must be a whole number from 1 to 720 hours, or empty for off.
        </p>
      )}
      <BotProjects botId={bot.id} />
      <BotTags botId={bot.id} />
      <BotSecrets botId={bot.id} />
      <BotTeams botId={bot.id} />
      <div className="picker-row">
        <label className="field">
          <span>Role</span>
          <select
            value={roleId}
            aria-label="Bot role"
            onChange={(e) => setRoleId(e.target.value)}
          >
            <option value="">None</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Model</span>
          <select
            value={modelId}
            aria-label="Bot model"
            onChange={(e) => setModelId(e.target.value)}
          >
            <option value="">Server default</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Machine</span>
          <select
            value={machineId}
            aria-label="Bot machine"
            onChange={(e) => setMachineId(e.target.value)}
          >
            <option value="">Default</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Sound</span>
          <div className="sound-control">
            <select
              value={bot.sound ?? ""}
              aria-label="Bot notification sound"
              onChange={(e) => {
                const v = e.target.value;
                patchBot({ sound: v === "" ? null : v })
                  .then(onChanged)
                  .catch((err) => alert(err.message));
              }}
            >
              <option value="">Global default</option>
              <option value="none">None</option>
              {SOUND_LIBRARY.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                playSound(
                  bot.sound && bot.sound !== "none" ? bot.sound : "default",
                )
              }
            >
              Preview
            </button>
          </div>
        </label>
      </div>
      <label className="field instructions-field">
        <span>Instructions</span>
        <textarea
          aria-label="Instructions"
          placeholder="instructions (optional)"
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <div className="botdetailactions">
        <UnsavedNote dirty={dirty} />
        <button
          type="button"
          className="primary"
          disabled={busy || !dirty || !name.trim()}
          onClick={() => {
            setBusy(true);
            patchBot({
              name: name.trim(),
              instructions,
              model_id: modelId || null,
              role_id: roleId || null,
              machine_id: machineId || null,
              watchdog_hours:
                parsedWatchdog === "invalid" ? watchdogHours : parsedWatchdog,
            })
              .then(onChanged)
              .catch((e) => alert(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Save
        </button>
        <button type="button" onClick={() => setPending("restart")}>
          Restart machine
        </button>
        <button type="button" onClick={() => setPending("clear")}>
          Clear memory
        </button>
        <button type="button" onClick={() => void openTemplateDraft()}>
          Save as template…
        </button>
        {bot.archived ? (
          <button
            type="button"
            onClick={() => {
              void api(`/api/bots/${bot.id}/unarchive`, { method: "POST" })
                .then(onChanged)
                .catch((err) => alert(err.message));
            }}
          >
            Unarchive
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (bot.run_state === "running") setPending("archive");
              else archiveBot();
            }}
          >
            Archive
          </button>
        )}
        <button
          type="button"
          className="danger"
          onClick={() => setPending("delete")}
        >
          Delete
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {pending === "delete" && (
        <ConfirmDialog
          text={`Delete bot ${bot.name}? This removes the bot, its triggers and run history.`}
          confirmLabel="Delete bot"
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            setPending(null);
            await api(`/api/bots/${bot.id}`, { method: "DELETE" });
            onChanged();
          }}
        />
      )}
      {tplDraft && (
        <TemplateEditorModal
          initial={tplDraft}
          onClose={() => setTplDraft(null)}
          onSaved={() => setTplDraft(null)}
        />
      )}
      {pending === "clear" && (
        <ConfirmDialog
          text={`Clear the stored context of ${bot.name}? The bot forgets its conversation history.`}
          confirmLabel="Clear memory"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            api(`/api/bots/${bot.id}/messages`, { method: "DELETE" }).catch(
              (e) => alert(e.message),
            );
          }}
        />
      )}
      {pending === "restart" && (
        <ConfirmDialog
          text={`Restart the machine of ${bot.name}? A running task is interrupted and the container is recreated on next shell use; anything installed outside /workspace is lost.`}
          confirmLabel="Restart machine"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            api(`/api/bots/${bot.id}/restart-machine`, { method: "POST" })
              .then(onChanged)
              .catch((e) => alert(e.message));
          }}
        />
      )}
      {pending === "archive" && (
        <ConfirmDialog
          text={`Archive bot ${bot.name}? Its running task is stopped first; it stays disabled until you unarchive and enable it.`}
          confirmLabel="Archive bot"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            archiveBot();
          }}
        />
      )}
    </div>
  );
}
