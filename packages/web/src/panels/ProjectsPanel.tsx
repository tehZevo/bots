import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import {
  UnsavedNote,
  useDiscardGuard,
  useNavGuard,
} from "../components/ui/discard.tsx";
import { ModalForm } from "../components/ui/Modal.tsx";
import { api } from "../lib/api.ts";
import type { Project } from "../types.ts";
export function ProjectsPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const navGuard = useNavGuard();
  const [creating, setCreating] = useState(false);
  const [selProject, setSelProject] = useState<Project | null>(null);

  const load = useCallback(async () => {
    setProjects(await api<Project[]>("/api/projects").catch(() => []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openId) return;
    const project = projects.find((candidate) => candidate.id === openId);
    if (!project) return;
    setSelProject(project);
    setCreating(false);
    onOpened?.();
  }, [onOpened, openId, projects]);

  return (
    <section>
      <div className="viewhead">
        <button type="button" onClick={() => setCreating(true)}>
          Add project
        </button>
      </div>
      {projects.length === 0 && (
        <p className="muted">
          No projects yet — shared context attached to bots.
        </p>
      )}
      <div className="cards">
        {projects.map((project) => (
          <button
            type="button"
            key={project.id}
            className="card"
            onClick={() => navGuard(() => setSelProject(project))}
          >
            <strong>{project.name}</strong>
            <span className="preview">{project.description}</span>
          </button>
        ))}
      </div>
      {(creating || selProject) && (
        <ProjectModal
          project={selProject}
          onClose={() => {
            setCreating(false);
            setSelProject(null);
          }}
          onSaved={() => {
            setCreating(false);
            setSelProject(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

export function ProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: Project | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [body, setBody] = useState(project?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty =
    name !== (project?.name ?? "") ||
    description !== (project?.description ?? "") ||
    body !== (project?.body ?? "");
  const attemptClose = useDiscardGuard(
    project ? `project ${project.name}` : "this new project",
    dirty,
    onClose,
  );

  const save = async () => {
    setBusy(true);
    try {
      await api(project ? `/api/projects/${project.id}` : "/api/projects", {
        method: project ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, body }),
      });
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  function submitProject(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  return (
    <>
      <ModalForm
        scrimOnCancel={attemptClose}
        className="dialog narrow"
        role="dialog"
        aria-label={project ? "Edit project" : "Create project"}
        onSubmit={submitProject}
      >
        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="field">
          Description (optional, one line)
          <input
            value={description}
            maxLength={120}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          Markdown body
          <textarea
            className="projectbody"
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </label>
        {body.length > 8000 && (
          <p className="muted">
            Large body ({body.length.toLocaleString()} chars) — bots attaching
            this project get a heavy prompt. Saving is still allowed.
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={busy || !name.trim() || !body.trim()}>
            Save
          </button>
          <UnsavedNote dirty={dirty} />
          {project && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => setConfirmDel(true)}
            >
              Delete
            </button>
          )}
        </div>
      </ModalForm>
      {confirmDel && project && (
        <ConfirmDialog
          text={`Delete project ${project.name}? Attached bots lose it from their prompts.`}
          confirmLabel="Delete project"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            api(`/api/projects/${project.id}`, { method: "DELETE" })
              .then(onSaved)
              .catch((e) => alert(e.message));
          }}
        />
      )}
    </>
  );
}
