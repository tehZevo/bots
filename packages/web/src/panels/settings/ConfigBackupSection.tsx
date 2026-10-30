import { useState } from "react";

const CONFIG_REPORT_LABELS: Record<string, string> = {
  bots: "Bots",
  roles: "Roles",
  skills: "Skills",
  mcp_servers: "MCP servers",
  projects: "Projects",
  tags: "Tags",
  teams: "Teams",
  templates: "Templates",
  secrets: "Secrets",
  api_keys: "API keys",
};

import { SwitchToggle } from "../../components/ui/SwitchToggle.tsx";
import { api } from "../../lib/api.ts";
export const CONFIG_REPORT_ORDER = [
  "bots",
  "roles",
  "skills",
  "mcp_servers",
  "projects",
  "tags",
  "teams",
  "templates",
  "secrets",
  "api_keys",
];

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatConfigBackupReport(value: unknown): string[] {
  if (!isJsonObject(value) || !isJsonObject(value.report)) return [];
  const report = value.report as Record<string, unknown>;
  const keys = [
    ...CONFIG_REPORT_ORDER.filter((key) => key in report),
    ...Object.keys(report)
      .filter((key) => !CONFIG_REPORT_ORDER.includes(key))
      .sort(),
  ];
  return keys.map((key) => {
    const counts = isJsonObject(report[key]) ? report[key] : {};
    const created = typeof counts.created === "number" ? counts.created : 0;
    const updated = typeof counts.updated === "number" ? counts.updated : 0;
    const label = CONFIG_REPORT_LABELS[key] ?? key.replace(/_/g, " ");
    return `${label}: ${created} created, ${updated} updated`;
  });
}

export function configRestoreBody(
  snapshot: unknown,
  secretValues: Record<string, string>,
): unknown {
  if (Object.keys(secretValues).length === 0) return snapshot;
  return { config: snapshot, secret_values: secretValues };
}

export function configBackupGeneratedKeys(value: unknown): [string, string][] {
  if (!isJsonObject(value) || !isJsonObject(value.api_key_values)) return [];
  const values = value.api_key_values as Record<string, unknown>;
  return Object.entries(values).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
}

export function ConfigBackupSection() {
  const [includeValues, setIncludeValues] = useState(false);
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportLines, setReportLines] = useState<string[]>([]);
  const [generatedKeys, setGeneratedKeys] = useState<[string, string][]>([]);
  const [missingSecrets, setMissingSecrets] = useState<string[]>([]);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});

  async function exportConfig(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await api<unknown>(
        `/api/backup/config?include_values=${includeValues ? "true" : "false"}`,
      );
      const blob = new Blob([`${JSON.stringify(result, null, 2)}\n`], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bots-config-${new Date().toISOString().replace(/:/g, "-")}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function restoreConfig(): Promise<void> {
    if (snapshot === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/backup/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(configRestoreBody(snapshot, secretValues)),
      });
      const result = (await res.json()) as unknown;
      if (!res.ok) {
        setError(
          isJsonObject(result) && typeof result.error === "string"
            ? result.error
            : `${res.status}`,
        );
        const missing =
          isJsonObject(result) && Array.isArray(result.missing_secret_names)
            ? result.missing_secret_names.filter(
                (x): x is string => typeof x === "string",
              )
            : [];
        setMissingSecrets(missing);
        setSecretValues(
          Object.fromEntries(
            missing.map((name) => [name, secretValues[name] ?? ""]),
          ),
        );
        return;
      }
      setReportLines(formatConfigBackupReport(result));
      setGeneratedKeys(configBackupGeneratedKeys(result));
      setMissingSecrets([]);
      setSecretValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const restoreDisabled =
    busy ||
    snapshot === null ||
    missingSecrets.some((name) => !secretValues[name]?.trim());

  return (
    <div className="backupconfig">
      <p className="muted">Configuration backup</p>
      <div className="actions">
        <SwitchToggle
          title={
            <span id="secret-values-export-label">Secret values in export</span>
          }
          labelledBy="secret-values-export-label"
          checked={includeValues}
          onChange={() => setIncludeValues((current) => !current)}
          stateLabel={includeValues ? "Included" : "Names only"}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportConfig()}
        >
          Export config
        </button>
      </div>
      <p className="muted">
        Secret values are omitted by default and stay server-side during
        restore.
      </p>

      <div className="actions">
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Configuration backup file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setFileName(file.name);
            setSnapshot(null);
            setError(null);
            setReportLines([]);
            setGeneratedKeys([]);
            setMissingSecrets([]);
            setSecretValues({});
            void file.text().then(
              (text) => {
                try {
                  setSnapshot(JSON.parse(text));
                } catch {
                  setError("restore file must contain valid JSON");
                }
              },
              () => setError("could not read backup file"),
            );
          }}
        />
        <button
          type="button"
          disabled={restoreDisabled}
          onClick={() => void restoreConfig()}
        >
          Restore config
        </button>
      </div>
      {fileName && <p className="muted">Selected: {fileName}</p>}

      {missingSecrets.length > 0 && (
        <>
          <p className="muted">
            Add the missing secret values to complete restore.
          </p>
          <div className="backupsecretrows">
            {missingSecrets.map((name) => (
              <label key={name} className="keyrow backupsecretrow">
                <span>{name}</span>
                <input
                  type="password"
                  aria-label={`Secret value for ${name}`}
                  autoComplete="off"
                  value={secretValues[name] ?? ""}
                  onChange={(event) =>
                    setSecretValues((current) => ({
                      ...current,
                      [name]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </>
      )}

      {error && <p className="muted">{error}</p>}
      {reportLines.length > 0 && (
        <>
          <p className="muted">Restore report</p>
          <ul className="plist">
            {reportLines.map((line) => (
              <li key={line}>
                <div className="pinfo">{line}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      {generatedKeys.length > 0 && (
        <>
          <p className="keyreveal">New API keys — shown once:</p>
          <ul className="plist">
            {generatedKeys.map(([name, value]) => (
              <li key={name}>
                <div className="pinfo">
                  <strong>{name}</strong>
                  <code>{value}</code>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
