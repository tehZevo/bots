import { readFileSync } from "node:fs";
import { type Ctx, request } from "./http.ts";
import { CliError, EXIT, out, renderKeyValues, renderTable } from "./output.ts";

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function readValue(
  value: string | undefined,
): Promise<string | undefined> {
  if (value === undefined) return undefined;
  if (value === "-") return (await readStdin()).replace(/\n$/, "");
  if (value.startsWith("@")) {
    return readFileSync(value.slice(1), "utf8").replace(/\n$/, "");
  }
  return value;
}

export function requireFlag(
  opts: Record<string, unknown>,
  ...names: string[]
): string {
  for (const name of names) {
    const value = opts[name];
    if (typeof value === "string" && value !== "") return value;
  }
  throw new CliError(`${names[0]} is required`, EXIT.usage);
}

export function mutuallyExclusive(
  opts: Record<string, unknown>,
  names: string[],
): void {
  if (
    names.filter((n) => opts[n] !== undefined && opts[n] !== false).length > 1
  )
    throw new CliError(`${names.join(" and ")} are mutually exclusive`, 2);
}

// specs/cli/content.md — references accept a unique name or id; zero matches
// exit 4, multiple matches exit 2 with the candidates.
export async function resolveRef(
  ctx: Ctx,
  path: string,
  ref: string,
  nameField = "name",
): Promise<Record<string, unknown>> {
  const res = await request(ctx, "GET", path);
  const rows = (Array.isArray(res.body) ? res.body : []) as Record<
    string,
    unknown
  >[];
  const byId = rows.filter((r) => r.id === ref);
  const matches = byId.length ? byId : rows.filter((r) => r[nameField] === ref);
  if (matches.length === 0)
    throw new CliError(`no match for '${ref}'`, EXIT.notFound);
  if (matches.length > 1) {
    throw new CliError(
      `'${ref}' is ambiguous: ${matches.map((m) => m.id).join(", ")}`,
      EXIT.usage,
    );
  }
  return matches[0];
}

export async function resolveId(
  ctx: Ctx,
  path: string,
  ref: string,
  nameField = "name",
): Promise<string> {
  return String((await resolveRef(ctx, path, ref, nameField)).id);
}

export function printList(
  quiet: boolean,
  rows: Record<string, unknown>[],
  columns: Record<string, (row: never) => unknown>,
  idField = "id",
): void {
  if (quiet) {
    for (const row of rows) out(String(row[idField] ?? ""));
    return;
  }
  const table = rows.map((row) => {
    const entry: Record<string, unknown> = {};
    for (const [key, pick] of Object.entries(columns))
      entry[key] = (pick as (r: Record<string, unknown>) => unknown)(row);
    return entry;
  });
  const text = renderTable(table);
  if (text) out(text);
}

export function printOne(
  quiet: boolean,
  row: Record<string, unknown>,
  fields: string[],
  idField = "id",
): void {
  if (quiet) {
    out(String(row[idField] ?? ""));
    return;
  }
  const entry: Record<string, unknown> = {};
  for (const field of fields) entry[field] = row[field];
  out(renderKeyValues(entry));
}

export function parseJsonArray(
  values: string[] | undefined,
  what: string,
): unknown[] | undefined {
  if (values === undefined) return undefined;
  return values.map((v) => {
    try {
      return JSON.parse(v);
    } catch {
      throw new CliError(`${what} must be json`, EXIT.usage);
    }
  });
}

export function parseKeyValues(
  pairs: string[] | undefined,
): Record<string, string> | undefined {
  if (pairs === undefined) return undefined;
  const record: Record<string, string> = {};
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index < 1)
      throw new CliError(`expected KEY=VALUE, got '${pair}'`, EXIT.usage);
    record[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return record;
}
