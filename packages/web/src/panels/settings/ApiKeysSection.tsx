import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api.ts";
import { relTime } from "../../lib/format.ts";
import type { ApiKey } from "../../types.ts";

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keyName, setKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [mcpEnabled, setMcpEnabled] = useState(true);

  const loadKeys = useCallback(async () => {
    const list = await api<ApiKey[]>("/api/api-keys").catch(
      () => [] as ApiKey[],
    );
    setKeys(list);
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const createKey = async () => {
    const res = await api<{ value: string }>("/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: keyName.trim() }),
    }).catch(() => null);
    if (res?.value) {
      setRevealedKey(res.value);
      setKeyName("");
      void loadKeys();
    }
  };

  const revokeKey = async (id: string) => {
    await api(`/api/api-keys/${id}`, { method: "DELETE" }).catch(() => null);
    void loadKeys();
  };

  return (
    <>
      <p className="muted">API keys</p>
      <ul className="plist">
        {keys.map((k) => (
          <li key={k.id}>
            <div className="pinfo">
              <strong>{k.name}</strong>
              <span className="muted">created {relTime(k.created_at)}</span>
              <span className="muted">
                {k.last_used_at === null
                  ? "never used"
                  : `last used ${relTime(k.last_used_at)}`}
              </span>
            </div>
            <div className="actions">
              <button type="button" onClick={() => void revokeKey(k.id)}>
                Revoke
              </button>
            </div>
          </li>
        ))}
      </ul>
      {revealedKey !== null && (
        <p className="keyreveal">
          New key — shown once: <code>{revealedKey}</code>
        </p>
      )}
      <div className="keyrow">
        <input
          placeholder="Key name"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
        />
        <button
          type="button"
          disabled={!keyName.trim()}
          onClick={() => void createKey()}
        >
          Add key
        </button>
      </div>
      <p className="muted">
        Headless access: <a href="/api/openapi.json">OpenAPI spec</a>
      </p>
    </>
  );
}
