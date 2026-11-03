// specs/cli/output.md — exit codes, stream split, and color rules.
export const EXIT = {
  ok: 0,
  unexpected: 1,
  usage: 2,
  auth: 3,
  notFound: 4,
  conflict: 5,
} as const;

export const STATUS_EXIT: Record<number, number> = {
  400: EXIT.usage,
  401: EXIT.auth,
  403: EXIT.auth,
  404: EXIT.notFound,
  409: EXIT.conflict,
  413: EXIT.unexpected,
  422: EXIT.usage,
  429: EXIT.unexpected,
};

export function exitForStatus(status: number): number {
  return STATUS_EXIT[status] ?? EXIT.unexpected;
}

export class CliError extends Error {
  code: number;
  constructor(message: string, code: number = EXIT.unexpected) {
    super(message);
    this.code = code;
  }
}

let colorEnabled = true;

export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

export function style(text: string, kind: "dim" | "red" | "green"): string {
  if (!colorEnabled) return text;
  const code = kind === "dim" ? 2 : kind === "red" ? 31 : 32;
  return `\u001b[${code}m${text}\u001b[0m`;
}

export function warn(message: string): void {
  process.stderr.write(`bots: ${message}\n`);
}

export function fail(message: string): never {
  process.stderr.write(`${style(`bots: ${message}`, "red")}\n`);
  process.exit(EXIT.unexpected);
}

export function out(line = ""): void {
  try {
    process.stdout.write(`${line}\n`);
  } catch {
    /* stdout closed early (piped to head); nothing left to say */
  }
}

export function renderTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cells = rows.map((row) => keys.map((key) => formatCell(row[key])));
  const header = keys.map((key) => key.toUpperCase());
  const widths = header.map((label, i) =>
    Math.max(label.length, ...cells.map((row) => row[i].length)),
  );
  const tsv = !process.stdout.isTTY;
  const line = (parts: string[]) =>
    tsv
      ? parts.join("\t")
      : parts.map((part, i) => part.padEnd(widths[i])).join("  ");
  return [
    tsv ? line(header) : style(line(header), "dim"),
    ...cells.map((row) => line(row)),
  ].join("\n");
}

export function renderKeyValues(value: Record<string, unknown>): string {
  const keys = Object.keys(value);
  const width = Math.max(0, ...keys.map((key) => key.length));
  return keys
    .map(
      (key) => `${style(key.padEnd(width), "dim")}  ${formatCell(value[key])}`,
    )
    .join("\n");
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
