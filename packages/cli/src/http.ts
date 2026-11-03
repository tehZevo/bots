import { CliError, EXIT, exitForStatus, warn } from "./output.ts";

export interface Ctx {
  url: string;
  apiKey: string;
  verbose: boolean;
}

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  raw?: boolean;
}

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export function parseHeaders(
  pairs: string[] | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of pairs ?? []) {
    const index = pair.indexOf("=");
    if (index < 1) {
      throw new CliError(`--header expects KEY=VALUE, got ${pair}`, EXIT.usage);
    }
    headers[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return headers;
}

export interface Response {
  status: number;
  body: unknown;
  text: string;
  isJson: boolean;
}

// specs/cli/api.md — one authenticated request, never leaving the origin, and
// redirects are errors rather than something to follow.
export async function request(
  ctx: Ctx,
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const upper = method.toUpperCase();
  if (options.body !== undefined && !BODY_METHODS.has(upper)) {
    throw new CliError(`${upper} cannot carry a request body`, EXIT.usage);
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${ctx.apiKey}`,
    ...(options.body !== undefined
      ? { "content-type": "application/json" }
      : {}),
    ...(options.headers ?? {}),
  };
  if (ctx.verbose) {
    process.stderr.write(`${upper} ${ctx.url}${path} -> `);
  }
  const res = await fetch(`${ctx.url}${path}`, {
    method: upper,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  }).catch((err: Error) => {
    throw new CliError(`network error: ${err.message}`, EXIT.unexpected);
  });
  if (ctx.verbose) {
    process.stderr.write(`${res.status}\n`);
  }
  if (res.status >= 300 && res.status < 400) {
    throw new CliError(
      `redirect (${res.status}) is not followed`,
      EXIT.unexpected,
    );
  }
  const text = await res.text();
  let body: unknown = null;
  let isJson = false;
  try {
    body = text === "" ? null : JSON.parse(text);
    isJson = true;
  } catch {
    /* non-JSON responses are printed as text */
  }
  if (!res.ok) {
    const detail =
      isJson && body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : text || `${res.status}`;
    if (ctx.verbose && isJson) {
      process.stderr.write(`${JSON.stringify(body)}\n`);
    }
    throw new CliError(`${res.status} ${detail}`, exitForStatus(res.status));
  }
  return { status: res.status, body, text, isJson };
}

export function checkOriginPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new CliError(
      "path must be an absolute path on the configured server",
      EXIT.usage,
    );
  }
  if (/^https?:\/\//i.test(path)) {
    throw new CliError("absolute urls are not accepted here", EXIT.usage);
  }
  return path;
}

export function warnOnce(message: string): void {
  warn(message);
}
