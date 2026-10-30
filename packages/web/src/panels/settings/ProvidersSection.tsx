import { useCallback, useEffect, useState } from "react";
import { CloseIcon } from "../../components/icons/CloseIcon.tsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.tsx";
import { useDiscardGuard } from "../../components/ui/discard.tsx";
import { Modal } from "../../components/ui/Modal.tsx";
import { api } from "../../lib/api.ts";
import type { Provider } from "../../types.ts";

function ProvidersSectionInner() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(
    null,
  );
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formProvider, setFormProvider] = useState<Provider | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Provider | null>(null);

  const loadProviders = useCallback(async () => {
    const [list, settings] = await Promise.all([
      api<Provider[]>("/api/providers").catch(() => [] as Provider[]),
      api<{ default_provider_id: string | null; default_model: string | null }>(
        "/api/settings",
      ).catch(() => null),
    ]);
    setProviders(list);
    if (settings) {
      setDefaultProviderId(settings.default_provider_id);
      setDefaultModel(settings.default_model);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const saveDefaults = async (providerId: string, model: string) => {
    setDefaultProviderId(providerId);
    setDefaultModel(model);
    try {
      await api("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          default_provider_id: providerId,
          default_model: model,
        }),
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const removeProvider = async (p: Provider) => {
    try {
      await api(`/api/providers/${p.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      await loadProviders();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const defaultProvider = providers.find((p) => p.id === defaultProviderId);
  const modelOptions = defaultProvider
    ? [
        ...new Set([
          ...defaultProvider.models,
          ...(defaultModel ? [defaultModel] : []),
        ]),
      ]
    : [];

  return (
    <>
      <p className="muted">LLM providers</p>
      {providers.length === 0 && (
        <p className="muted">
          No providers configured — runs fail until you add one.
        </p>
      )}
      <ul className="plist">
        {providers.map((p) => (
          <li key={p.id}>
            <div className="pinfo">
              <strong>{p.name}</strong>
              {p.id === defaultProviderId && (
                <span className="defbadge">default</span>
              )}
              <span className="muted">{p.base_url}</span>
              <span className="muted">
                {p.models.length} model{p.models.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="actions">
              {p.builtin ? (
                <span className="muted">built-in</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFormProvider(p);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setConfirmDelete(p)}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            setFormProvider(null);
            setFormOpen(true);
          }}
        >
          Add provider
        </button>
      </div>
      {providers.length > 0 && (
        <>
          <p className="muted">Default model</p>
          <div className="actions">
            <select
              value={defaultProviderId ?? ""}
              onChange={(e) => {
                const p = providers.find((x) => x.id === e.target.value);
                void saveDefaults(e.target.value, p?.models[0] ?? "");
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={defaultModel ?? ""}
              onChange={(e) =>
                void saveDefaults(defaultProviderId ?? "", e.target.value)
              }
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {formOpen && (
        <ProviderFormModal
          provider={formProvider}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void loadProviders();
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          text={`Remove ${confirmDelete.name}? Runs will fail until a new default is selected.`}
          confirmLabel="Delete provider"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void removeProvider(confirmDelete)}
        />
      )}
    </>
  );
}
export function ProviderFormModal({
  provider,
  onClose,
  onSaved,
}: {
  provider: Provider | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(provider?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>(provider?.models ?? []);
  const [detected, setDetected] = useState<string[] | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const dirty =
    name !== (provider?.name ?? "") ||
    baseUrl !== (provider?.base_url ?? "") ||
    apiKey !== "" ||
    models.join(",") !== (provider?.models ?? []).join(",");
  const attemptClose = useDiscardGuard(
    provider ? `provider ${provider.name}` : "this new provider",
    dirty,
    onClose,
  );

  const toggleModel = (id: string) => {
    setModels((ms) =>
      ms.includes(id) ? ms.filter((m) => m !== id) : [...ms, id],
    );
  };

  const detect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ models: string[] }>("/api/providers/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: provider?.id,
          base_url: baseUrl,
          api_key: apiKey,
        }),
      });
      setDetected(res.models);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addManual = () => {
    const id = manual.trim();
    if (!id) return;
    setModels((ms) => (ms.includes(id) ? ms : [...ms, id]));
    setDetected((d) => (d && !d.includes(id) ? [id, ...d] : d));
    setManual("");
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, base_url: baseUrl, models };
      if (apiKey !== "") body.api_key = apiKey;
      await api(provider ? `/api/providers/${provider.id}` : "/api/providers", {
        method: provider ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const requestSave = () => {
    if (provider?.has_key && apiKey !== "") {
      setConfirmRotate(true);
      return;
    }
    void save();
  };

  return (
    <Modal scrimOnCancel={attemptClose} className="dialog">
      <div className="viewhead">
        <h2>{provider ? `Edit ${provider.name}` : "Add provider"}</h2>
        <button
          type="button"
          className="close"
          aria-label="Cancel"
          onClick={attemptClose}
        >
          <CloseIcon size={18} />
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <label className="field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        Base URL
        <input
          placeholder="https://host/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </label>
      <label className="field">
        API key
        <input
          type="password"
          placeholder={provider?.has_key ? "saved — leave empty to keep" : ""}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={busy || !baseUrl}
          onClick={() => void detect()}
        >
          {busy ? "Working…" : "Detect models"}
        </button>
      </div>
      {detected && (
        <ul className="modellist">
          {[...models.filter((m) => !detected.includes(m)), ...detected].map(
            (id) => (
              <li key={id}>
                <label>
                  <input
                    type="checkbox"
                    checked={models.includes(id)}
                    onChange={() => toggleModel(id)}
                  />{" "}
                  {id}
                </label>
              </li>
            ),
          )}
        </ul>
      )}
      {models.length > 0 && !detected && (
        <ul className="modellist">
          {models.map((id) => (
            <li key={id}>
              <label>
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggleModel(id)}
                />{" "}
                {id}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <input
          placeholder="Add model id manually"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addManual();
          }}
        />
        <button type="button" onClick={addManual}>
          Add
        </button>
      </div>
      <div className="actions">
        <button
          type="button"
          disabled={busy || !name || !baseUrl.startsWith("http")}
          onClick={requestSave}
        >
          Save provider
        </button>
      </div>
      {confirmRotate && provider && (
        <ConfirmDialog
          text={`Rotate the API key for ${provider.name}? The current key stops working immediately — existing integrations break until updated.`}
          confirmLabel="Rotate key"
          onCancel={() => setConfirmRotate(false)}
          onConfirm={() => {
            setConfirmRotate(false);
            void save();
          }}
        />
      )}
    </Modal>
  );
}
export const ProvidersSection = ProvidersSectionInner;
