import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import {
  UnsavedNote,
  useDiscardGuard,
  useNavGuard,
} from "../components/ui/discard.tsx";
import { ModalForm } from "../components/ui/Modal.tsx";
import { api } from "../lib/api.ts";
import type { Tag } from "../types.ts";
export function TagsPanel({
  openId,
  onOpened,
}: {
  openId?: string | null;
  onOpened?: () => void;
} = {}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const navGuard = useNavGuard();
  const [creating, setCreating] = useState(false);
  const [selTag, setSelTag] = useState<Tag | null>(null);

  const load = useCallback(async () => {
    setTags(await api<Tag[]>("/api/tags").catch(() => []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openId) return;
    const tag = tags.find((candidate) => candidate.id === openId);
    if (!tag) return;
    setSelTag(tag);
    setCreating(false);
    onOpened?.();
  }, [onOpened, openId, tags]);

  return (
    <section>
      <div className="viewhead">
        <button type="button" onClick={() => setCreating(true)}>
          Add tag
        </button>
      </div>
      {tags.length === 0 && (
        <p className="muted">No tags yet — labels for organizing bots.</p>
      )}
      <div className="cards">
        {tags.map((tag) => (
          <button
            type="button"
            key={tag.id}
            className="card"
            onClick={() => navGuard(() => setSelTag(tag))}
          >
            <strong>{tag.name}</strong>
            <span className="preview">
              {tag.bot_count === 1 ? "1 bot" : `${tag.bot_count} bots`}
            </span>
          </button>
        ))}
      </div>
      {(creating || selTag) && (
        <TagModal
          tag={selTag}
          onClose={() => {
            setCreating(false);
            setSelTag(null);
          }}
          onSaved={() => {
            setCreating(false);
            setSelTag(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

export function TagModal({
  tag,
  onClose,
  onSaved,
}: {
  tag: Tag | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = name.trim() !== (tag?.name ?? "") && name.trim() !== "";
  const attemptClose = useDiscardGuard(
    tag ? `tag ${tag.name}` : "this new tag",
    dirty,
    onClose,
  );

  const save = async () => {
    setBusy(true);
    try {
      await api(tag ? `/api/tags/${tag.id}` : "/api/tags", {
        method: tag ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  function submitTag(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  return (
    <>
      <ModalForm
        scrimOnCancel={attemptClose}
        className="dialog narrow"
        role="dialog"
        aria-label={tag ? "Edit tag" : "Create tag"}
        onSubmit={submitTag}
      >
        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <div className="actions">
          <button type="submit" disabled={busy || !name.trim()}>
            Save
          </button>
          <UnsavedNote dirty={dirty} />
          {tag && (
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
      {confirmDel && tag && (
        <ConfirmDialog
          text={`Delete tag ${tag.name}? Bots keep running — the label is removed from them.`}
          confirmLabel="Delete tag"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            api(`/api/tags/${tag.id}`, { method: "DELETE" })
              .then(onSaved)
              .catch((e) => alert(e.message));
          }}
        />
      )}
    </>
  );
}
