import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon } from "../components/icons/CloseIcon.tsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { UnsavedNote, useDiscardGuard } from "../components/ui/discard.tsx";
import { Modal } from "../components/ui/Modal.tsx";
import { api } from "../lib/api.ts";
import {
  findDuplicateEnvKey,
  isMcpSecretRef,
  mcpEnvMapFromRows,
  mcpEnvRowsFromRecord,
} from "../lib/mcpEnv.ts";
import type { McpEnvRow, McpServer, SecretMeta } from "../types.ts";

export function IntegrationsPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [form, setForm] = useState<McpServer | "new" | null>(null);
  const [removing, setRemoving] = useState<McpServer | null>(null);
  const [results, setResults] = useState<
    Record<string, { tools?: number; error?: string; busy?: boolean }>
  >({});

  const reload = useCallback(
    () =>
      api<McpServer[]>("/api/mcp-servers")
        .then(setServers)
        .catch(() => setServers([])),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const test = (server: McpServer) => {
    setResults((r) => ({ ...r, [server.id]: { busy: true } }));
    api<{ tools: number }>(`/api/mcp-servers/${server.id}/test`, {
      method: "POST",
    })
      .then((res) =>
        setResults((r) => ({ ...r, [server.id]: { tools: res.tools } })),
      )
      .catch((e: Error) =>
        setResults((r) => ({ ...r, [server.id]: { error: e.message } })),
      );
  };

  return (
    <section>
      <div className="viewhead">
        <button type="button" onClick={() => setForm("new")}>
          Add MCP server
        </button>
      </div>
      <h3>MCP Servers</h3>
      <div className="mcpsection">
        {servers.length === 0 && (
          <p className="muted">No MCP servers yet — add one above.</p>
        )}
        {servers.map((s) => {
          const r = results[s.id];
          return (
            <div className="mcpsrv" key={s.id}>
              <header>
                <strong>{s.name}</strong>
                {!s.enabled && <span className="muted">(disabled)</span>}
                <button
                  type="button"
                  onClick={() => test(s)}
                  disabled={r?.busy}
                >
                  {r?.busy ? "Testing…" : "Test connection"}
                </button>
                <button type="button" onClick={() => setForm(s)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => setRemoving(s)}
                >
                  Delete
                </button>
              </header>
              <code>{[s.command, ...s.args].join(" ")}</code>
              {Object.entries(s.env).length > 0 && (
                <p className="muted envline">
                  {Object.entries(s.env).map(([key, value]) => {
                    const secret = isMcpSecretRef(value) ? value.secret : null;
                    return (
                      <span key={key} className="envchip">
                        {`${key}=••••`}
                        {secret && <span className="srcbadge">{secret}</span>}
                      </span>
                    );
                  })}
                </p>
              )}
              {r?.tools !== undefined && (
                <p className="ok line">Connected — {r.tools} tools</p>
              )}
              {r?.error && <p className="error line">{r.error}</p>}
            </div>
          );
        })}
      </div>
      {removing && (
        <ConfirmDialog
          text={`Delete MCP server ${removing.name}? Bots granted this server will lose its tools.`}
          confirmLabel="Delete server"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            setRemoving(null);
            api(`/api/mcp-servers/${removing.id}`, { method: "DELETE" })
              .then(reload)
              .catch((e) => alert(e.message));
          }}
        />
      )}
      {form && (
        <McpServerModal
          server={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}
export function McpServerModal({
  server,
  onClose,
  onSaved,
}: {
  server: McpServer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(server?.name ?? "");
  const [command, setCommand] = useState(server?.command ?? "");
  const [args, setArgs] = useState((server?.args ?? []).join("\n"));
  const [envRows, setEnvRows] = useState<McpEnvRow[]>(() => {
    const rows = mcpEnvRowsFromRecord(server?.env ?? {});
    return rows.length > 0 ? rows : [{ key: "", mode: "literal", value: "" }];
  });
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [enabled, setEnabled] = useState(server ? server.enabled === 1 : true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void api<SecretMeta[]>("/api/secrets")
      .then((items) => {
        if (live) setSecrets(items);
      })
      .catch(() => {
        if (live) setSecrets([]);
      });
    return () => {
      live = false;
    };
  }, []);
  const snap = useRef({
    name: server?.name ?? "",
    command: server?.command ?? "",
    args: (server?.args ?? []).join("\n"),
    env: JSON.stringify(envRows),
    enabled: server ? server.enabled === 1 : true,
  }).current;
  const dirty =
    name !== snap.name ||
    command !== snap.command ||
    args !== snap.args ||
    JSON.stringify(envRows) !== snap.env ||
    enabled !== snap.enabled;
  const attemptClose = useDiscardGuard(
    server ? `MCP server ${server.name}` : "this new MCP server",
    dirty,
    onClose,
  );

  return (
    <Modal
      scrimOnCancel={attemptClose}
      scrimLabel="Close"
      className="dialog"
      role="dialog"
      aria-label="MCP server"
    >
      <h2>{server ? "Edit MCP server" : "Add MCP server"}</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const duplicateKey = findDuplicateEnvKey(envRows);
          if (duplicateKey !== null) {
            setError(`duplicate environment variable key ${duplicateKey}`);
            return;
          }
          setBusy(true);
          setError(null);
          const body = {
            name,
            command,
            args: args
              .split("\n")
              .map((a) => a.trim())
              .filter(Boolean),
            env: mcpEnvMapFromRows(envRows),
            enabled,
          };
          try {
            await api(
              server ? `/api/mcp-servers/${server.id}` : "/api/mcp-servers",
              {
                method: server ? "PATCH" : "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              },
            );
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
          Command
          <input
            value={command}
            placeholder="npx"
            onChange={(e) => setCommand(e.target.value)}
            required
          />
        </label>
        <label>
          Args (one per line)
          <textarea
            rows={3}
            value={args}
            placeholder={"-y\n@example/mcp-server"}
            onChange={(e) => setArgs(e.target.value)}
          />
        </label>
        <fieldset className="envrows">
          <legend>Env vars</legend>
          {envRows.map((row, i) => (
            <div className="envrow" key={i}>
              <input
                placeholder="KEY"
                value={row.key}
                onChange={(e) =>
                  setEnvRows(
                    envRows.map((r, j) =>
                      j === i ? { ...r, key: e.target.value } : r,
                    ),
                  )
                }
              />
              <div className="envvalue">
                <div className="themegroup envmode">
                  <button
                    type="button"
                    aria-label={`Use a literal value for env var ${i + 1}`}
                    className={row.mode === "literal" ? "sel" : ""}
                    onClick={() =>
                      setEnvRows(
                        envRows.map((r, j) =>
                          j === i ? { ...r, mode: "literal" } : r,
                        ),
                      )
                    }
                  >
                    Literal
                  </button>
                  <button
                    type="button"
                    aria-label={`Use a secret reference for env var ${i + 1}`}
                    className={row.mode === "secret" ? "sel" : ""}
                    onClick={() =>
                      setEnvRows(
                        envRows.map((r, j) => {
                          if (j !== i) return r;
                          const known = secrets.some((s) => s.name === r.value);
                          return {
                            ...r,
                            mode: "secret",
                            value: known ? r.value : "",
                          };
                        }),
                      )
                    }
                  >
                    Secret
                  </button>
                </div>
                {row.mode === "literal" ? (
                  <input
                    placeholder="value"
                    value={row.value}
                    onChange={(e) =>
                      setEnvRows(
                        envRows.map((r, j) =>
                          j === i ? { ...r, value: e.target.value } : r,
                        ),
                      )
                    }
                  />
                ) : (
                  <select
                    aria-label={`Env var ${i + 1} secret`}
                    value={row.value}
                    onChange={(e) =>
                      setEnvRows(
                        envRows.map((r, j) =>
                          j === i ? { ...r, value: e.target.value } : r,
                        ),
                      )
                    }
                  >
                    <option value="">Select a secret…</option>
                    {row.value &&
                      !secrets.some((s) => s.name === row.value) && (
                        <option
                          value={row.value}
                        >{`${row.value} (missing)`}</option>
                      )}
                    {secrets.map((secret) => (
                      <option key={secret.id} value={secret.name}>
                        {secret.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                type="button"
                className="danger ghost"
                aria-label={`Remove env var ${i + 1}`}
                onClick={() => setEnvRows(envRows.filter((_, j) => j !== i))}
              >
                <CloseIcon size={18} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="linklike"
            onClick={() =>
              setEnvRows([...envRows, { key: "", mode: "literal", value: "" }])
            }
          >
            + Add variable
          </button>
        </fieldset>
        <label className="checkrow">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={attemptClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <UnsavedNote dirty={dirty} />
        </div>
      </form>
    </Modal>
  );
}
