import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { useNavGuard } from "../components/ui/discard.tsx";
import { ModalForm } from "../components/ui/Modal.tsx";
import { api } from "../lib/api.ts";
import type { SecretMeta } from "../types.ts";
export function SecretsPanel() {
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const navGuard = useNavGuard();
  const [creating, setCreating] = useState(false);
  const [selSecret, setSelSecret] = useState<SecretMeta | null>(null);

  const load = useCallback(async () => {
    setSecrets(await api<SecretMeta[]>("/api/secrets").catch(() => []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="viewhead">
        <h2>Secrets</h2>
        <button type="button" onClick={() => setCreating(true)}>
          Add secret
        </button>
      </div>
      {secrets.length === 0 && (
        <p className="muted">
          No secrets yet — env vars injected into sandboxes at start.
        </p>
      )}
      <div className="cards">
        {secrets.map((s) => (
          <button
            type="button"
            key={s.id}
            className="card"
            onClick={() => navGuard(() => setSelSecret(s))}
          >
            <strong>{s.name}</strong>
            <span className="preview">
              <code>{s.key}</code>
            </span>
          </button>
        ))}
      </div>
      {(creating || selSecret) && (
        <SecretModal
          secret={selSecret}
          onClose={() => {
            setCreating(false);
            setSelSecret(null);
          }}
          onSaved={() => {
            setCreating(false);
            setSelSecret(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

export function SecretModal({
  secret,
  onClose,
  onSaved,
}: {
  secret: SecretMeta | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(secret?.name ?? "");
  const [key, setKey] = useState(secret?.key ?? "");
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const _dirty =
    name.trim() !== (secret?.name ?? "") ||
    key !== (secret?.key ?? "") ||
    value !== "";

  const reveal = async () => {
    if (!secret) return;
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    try {
      const r = await api<{ value: string }>(`/api/secrets/${secret.id}/value`);
      setRevealed(r.value);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      if (secret) {
        await api(`/api/secrets/${secret.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            key,
            ...(value ? { value } : {}),
          }),
        });
      } else {
        await api("/api/secrets", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), key, value }),
        });
      }
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  function submitSecret(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  return (
    <>
      <ModalForm
        scrimOnCancel={onClose}
        className="dialog narrow"
        role="dialog"
        aria-label={secret ? "Edit secret" : "Create secret"}
        onSubmit={submitSecret}
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
          Env var key
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            pattern="[A-Za-z_][A-Za-z0-9_]*"
            required
          />
        </label>
        {secret ? (
          <div className="field">
            Value
            <div className="row">
              <input
                value={revealed !== null ? revealed : ""}
                onChange={(e) => {
                  setRevealed(e.target.value);
                  setValue(e.target.value);
                }}
                type={revealed === null ? "password" : "text"}
                placeholder="•••••••• (unchanged unless typed)"
              />
              <button
                type="button"
                onClick={() => void reveal()}
                title={revealed === null ? "Reveal saved value" : "Hide value"}
              >
                {revealed === null ? "Show" : "Hide"}
              </button>
            </div>
          </div>
        ) : (
          <label className="field">
            Value
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </label>
        )}
        <div className="actions">
          <button
            type="submit"
            disabled={busy || !name.trim() || !KEY_RE.test(key)}
          >
            Save
          </button>
          {secret && (
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
      {confirmDel && secret && (
        <ConfirmDialog
          text={`Delete ${secret.name}? Sandboxes using it must be restarted to drop the variable.`}
          confirmLabel="Delete secret"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            api(`/api/secrets/${secret.id}`, { method: "DELETE" })
              .then(onSaved)
              .catch((e) => alert(e instanceof Error ? e.message : String(e)));
          }}
        />
      )}
    </>
  );
}
