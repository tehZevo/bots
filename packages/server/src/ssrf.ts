import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export const MAX_REDIRECTS = 5;

type LookupAddress = { address: string; family: number };
export type Lookup = (hostname: string) => Promise<LookupAddress[]>;

const defaultLookup: Lookup = async (hostname) =>
  dns.lookup(hostname, { all: true, verbatim: true });

export class HostNotAllowedError extends Error {
  constructor(message = "host not allowed") {
    super(message);
    this.name = "HostNotAllowedError";
  }
}

export function privateNetworkAllowed(): boolean {
  return process.env.BOTS_ALLOW_PRIVATE_NETWORK === "1";
}

function bareHost(hostname: string): string {
  const bracketed = /^\[(.*)\]$/.exec(hostname);
  const value = (bracketed?.[1] ?? hostname).toLowerCase();
  const zone = value.indexOf("%");
  return zone === -1 ? value : value.slice(0, zone);
}

function ipv4Octets(value: string): number[] | null {
  if (net.isIPv4(value)) return value.split(".").map(Number);
  return null;
}

function expandIpv6(value: string): number[] | null {
  const withoutZone = value.split("%")[0] ?? "";
  if (!withoutZone || net.isIPv4(withoutZone) || !net.isIPv6(withoutZone))
    return null;
  const parts = withoutZone.split("::");
  if (parts.length > 2) return null;
  const parseGroup = (group: string): number | null => {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    return Number.parseInt(group, 16);
  };

  let head: number[] = [];
  let tail: number[] = [];
  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const groups = side.split(":");
    const parsed: number[] = [];
    for (const group of groups) {
      if (net.isIPv4(group)) {
        const octets = ipv4Octets(group);
        if (!octets) return null;
        parsed.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        const value = parseGroup(group);
        if (value === null) return null;
        parsed.push(value);
      }
    }
    return parsed;
  };

  head = parseSide(parts[0] ?? "") ?? [];
  tail = parts.length === 2 ? (parseSide(parts[1] ?? "") ?? []) : [];
  const groups = [...head];
  if (parts.length === 2) {
    for (let i = head.length + tail.length; i < 8; i++) groups.push(0);
    groups.push(...tail);
  }
  return groups.length === 8 ? groups : null;
}

function normalizeIp(value: string): string | null {
  const ip = bareHost(value);
  if (!ip) return null;
  if (net.isIPv4(ip)) return ip;
  if (!net.isIPv6(ip)) return null;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped?.[1] && ipv4Octets(mapped[1])) return mapped[1];
  return ip;
}

function isPublicIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (!a && !b) return false; // 0.0.0.0/8 — unspecified/reserved
  if (a === 127 || a === 10) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false; // includes cloud metadata
  return true;
}

export function isPublicAddress(value: string): boolean {
  const ip = normalizeIp(value);
  if (!ip) return false;
  const v4 = ipv4Octets(ip);
  if (v4) return isPublicIpv4(v4);
  const groups = expandIpv6(ip);
  if (!groups) return false;
  if (groups.every((group) => group === 0)) return false; // ::
  if (groups[0] === 1 && groups.slice(1).every((group) => group === 0))
    return false; // ::1
  if (groups[5] === 0xffff) {
    const mapped = [
      (groups[6] ?? 0) >> 8,
      (groups[6] ?? 0) & 255,
      (groups[7] ?? 0) >> 8,
      (groups[7] ?? 0) & 255,
    ];
    return isPublicIpv4(mapped);
  }
  const first = groups[0] ?? 0;
  if (first >= 0xfe80 && first <= 0xfebf) return false; // fe80::/10
  if (first >= 0xfc00) return false; // fc00::/7 ULA
  return true;
}

export async function resolveSafeAddress(
  hostname: string,
  message = "host not allowed",
  lookup: Lookup = defaultLookup,
): Promise<string> {
  const host = bareHost(hostname);
  if (!host) throw new HostNotAllowedError(message);
  const literal = normalizeIp(host);
  if (literal) {
    if (!privateNetworkAllowed() && !isPublicAddress(literal))
      throw new HostNotAllowedError(message);
    return literal;
  }

  let records: LookupAddress[];
  try {
    records = await lookup(host);
  } catch (err) {
    throw new Error(`${host} could not be resolved (${String(err)})`);
  }
  const addresses = records
    .map((record) => normalizeIp(record.address))
    .filter((address): address is string => Boolean(address));
  if (!addresses.length) throw new HostNotAllowedError(message);
  if (!privateNetworkAllowed() && !addresses.every(isPublicAddress))
    throw new HostNotAllowedError(message);
  return addresses[0] as string;
}

function createRequestSignal(
  signal?: AbortSignal,
  timeoutMs = 30_000,
): { signal: AbortSignal; cleanup(): void } {
  const controller = new AbortController();
  let settled = false;
  const abort = (reason: unknown) => {
    if (settled) return;
    settled = true;
    controller.abort(reason);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs > 0) {
    timer = setTimeout(() => abort(new Error("request timed out")), timeoutMs);
    timer.unref();
  }
  signal?.addEventListener(
    "abort",
    () => abort(signal.reason ?? new Error("aborted")),
    { once: true },
  );

  return {
    signal: controller.signal,
    cleanup() {
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

function headerEntries(init?: HeadersInit): [string, string][] {
  const headers = new Headers(init ?? {});
  return [...headers.entries()];
}

type RawResponse = { status: number; headers: Headers; body: string };
type Requester = (
  url: URL,
  address: string,
  init: { signal: AbortSignal; headers?: HeadersInit },
) => Promise<RawResponse>;

async function requestOnce(
  url: URL,
  address: string,
  init: { signal: AbortSignal; headers?: HeadersInit },
): Promise<RawResponse> {
  const transport = url.protocol === "https:" ? https : http;
  const hostHeader = url.host;
  const path = `${url.pathname || "/"}${url.search}`;
  const headers = Object.fromEntries(headerEntries(init.headers)) as Record<
    string,
    string
  >;
  headers.Host = hostHeader;

  return new Promise((resolve, reject) => {
    const options: https.RequestOptions & Record<string, unknown> = {
      method: "GET",
      host: net.isIPv6(address) ? `[${address}]` : address,
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      servername: url.protocol === "https:" ? url.hostname : undefined,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path,
      headers,
      signal: init.signal,
      timeout: 30_000,
    };
    if (url.username) {
      try {
        options.auth = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
      } catch {
        // Malformed percent-encoding is handled by the server as an invalid credential.
      }
    }

    const req = transport.request(options, (res) => {
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) responseHeaders.append(key, item);
        } else if (value !== undefined) {
          responseHeaders.set(key, String(value));
        }
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer | string) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: responseHeaders,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
      res.on("error", reject);
    });

    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
}

export interface SafeResponse {
  status: number;
  headers: Headers;
  body: string;
  finalUrl: string;
  text(): Promise<string>;
}

export interface SafeFetchOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  errorMessage?: string;
  timeoutMs?: number;
  lookup?: Lookup;
  request?: Requester;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function safeFetch(
  input: string,
  options: SafeFetchOptions = {},
): Promise<SafeResponse> {
  const errorMessage = options.errorMessage ?? "host not allowed";
  let current: URL;
  try {
    current = new URL(input);
  } catch {
    throw new Error("URL must start with http:// or https://");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!["http:", "https:"].includes(current.protocol))
      throw new Error("URL must start with http:// or https://");
    const address = await resolveSafeAddress(
      current.hostname,
      errorMessage,
      options.lookup,
    );
    const requestSignal = createRequestSignal(
      options.signal,
      options.timeoutMs,
    );
    let response: RawResponse;
    try {
      response = await (options.request ?? requestOnce)(current, address, {
        signal: requestSignal.signal,
        headers: options.headers,
      });
    } finally {
      requestSignal.cleanup();
    }

    const location = response.headers.get("location");
    if (!location || !REDIRECT_STATUSES.has(response.status))
      return {
        status: response.status,
        headers: response.headers,
        body: response.body,
        finalUrl: current.toString(),
        text: async () => response.body,
      };
    current = new URL(location, current);
  }

  throw new Error("too many redirects");
}
