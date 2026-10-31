import { useState } from "react";
import { api } from "../lib/api.ts";
import { fmt, relTime, titleCase } from "../lib/format.ts";
import { HEALTH_LABEL } from "../lib/health.ts";
import type { Bot, Run } from "../types.ts";
import { Avatar, StatusDot } from "./Avatar.tsx";
import { AvatarPicker } from "./AvatarPicker.tsx";
import { BotFiles } from "./botTabs/BotFiles.tsx";
import { BotGeneral } from "./botTabs/BotGeneral.tsx";
import { BotStats } from "./botTabs/BotStats.tsx";
import { CloseIcon } from "./icons/index.ts";
import { ReplayPanel } from "./ReplayPanel.tsx";
import { Triggers } from "./Triggers.tsx";
import { Modal } from "./ui/Modal.tsx";
import { SwitchToggle } from "./ui/SwitchToggle.tsx";
import { TabNav } from "./ui/TabNav.tsx";

export function BotDetailModal({
  bot,
  openBotId,
  tabs,
  modalTab,
  onSelectTab,
  runs,
  replayRun,
  onToggleReplay,
  onChanged,
  onClose,
  onStop,
  onRerun,
}: {
  bot: Bot;
  openBotId: string;
  tabs: readonly string[];
  modalTab: string;
  onSelectTab: (tab: string) => void;
  runs: Run[];
  replayRun: string | null;
  onToggleReplay: (runId: string | null) => void;
  onChanged: () => Promise<unknown> | void;
  onClose: () => void;
  onStop: (botId: string) => Promise<unknown>;
  onRerun: (message: string) => Promise<void>;
}) {
  const [headerBusy, setHeaderBusy] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);
  return (
    <Modal
      scrimOnCancel={onClose}
      scrimLabel="Close details"
      className="dialog tabs"
      role="dialog"
      aria-label={`${bot.name} details`}
    >
      <div className="viewhead">
        <button
          type="button"
          className="avatarpick"
          aria-label="Change avatar"
          onClick={() => setAvatarMenu((v) => !v)}
        >
          <Avatar
            name={bot.name}
            id={bot.id}
            shape={bot.avatar_shape}
            color={bot.avatar_color}
            health={bot.health}
          />
        </button>
        {avatarMenu && (
          <AvatarPicker
            bot={bot}
            onClose={() => setAvatarMenu(false)}
            onPick={(body) =>
              api(`/api/bots/${bot.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }).then(() => onChanged())
            }
          />
        )}
        <h2>{bot.name}</h2>
        {bot.archived ? (
          <span className="archivebadge detailarchive">Archived</span>
        ) : null}
        <p className="statusline detailhealth">
          <StatusDot
            id={bot.id}
            health={bot.health}
            active={bot.run_state === "running"}
          />{" "}
          {HEALTH_LABEL[bot.health]}
        </p>
        {bot.current_task && !bot.status && (
          <p className="taskline">
            {bot.current_task}
            {bot.current_task_updated_at && (
              <em> · {relTime(bot.current_task_updated_at)}</em>
            )}
          </p>
        )}
        {bot.current_task && bot.status && (
          <p className="taskline">{bot.current_task}</p>
        )}
        {bot.status && (
          <p className="statline">
            {bot.status}
            {bot.current_task_updated_at && (
              <em> · {relTime(bot.current_task_updated_at)}</em>
            )}
          </p>
        )}
        <div className="detailhead-actions">
          <SwitchToggle
            ariaLabel="Bot enabled"
            checked={bot.enabled !== 0}
            disabled={headerBusy || Boolean(bot.archived)}
            onChange={() => {
              setHeaderBusy(true);
              void api(`/api/bots/${bot.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ enabled: bot.enabled === 0 }),
              })
                .then(() => onChanged())
                .catch((e) => alert(e.message))
                .finally(() => setHeaderBusy(false));
            }}
            stateLabel={bot.archived || !bot.enabled ? "Disabled" : "Enabled"}
          />
          {bot.run_state === "running" && (
            <button
              type="button"
              className="danger"
              aria-label="Stop while running"
              disabled={headerBusy}
              onClick={() => {
                setHeaderBusy(true);
                void onStop(bot.id)
                  .then(() => onChanged())
                  .catch((e) => alert(e.message))
                  .finally(() => setHeaderBusy(false));
              }}
            >
              Stop
            </button>
          )}
          <button
            type="button"
            className="close"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon size={18} />
          </button>
        </div>
      </div>
      <TabNav
        tabs={tabs.map((t) => ({ id: t, label: titleCase(t) }))}
        selected={modalTab}
        onSelect={onSelectTab}
      />
      <div className="tabbody">
        {modalTab === "general" && (
          <BotGeneral
            key={bot.id}
            bot={bot}
            onChanged={() => void onChanged()}
            onCancel={onClose}
          />
        )}
        {modalTab === "triggers" && <Triggers botId={bot.id} />}
        {modalTab === "logs" && (
          <>
            {runs.length === 0 && (
              <p>No runs yet. Press "Run now" or wait for a trigger.</p>
            )}
            {runs.map((run) => (
              <article key={run.id}>
                <button
                  type="button"
                  className="runhead"
                  aria-expanded={replayRun === run.id}
                  title="Show the transcript replay for this run"
                  onClick={() =>
                    onToggleReplay(replayRun === run.id ? null : run.id)
                  }
                >
                  <span className={`status ${run.status}`}>{run.status}</span>
                  <span>{run.trigger}</span>
                  <span>{fmt(run.started_at)}</span>
                  {run.finished_at && <span>→ {fmt(run.finished_at)}</span>}
                </button>
                {run.output && <pre>{run.output}</pre>}
                {run.error && <pre className="error">{run.error}</pre>}
                {replayRun === run.id && (
                  <ReplayPanel
                    botId={openBotId}
                    run={run}
                    running={bot.run_state === "running"}
                    onRerun={onRerun}
                  />
                )}
              </article>
            ))}
          </>
        )}
        {modalTab === "stats" && (
          <BotStats
            key={bot.id}
            botId={bot.id}
            running={bot.run_state === "running"}
          />
        )}
        {modalTab === "files" && <BotFiles key={bot.id} botId={bot.id} />}
      </div>
    </Modal>
  );
}
