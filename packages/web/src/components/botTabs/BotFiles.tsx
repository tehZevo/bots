import { useEffect, useState } from "react";

export const CTX_ROWS: [
  string,
  "system_prompt" | "tools" | "conversation" | "free",
  string,
][] = [
  ["System prompt", "system_prompt", "sys"],
  ["Tool definitions", "tools", "tools"],
  ["Conversation", "conversation", "conv"],
  ["Free space", "free", "free"],
];

import { api } from "../../lib/api.ts";
import type { WorkspaceEntry } from "../../types.ts";
export function pctOf(tokens: number, window: number): number {
  if (!window || window <= 0) return 0;
  return Math.min(100, Math.round((tokens / window) * 100));
}

export const FILE_PREVIEW_LIMIT = 256 * 1024;

export function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function BotFiles({ botId }: { botId: string }) {
  const [path, setPath] = useState("");
  const [data, setData] = useState<{
    path: string;
    entries: WorkspaceEntry[];
  } | null>(null);
  const [_refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<WorkspaceEntry | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    let active = true;
    void api<{ path: string; entries: WorkspaceEntry[] }>(
      `/api/bots/${botId}/workspace?path=${encodeURIComponent(path)}`,
    )
      .then((d) => active && setData(d))
      .catch(() => active && setData({ path, entries: [] }));
    return () => {
      active = false;
    };
  }, [botId, path]);

  const fileUrl = (p: string) =>
    `/api/bots/${botId}/workspace/file?path=${encodeURIComponent(p)}`;
  const joinPath = (name: string) => (path ? `${path}/${name}` : name);

  const openEntry = async (entry: WorkspaceEntry) => {
    if (entry.type === "dir") {
      setSelected(null);
      setPath(joinPath(entry.name));
      return;
    }
    setSelected(entry);
    setFileText(null);
    setBinary(false);
    setTruncated(false);
    if (entry.size_bytes > FILE_PREVIEW_LIMIT) return;
    setLoadingFile(true);
    try {
      const res = await fetch(fileUrl(joinPath(entry.name)));
      if (!res.ok) throw new Error(String(res.status));
      const buf = new Uint8Array(await res.arrayBuffer());
      setTruncated(buf.byteLength < entry.size_bytes);
      try {
        setFileText(new TextDecoder("utf-8", { fatal: true }).decode(buf));
      } catch {
        setBinary(true);
      }
    } catch {
      setBinary(true);
    } finally {
      setLoadingFile(false);
    }
  };

  const crumbs = path ? path.split("/") : [];
  return (
    <section>
      <div className="actions">
        <nav className="crumbs" aria-label="Workspace path">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setPath("");
            }}
          >
            workspace
          </button>
          {crumbs.map((seg, i) => (
            <span key={seg}>
              /{" "}
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setPath(crumbs.slice(0, i + 1).join("/"));
                }}
              >
                {seg}
              </button>
            </span>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setRefreshKey((k) => k + 1);
          }}
        >
          Refresh
        </button>
      </div>
      {(data?.entries.length ?? 0) === 0 && (
        <p className="muted">Empty directory.</p>
      )}
      {(data?.entries ?? []).map((entry) => (
        <div key={entry.name} className="filerow">
          <button type="button" onClick={() => void openEntry(entry)}>
            {entry.type === "dir" ? `${entry.name}/` : entry.name}
          </button>
          {entry.type === "file" && (
            <span className="muted">{fmtBytes(entry.size_bytes)}</span>
          )}
          <span className="muted">
            {new Date(entry.modified_at).toLocaleString()}
          </span>
        </div>
      ))}
      {selected && (
        <article className="fileview">
          <div className="actions">
            <strong>{selected.name}</strong>
            <a href={fileUrl(joinPath(selected.name))}>Download</a>
          </div>
          {selected.size_bytes > FILE_PREVIEW_LIMIT ? (
            <p className="muted">Larger than 256 KB — download only.</p>
          ) : loadingFile ? (
            <p className="muted">Loading…</p>
          ) : binary ? (
            <p className="muted">Binary file — download to inspect.</p>
          ) : (
            fileText !== null && (
              <>
                {truncated && <p className="muted">Truncated at 256 KB.</p>}
                <pre>{fileText}</pre>
              </>
            )
          )}
        </article>
      )}
    </section>
  );
}
