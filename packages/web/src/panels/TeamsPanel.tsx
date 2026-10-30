import { type FormEvent, useCallback, useEffect, useState } from "react";
import { StatusDot } from "../components/Avatar.tsx";
import { Multiselect } from "../components/Multiselect.tsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { UnsavedNote, useDiscardGuard } from "../components/ui/discard.tsx";
import { ModalForm } from "../components/ui/Modal.tsx";
import { useEscape } from "../components/ui/useEscape.ts";
import { api } from "../lib/api.ts";
import { teamHealth } from "../lib/health.ts";
import type { Bot, Project, Team } from "../types.ts";

export function TeamCreateModal({
  bots,
  busy,
  onClose,
  mutate,
}: {
  bots: Bot[];
  busy: boolean;
  onClose: () => void;
  mutate: (fn: () => Promise<unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [memberSel, setMemberSel] = useState<string[]>([]);
  const [leaderSel, setLeaderSel] = useState<string[]>([]);
  const dirty = name !== "" || memberSel.length > 0 || leaderSel.length > 0;
  const attemptClose = useDiscardGuard("this new team", dirty, onClose);
  useEscape(attemptClose);

  function submitTeam(e: FormEvent) {
    e.preventDefault();
    mutate(async () => {
      const created = await api<Team>("/api/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      for (const id of new Set([...memberSel, ...leaderSel]))
        await api(`/api/teams/${created.id}/members`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            bot_id: id,
            leader: leaderSel.includes(id),
          }),
        });
      onClose();
    });
  }

  return (
    <ModalForm
      scrimOnCancel={attemptClose}
      className="dialog narrow"
      role="dialog"
      aria-label="Create team"
      onSubmit={submitTeam}
    >
      <label className="field">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <div className="field">
        Members
        <Multiselect
          label={`Members of new team`}
          options={bots.map((b) => ({ id: b.id, name: b.name }))}
          selected={memberSel}
          onChange={setMemberSel}
          busy={busy}
          placeholder="Add teammates…"
        />
      </div>
      <div className="field">
        Leaders (also added as members)
        <Multiselect
          label={`Leaders of new team`}
          options={bots.map((b) => ({ id: b.id, name: b.name }))}
          selected={leaderSel}
          onChange={setLeaderSel}
          busy={busy}
          placeholder="Pick leaders…"
        />
      </div>
      <div className="actions">
        <button type="submit" disabled={busy || !name.trim()}>
          Create team
        </button>
        <UnsavedNote dirty={dirty} />
        <button type="button" onClick={attemptClose}>
          Cancel
        </button>
      </div>
    </ModalForm>
  );
}

export function TeamsPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nameQ, setNameQ] = useState("");
  const [botSel, setBotSel] = useState<string[]>([]);
  const [selTeamId, setSelTeamId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ts, bs, ps] = await Promise.all([
      api<Team[]>("/api/teams").catch(() => [] as Team[]),
      api<Bot[]>("/api/bots").catch(() => [] as Bot[]),
      api<Project[]>("/api/projects").catch(() => [] as Project[]),
    ]);
    setTeams(ts);
    setBots(bs);
    setProjects(ps.map((p) => ({ id: p.id, name: p.name })));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = (fn: () => Promise<unknown>) => {
    setBusy(true);
    fn()
      .then(load)
      .catch((e) => alert(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  const nq = nameQ.trim().toLowerCase();
  const visible = teams.filter(
    (t) =>
      (!nq || t.name.toLowerCase().includes(nq)) &&
      (botSel.length === 0 || t.members.some((m) => botSel.includes(m.bot_id))),
  );
  const selTeam = teams.find((t) => t.id === selTeamId);

  useEffect(() => {
    if (!openId) return;
    const team = teams.find((candidate) => candidate.id === openId);
    if (!team) return;
    setSelTeamId(team.id);
    setCreating(false);
    onOpened?.();
  }, [onOpened, openId, teams]);

  return (
    <section>
      <div className="viewhead">
        <h2>Teams</h2>
        <button type="button" onClick={() => setCreating(true)}>
          Create team
        </button>
      </div>
      <div className="filterrow">
        <input
          aria-label="Filter teams by name"
          placeholder="Search teams by name"
          value={nameQ}
          onChange={(e) => setNameQ(e.target.value)}
        />
        <Multiselect
          label="Filter teams by bots"
          options={bots.map((b) => ({ id: b.id, name: b.name }))}
          selected={botSel}
          onChange={setBotSel}
          placeholder="Filter by bots…"
        />
      </div>
      {teams.length === 0 && (
        <p className="muted">
          No teams yet — teammates DM each other in a team.
        </p>
      )}
      <div className="cards">
        {visible.map((team) => {
          const health = teamHealth(team.members, bots);
          return (
            <button
              type="button"
              key={team.id}
              className="card teamcard"
              aria-label={`Configure ${team.name}`}
              onClick={() => setSelTeamId(team.id)}
            >
              <StatusDot
                id={team.id}
                health={health}
                active={health === "green"}
              />
              <strong>{team.name}</strong>
              <em className="muted">
                {team.members.length}{" "}
                {team.members.length === 1 ? "bot" : "bots"}
              </em>
            </button>
          );
        })}
      </div>
      {creating && (
        <TeamCreateModal
          bots={bots}
          busy={busy}
          onClose={() => setCreating(false)}
          mutate={mutate}
        />
      )}
      {selTeam && (
        <TeamConfigModal
          team={selTeam}
          bots={bots}
          projects={projects}
          busy={busy}
          onClose={() => setSelTeamId(null)}
          mutate={mutate}
        />
      )}
    </section>
  );
}

export function TeamConfigModal({
  team,
  bots,
  projects,
  busy,
  onClose,
  mutate,
}: {
  team: Team;
  bots: Bot[];
  projects: { id: string; name: string }[];
  busy: boolean;
  onClose: () => void;
  mutate: (fn: () => Promise<unknown>) => void;
}) {
  const [name, setName] = useState(team.name);
  const [memberSel, setMemberSel] = useState<string[]>(
    team.members.map((m) => m.bot_id),
  );
  const [leaderSel, setLeaderSel] = useState<string[]>(
    team.members.filter((m) => m.leader).map((m) => m.bot_id),
  );
  const [attached, setAttached] = useState<string[]>(team.project_ids ?? []);
  const [confirmDel, setConfirmDel] = useState(false);

  const memberIds = Array.from(new Set([...memberSel, ...leaderSel]));
  const curLeaderIds = team.members
    .filter((m) => m.leader)
    .map((m) => m.bot_id);
  const dirty =
    name.trim() !== team.name ||
    attached.join(",") !== (team.project_ids ?? []).join(",") ||
    [...memberIds].sort().join(",") !==
      team.members
        .map((m) => m.bot_id)
        .sort()
        .join(",") ||
    leaderSel
      .filter((id) => memberIds.includes(id))
      .sort()
      .join(",") !== [...curLeaderIds].sort().join(",");

  const save = () => {
    const cur = new Map(team.members.map((m) => [m.bot_id, m.leader]));
    mutate(async () => {
      await api(`/api/teams/${team.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), project_ids: attached }),
      });
      for (const id of memberIds) {
        const leader = leaderSel.includes(id);
        if (!cur.has(id) || cur.get(id) !== leader)
          await api(`/api/teams/${team.id}/members`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ bot_id: id, leader }),
          });
      }
      for (const m of team.members)
        if (!memberIds.includes(m.bot_id))
          await api(`/api/teams/${team.id}/members/${m.bot_id}`, {
            method: "DELETE",
          });
      onClose();
    });
  };
  const attemptClose = useDiscardGuard(`team ${team.name}`, dirty, onClose);

  function submitTeamEdit(e: FormEvent) {
    e.preventDefault();
    save();
  }

  return (
    <>
      <ModalForm
        scrimOnCancel={attemptClose}
        className="dialog narrow"
        role="dialog"
        aria-label={`Configure team ${team.name}`}
        onSubmit={submitTeamEdit}
      >
        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <div className="field">
          Members
          <Multiselect
            label={`Members of ${team.name}`}
            options={bots.map((b) => ({ id: b.id, name: b.name }))}
            selected={memberSel}
            onChange={setMemberSel}
            busy={busy}
            placeholder="Add teammates…"
          />
        </div>
        <div className="field">
          Leaders (also added as members)
          <Multiselect
            label={`Leaders of ${team.name}`}
            options={bots.map((b) => ({ id: b.id, name: b.name }))}
            selected={leaderSel}
            onChange={setLeaderSel}
            busy={busy}
            placeholder="Pick leaders…"
          />
        </div>
        <div className="field">
          Projects (inherited by all members)
          <Multiselect
            label={`Projects for ${team.name}`}
            options={projects}
            selected={attached}
            onChange={setAttached}
            busy={busy}
            placeholder="Attach projects…"
          />
        </div>
        <div className="actions">
          <button type="submit" disabled={busy || !name.trim() || !dirty}>
            Save
          </button>
          <UnsavedNote dirty={dirty} />
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => setConfirmDel(true)}
          >
            Delete
          </button>
          <button type="button" onClick={attemptClose}>
            Cancel
          </button>
        </div>
      </ModalForm>
      {confirmDel && (
        <ConfirmDialog
          text={`Delete team ${team.name}? The bots stay.`}
          confirmLabel="Delete team"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            mutate(() =>
              api(`/api/teams/${team.id}`, { method: "DELETE" }).then(onClose),
            );
          }}
        />
      )}
    </>
  );
}
