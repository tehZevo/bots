import type { McpEnvRow, McpEnvValue, McpSecretRef } from "../types.ts";

export function isMcpSecretRef(value: unknown): value is McpSecretRef {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { secret?: unknown }).secret === "string"
  );
}

export function mcpEnvRowsFromRecord(
  env: Record<string, McpEnvValue>,
): McpEnvRow[] {
  return Object.entries(env).map(([key, value]) =>
    isMcpSecretRef(value)
      ? { key, mode: "secret", value: value.secret }
      : { key, mode: "literal", value },
  );
}

export function mcpEnvMapFromRows(
  rows: McpEnvRow[],
): Record<string, McpEnvValue> {
  const env: Record<string, McpEnvValue> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    env[key] = row.mode === "secret" ? { secret: row.value } : row.value;
  }
  return env;
}

export function findDuplicateEnvKey(rows: { key: string }[]): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    const trimmed = row.key.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) return trimmed;
    seen.add(trimmed);
  }
  return null;
}
