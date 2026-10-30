import { useCallback, useEffect, useState } from "react";
import { CloseIcon } from "../components/icons/CloseIcon.tsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import {
  UnsavedNote,
  useDiscardGuard,
  useNavGuard,
} from "../components/ui/discard.tsx";
import { Modal } from "../components/ui/Modal.tsx";
import type { TabNavTab } from "../components/ui/TabNav.tsx";
import { TabNav } from "../components/ui/TabNav.tsx";
import { api } from "../lib/api.ts";
import { fmt } from "../lib/format.ts";
import type {
  SearchHit,
  Skill,
  SkillPreviewRow,
  SkillUpdateStatus,
} from "../types.ts";

const SKILL_MODAL_TABS: readonly TabNavTab[] = [
  { id: "create", label: "Create" },
  { id: "import", label: "Import" },
];

export function SkillsPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [removingSkill, setRemovingSkill] = useState<Skill | null>(null);
  const [detachingSkill, setDetachingSkill] = useState<Skill | null>(null);
  const [updatingSkill, setUpdatingSkill] = useState<Skill | null>(null);
  const [busySkill, setBusySkill] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadSkills = useCallback(
    () =>
      api<Skill[]>("/api/skills")
        .then(setSkills)
        .catch(() => setSkills([])),
    [],
  );

  useEffect(() => {
    void reloadSkills();
  }, [reloadSkills]);

  useEffect(() => {
    if (!openId) return;
    const skill = skills.find((candidate) => candidate.id === openId);
    if (!skill) return;
    setEditingSkill(skill);
    setAddOpen(false);
    onOpened?.();
  }, [onOpened, openId, skills]);

  const actionBusy = busySkill !== null || checkingAll;

  async function runSkillAction(
    skill: Skill,
    path: string,
    method = "POST",
  ): Promise<void> {
    setBusySkill(skill.id);
    setError(null);
    try {
      const result = await api<{ status?: string; error?: string | null }>(
        path,
        {
          method,
        },
      );
      if (result.status === "source_unavailable") {
        setError(
          result.error ?? `Could not reach the source for ${skill.name}.`,
        );
      }
      await reloadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySkill(null);
    }
  }

  async function checkAll(): Promise<void> {
    if (actionBusy) return;
    setCheckingAll(true);
    setError(null);
    try {
      const result = await api<{
        results?: Array<{ status: string; error?: string | null }>;
      }>("/api/skills/check", { method: "POST" });
      const failed = (result.results ?? []).filter(
        (item) => item.status === "source_unavailable",
      );
      if (failed.length > 0) {
        setError(
          `${failed.length} skill update check could not reach its source.`,
        );
      }
      await reloadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckingAll(false);
    }
  }

  return (
    <section>
      <div className="viewhead">
        <h2>Skills</h2>
        <button
          type="button"
          disabled={checkingAll}
          onClick={() => void checkAll()}
        >
          {checkingAll ? "Checking…" : "Check all"}
        </button>
        <button type="button" onClick={() => setAddOpen(true)}>
          + Add skill
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="mcpsection">
        {skills.length === 0 && (
          <p className="muted">No skills yet — add one above.</p>
        )}
        {skills.map((sk) => {
          const state = sk.update_state ?? null;
          const isImported = Boolean(sk.import_info);
          return (
            <div className="mcpsrv" key={sk.id}>
              <header>
                <strong>{sk.name}</strong>
                {isImported && (
                  <span className="srcbadge">
                    {`${safeImportOrigin(sk.import_info ?? "") ?? "git"} skill`}
                  </span>
                )}
                <button type="button" onClick={() => setEditingSkill(sk)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => setRemovingSkill(sk)}
                >
                  Delete
                </button>
              </header>
              {sk.description && <p className="muted">{sk.description}</p>}
              {isImported && (
                <>
                  <div className="skillstatus">
                    <span className="muted">
                      {state?.status
                        ? `${updateStatusLabel(state.status)} · ${fmt(state.checked_at)}`
                        : "Not checked yet"}
                    </span>
                    {state?.pinned && <span className="srcbadge">pinned</span>}
                    {state?.modified && (
                      <span className="srcbadge">local changes</span>
                    )}
                  </div>
                  <div className="skillactions">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() =>
                        void runSkillAction(sk, `/api/skills/${sk.id}/check`)
                      }
                    >
                      {busySkill === sk.id ? "Working…" : "Check"}
                    </button>
                    {state?.status === "update_available" && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => setUpdatingSkill(sk)}
                      >
                        Update
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => setDetachingSkill(sk)}
                    >
                      Detach
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {removingSkill && (
        <ConfirmDialog
          text={`Delete skill ${removingSkill.name}? Grants referencing it will drop on next run.`}
          confirmLabel="Delete skill"
          onCancel={() => setRemovingSkill(null)}
          onConfirm={() => {
            const target = removingSkill;
            setRemovingSkill(null);
            void runSkillAction(target, `/api/skills/${target.id}`, "DELETE");
          }}
        />
      )}
      {detachingSkill && (
        <ConfirmDialog
          text={`Stop tracking updates for ${detachingSkill.name}? Its current content stays available as a hand-written skill.`}
          confirmLabel="Detach skill"
          onCancel={() => setDetachingSkill(null)}
          onConfirm={() => {
            const target = detachingSkill;
            setDetachingSkill(null);
            void runSkillAction(target, `/api/skills/${target.id}/detach`);
          }}
        />
      )}
      {updatingSkill && (
        <ConfirmDialog
          text={
            updatingSkill.update_state?.modified
              ? `Replace local changes to ${updatingSkill.name} with the upstream bundle?`
              : `Update ${updatingSkill.name} from its source?`
          }
          confirmLabel="Update skill"
          onCancel={() => setUpdatingSkill(null)}
          onConfirm={() => {
            const target = updatingSkill;
            setUpdatingSkill(null);
            void runSkillAction(target, `/api/skills/${target.id}/update`);
          }}
        />
      )}
      {addOpen && (
        <AddSkillModal
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            void reloadSkills();
          }}
        />
      )}
      {editingSkill && (
        <SkillModal
          skill={editingSkill}
          onClose={() => setEditingSkill(null)}
          onSaved={() => {
            setEditingSkill(null);
            void reloadSkills();
          }}
        />
      )}
    </section>
  );
}

function updateStatusLabel(status: SkillUpdateStatus): string {
  if (status === "up_to_date") return "Up to date";
  if (status === "update_available") return "Update available";
  return "Source unavailable";
}

export function SkillModal({
  skill,
  onClose,
  onSaved,
}: {
  skill: Skill;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [instructions, setInstructions] = useState(skill.instructions);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty =
    name !== skill.name ||
    description !== skill.description ||
    instructions !== skill.instructions;
  const attemptClose = useDiscardGuard(`skill ${skill.name}`, dirty, onClose);

  return (
    <Modal
      scrimOnCancel={attemptClose}
      scrimLabel="Close"
      className="dialog"
      role="dialog"
      aria-label="Skill"
    >
      <h2>Edit skill</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(`/api/skills/${skill.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name, description, instructions }),
            });
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
          Instructions (markdown)
          <textarea
            className="fixed"
            rows={12}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
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

function CreateSkillForm({
  onSaved,
  onDirtyChange,
}: {
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = name !== "" || description !== "" || instructions !== "";

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/skills", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, description, instructions }),
          });
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
        Instructions (markdown)
        <textarea
          className="fixed"
          rows={12}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </button>
        <UnsavedNote dirty={dirty} />
      </div>
    </form>
  );
}

export function AddSkillModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"create" | "import">("create");
  const [formKey, setFormKey] = useState(0);
  const [createDirty, setCreateDirty] = useState(false);
  const attemptClose = useDiscardGuard("this new skill", createDirty, onClose);
  const guard = useNavGuard();

  function switchTab(next: "create" | "import") {
    if (next === tab) return;
    guard(() => {
      setCreateDirty(false);
      if (tab === "create") setFormKey((key) => key + 1);
      setTab(next);
    });
  }

  return (
    <Modal
      scrimOnCancel={attemptClose}
      scrimLabel="Close"
      className="dialog tabs"
      role="dialog"
      aria-label="Add skill"
    >
      <div className="viewhead">
        <h2>Add skill</h2>
        <button
          type="button"
          className="close"
          aria-label="Cancel"
          onClick={attemptClose}
        >
          <CloseIcon size={18} />
        </button>
      </div>
      <TabNav
        tabs={SKILL_MODAL_TABS}
        selected={tab}
        onSelect={(id) => switchTab(id as "create" | "import")}
      />
      <div className="tabbody">
        {tab === "create" && (
          <CreateSkillForm
            key={formKey}
            onSaved={onSaved}
            onDirtyChange={setCreateDirty}
          />
        )}
        {tab === "import" && <ImportSkillsPane onImported={onSaved} />}
      </div>
    </Modal>
  );
}

function safeImportOrigin(raw: string): string | null {
  try {
    const info = JSON.parse(raw) as { origin?: string };
    return typeof info.origin === "string" ? info.origin : null;
  } catch {
    return null;
  }
}

function ImportSkillsPane({ onImported }: { onImported: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [source, setSource] = useState("");
  const [previews, setPreviews] = useState<SkillPreviewRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (!query.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ results: SearchHit[] }>(
        `/api/skills/search?q=${encodeURIComponent(query.trim())}`,
      );
      setHits(r.results);
    } catch (e) {
      setHits([]);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    if (!source.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ skills: SkillPreviewRow[] }>(
        "/api/skills/preview",
        { method: "POST", body: JSON.stringify({ source: source.trim() }) },
      );
      setPreviews(r.skills);
      setPicked(new Set());
    } catch (e) {
      setPreviews([]);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!picked.size || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/skills/import", {
        method: "POST",
        body: JSON.stringify({ source: source.trim(), folders: [...picked] }),
      });
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className="field">
        Search skills.sh
        <input
          value={query}
          placeholder="pdf, testing, ..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={busy || !query.trim()}
          onClick={() => void search()}
        >
          Search
        </button>
      </div>
      {hits && (
        <ul className="srclist">
          {hits.length === 0 && <li className="muted">No matches.</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <span>
                {h.name}{" "}
                <em className="muted">
                  ({h.source}
                  {h.installs !== null ? ` · ${h.installs} installs` : ""})
                </em>
              </span>
              <button
                type="button"
                onClick={() => setSource(`${h.source}@${h.skill_id}`)}
              >
                Use
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="field">
        Git source
        <input
          value={source}
          placeholder="owner/repo, https://…/tree/main/skills/pdf@pdf#v1.2"
          onChange={(e) => setSource(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={busy || !source.trim()}
          onClick={() => void preview()}
        >
          Preview
        </button>
      </div>
      {previews.length > 0 && (
        <ul className="srclist">
          {previews.map((p) => (
            <li key={p.folder}>
              <label>
                <input
                  type="checkbox"
                  checked={picked.has(p.folder)}
                  onChange={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.folder)) next.delete(p.folder);
                      else next.add(p.folder);
                      return next;
                    })
                  }
                />{" "}
                <strong>{p.name}</strong>{" "}
                <em className="muted">
                  {p.folder} · {p.file_count} files ·{" "}
                  {(p.total_size / 1024).toFixed(0)} KB
                </em>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button
          type="button"
          disabled={busy || picked.size === 0}
          onClick={() => void doImport()}
        >
          Import{" "}
          {picked.size > 0
            ? `${picked.size} skill${picked.size > 1 ? "s" : ""}`
            : ""}
        </button>
      </div>
    </>
  );
}
