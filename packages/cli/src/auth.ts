import { spawn } from "node:child_process";
import os from "node:os";
import {
  assertUrl,
  type CliConfig,
  deleteConfig,
  readConfig,
  writeConfig,
} from "./config.ts";
import { CliError, EXIT, out, renderKeyValues, style, warn } from "./output.ts";

const KEY_SHAPE = /^bots_[0-9a-f]{40}$/;

interface Session {
  url: string;
  cookie: string | null;
}

async function sessionFetch(
  session: Session,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${session.url}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(session.cookie ? { cookie: session.cookie } : {}),
      ...(init.headers ?? {}),
    },
  }).catch((err: Error) => {
    throw new CliError(`network error: ${err.message}`, EXIT.unexpected);
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    /* surfaced as text below */
  }
  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : text || `${res.status}`;
    throw new CliError(`${res.status} ${detail}`, EXIT.auth);
  }
  return { status: res.status, body };
}

function cookieOf(res: Response): string | null {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.length > 0 ? raw.map((c) => c.split(";")[0]).join("; ") : null;
}

function defaultKeyName(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `bots-cli ${os.hostname()} ${day}`;
}

async function mintKey(
  session: Session,
  name: string,
): Promise<Record<string, string>> {
  const created = await sessionFetch(session, "/api/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return created.body as Record<string, string>;
}

async function withSession(
  url: string,
  run: (session: Session) => Promise<CliConfig>,
): Promise<CliConfig> {
  const config = await fetch(`${url}/api/auth/config`)
    .then((res) => res.json())
    .catch(() => null);
  if (!config) {
    throw new CliError(`cannot reach ${url}`, EXIT.unexpected);
  }
  return run({ url, cookie: null });
}

export async function loginWithPassword(options: {
  url: string;
  email: string;
  password: string;
  keyName?: string;
}): Promise<CliConfig> {
  assertUrl(options.url, false);
  const url = options.url.replace(/\/+$/, "");
  return withSession(url, async (session) => {
    const res = await fetch(`${url}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: options.email,
        password: options.password,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new CliError(
        `${res.status} ${body?.error ?? "login failed"}`,
        EXIT.auth,
      );
    }
    session.cookie = cookieOf(res);
    const key = await mintKey(session, options.keyName || defaultKeyName());
    await fetch(`${url}/api/auth/logout`, {
      method: "POST",
      headers: session.cookie ? { cookie: session.cookie } : {},
    }).catch(() => undefined);
    return {
      url,
      email: options.email,
      api_key: key.value,
      key_id: key.id,
      key_name: key.name,
    };
  });
}

export async function loginWithApiKey(options: {
  url: string;
  apiKey: string;
}): Promise<CliConfig> {
  assertUrl(options.url, false);
  if (!KEY_SHAPE.test(options.apiKey)) {
    throw new CliError(
      "api key must be `bots_` followed by 40 hex characters",
      EXIT.usage,
    );
  }
  const url = options.url.replace(/\/+$/, "");
  const res = await fetch(`${url}/api/auth/me`, {
    headers: { authorization: `Bearer ${options.apiKey}` },
  }).catch((err: Error) => {
    throw new CliError(`network error: ${err.message}`, EXIT.unexpected);
  });
  if (!res.ok) {
    throw new CliError(`${res.status} api key rejected`, EXIT.auth);
  }
  const me = (await res.json()) as { email?: string; key_id?: string | null };
  return {
    url,
    email: me.email,
    api_key: options.apiKey,
    key_id: me.key_id ?? null,
    key_name: undefined,
  };
}

export async function signupAndLogin(options: {
  url: string;
  email: string;
  password: string;
  keyName?: string;
}): Promise<CliConfig> {
  assertUrl(options.url, false);
  const url = options.url.replace(/\/+$/, "");
  const res = await fetch(`${url}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: options.email, password: options.password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    const hint =
      res.status === 403
        ? " (registration is disabled: set ALLOW_REGISTRATION)"
        : "";
    throw new CliError(
      `${res.status} ${body?.error ?? "signup failed"}${hint}`,
      EXIT.auth,
    );
  }
  return loginWithPassword(options);
}

// specs/auth/device-login.md — the browser approves the code; the CLI polls
// until the grant is approved, denied, or expires.
export async function loginWithDevice(options: {
  url: string;
  openBrowser: boolean;
  clientName?: string;
}): Promise<CliConfig> {
  assertUrl(options.url, false);
  const url = options.url.replace(/\/+$/, "");
  const started = await fetch(`${url}/api/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: options.clientName ?? "bots-cli" }),
  }).catch((err: Error) => {
    throw new CliError(`network error: ${err.message}`, EXIT.unexpected);
  });
  if (!started.ok) {
    throw new CliError(
      `${started.status} could not start device login`,
      EXIT.auth,
    );
  }
  const grant = (await started.json()) as {
    device_code: string;
    user_code: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };
  if (options.openBrowser) {
    out(`opening ${grant.verification_uri_complete} in your browser…`);
    const tool =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    try {
      spawn(tool, [grant.verification_uri_complete], {
        stdio: "ignore",
        detached: true,
      }).unref();
    } catch {
      warn("could not open a browser; open the url yourself");
    }
  }
  out(
    `code ${grant.user_code} — waiting for approval (up to ${Math.round(grant.expires_in / 60)}m)`,
  );
  const deadline = Date.now() + grant.expires_in * 1000;
  const wait = Math.max(1, grant.interval) * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    const poll = await fetch(`${url}/api/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: grant.device_code }),
    }).catch(() => null);
    if (!poll) continue;
    const body = (await poll.json().catch(() => null)) as Record<
      string,
      string
    > | null;
    if (poll.ok && body?.api_key) {
      return {
        url,
        email: body.email,
        api_key: body.api_key,
        key_id: body.key_id,
        key_name: body.key_name,
      };
    }
    const error = body?.error ?? "";
    if (error === "authorization_pending" || error === "slow_down") continue;
    throw new CliError(error || "device login failed", EXIT.auth);
  }
  throw new CliError("device login expired before it was approved", EXIT.auth);
}

export function saveLogin(file: string, next: CliConfig): void {
  const previous = readConfig(file);
  writeConfig(file, next);
  if (previous.key_id && previous.key_id !== next.key_id) {
    void revokeKey(next, previous.key_id).catch((err: Error) => {
      warn(`could not revoke previous key ${previous.key_id}: ${err.message}`);
    });
  }
}

async function revokeKey(withKey: CliConfig, keyId: string): Promise<void> {
  const res = await fetch(`${withKey.url}/api/api-keys/${keyId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${withKey.api_key}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `${res.status}`);
  }
}

export async function logout(file: string, keepKey: boolean): Promise<void> {
  const stored = readConfig(file);
  if (!stored.url || !stored.api_key) {
    throw new CliError("not logged in", EXIT.auth);
  }
  let revoked = false;
  if (!keepKey && stored.key_id) {
    try {
      await revokeKey(stored as Required<CliConfig>, stored.key_id);
      revoked = true;
    } catch (err) {
      warn(
        `could not revoke ${stored.key_id}: ${(err as Error).message}; revoke it in Settings`,
      );
    }
  }
  deleteConfig(file);
  out(
    keepKey
      ? "logged out; key kept"
      : revoked
        ? "logged out; key revoked"
        : "logged out; local config removed",
  );
}

export async function showStatus(file: string, source: string): Promise<void> {
  const stored = readConfig(file);
  if (!stored.url || !stored.api_key) {
    throw new CliError("not logged in: run `bots auth login`", EXIT.auth);
  }
  const masked = `${stored.api_key.slice(0, 9)}…${stored.api_key.slice(-4)}`;
  out(
    renderKeyValues({
      url: stored.url,
      email: stored.email ?? "",
      key: masked,
      key_id: stored.key_id ?? "",
      key_name: stored.key_name ?? "",
      source,
    }),
  );
  const res = await fetch(`${stored.url}/api/auth/me`, {
    headers: { authorization: `Bearer ${stored.api_key}` },
  }).catch(() => null);
  if (!res?.ok) {
    throw new CliError("stored key was rejected by the server", EXIT.auth);
  }
  const me = (await res.json()) as { email?: string };
  out(style(`verified as ${me.email}`, "green"));
}
