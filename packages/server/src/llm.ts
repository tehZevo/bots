import { lookup as dnsLookup } from "node:dns/promises";
import { connect as netConnect } from "node:net";
import type { Model } from "@earendil-works/pi-ai";
import { devFakeLlm } from "./config.ts";
import type { ProviderRow } from "./db.ts";
import { getProvider, getSetting } from "./db.ts";
import {
  FAKE_MODEL_ID,
  FAKE_PROVIDER_ID,
  fakeOpenAiModel,
  fakeProviderRow,
} from "./fake-llm.ts";

export interface ResolvedLlm {
  model: Model<"openai-completions">;
  apiKey: string;
  providerName: string;
  baseUrl: string;
}

export function resolveDefault(
  modelOverride?: string | null,
): ResolvedLlm | null {
  const providerId = getSetting("default_provider_id");
  if (!providerId) return null;
  if (devFakeLlm && providerId === FAKE_PROVIDER_ID) {
    const modelId =
      modelOverride ?? getSetting("default_model") ?? FAKE_MODEL_ID;
    const fake = fakeProviderRow();
    return {
      model: fakeOpenAiModel(modelId),
      apiKey: "",
      providerName: fake.name,
      baseUrl: fake.base_url,
    };
  }
  const provider = getProvider(providerId);
  if (!provider) return null;
  const modelId = modelOverride ?? getSetting("default_model");
  if (!modelId) return null;
  return {
    model: toOpenAiModel(provider, modelId),
    apiKey: provider.api_key,
    providerName: provider.name,
    baseUrl: provider.base_url,
  };
}

export function toOpenAiModel(
  provider: ProviderRow,
  modelId: string,
): Model<"openai-completions"> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "bots",
    baseUrl: provider.base_url,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: Number(process.env.LLM_CONTEXT_WINDOW ?? 64000),
    maxTokens: Number(process.env.LLM_MAX_TOKENS ?? 4096),
  };
}

const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function errorChain(err: unknown): Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current === "string") {
      const text = current.trim();
      if (text) chain.push({ message: text });
      break;
    }
    if (typeof current !== "object") break;
    chain.push(current as Record<string, unknown>);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

function codeOf(chain: Record<string, unknown>[]): string | null {
  for (const entry of chain) {
    const code = entry.code;
    if (typeof code === "string" && code.trim())
      return code.trim().toUpperCase();
    const name = entry.name;
    if (name === "AbortError") return "ABORT_ERR";
    if (name === "TimeoutError") return "ETIMEDOUT";
  }
  return null;
}

function statusOf(chain: Record<string, unknown>[]): number | null {
  for (const entry of chain) {
    for (const key of ["status", "statusCode"]) {
      const value = entry[key];
      if (typeof value === "number" && value >= 100 && value < 600)
        return value;
    }
  }
  return null;
}

function deepestMessage(chain: Record<string, unknown>[]): string {
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const message = chain[i].message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "";
}

function classifyCode(code: string | null): string | null {
  if (!code) return null;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return "the host could not be resolved";
  if (code === "ECONNREFUSED") return "the connection was refused";
  if (code === "ETIMEDOUT" || code === "ECONNABORTED" || code === "ABORT_ERR")
    return "the connection timed out";
  if (code === "ECONNRESET" || code === "EPIPE")
    return "the connection was reset";
  if (code === "ENETUNREACH" || code === "EHOSTUNREACH" || code === "ENETDOWN")
    return "the host is unreachable";
  if (TLS_ERROR_CODES.has(code)) return `the TLS handshake failed (${code})`;
  return null;
}

function describeStatus(status: number): string {
  if (status === 401 || status === 403)
    return `HTTP ${status} — check the provider API key`;
  if (status === 429) return `HTTP ${status} — rate limited by the provider`;
  if (status === 404) return `HTTP ${status} — model or endpoint not found`;
  return `HTTP ${status}`;
}

function scrub(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-redacted")
    .replace(/(authorization\s*[:=]\s*)(?:Bearer\s+)?\S+/gi, "$1redacted")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * Turns a provider failure into a run error that says what actually went wrong:
 * the SDK's `Connection error.` is fixed text, so the real reason is read off
 * `cause` (DNS, refused, timeout, TLS) alongside the provider and base URL.
 * Never includes keys, headers or response bodies.
 */
export function describeLlmError(
  err: unknown,
  target: { providerName: string; baseUrl: string },
): string {
  const chain = errorChain(err);
  const where = `"${target.providerName}" (${target.baseUrl})`;
  const code = codeOf(chain);
  const classified = classifyCode(code);
  const cause = scrub(deepestMessage(chain));
  if (classified) {
    const detail =
      cause && cause !== "Connection error." && !cause.includes(classified)
        ? `${cause} — ${classified}`
        : classified;
    return scrub(`Unable to connect to model provider ${where}: ${detail}`);
  }
  const status = statusOf(chain);
  if (status) {
    return scrub(
      `Model provider ${where} rejected the request: ${describeStatus(status)}${
        cause && cause !== "Connection error." ? ` — ${cause}` : ""
      }`,
    );
  }
  return cause || `model provider ${where} failed without a message`;
}

/**
 * The provider SDK collapses every transport failure to this fixed text, so a
 * stored run error carrying only it says nothing about what went wrong.
 */
export function isCollapsedConnectionError(text: string | null): boolean {
  if (!text) return false;
  return /^connection error\.?$/i.test(text.trim());
}

/**
 * Re-derives why the provider is unreachable when the SDK already flattened the
 * cause: resolve the host, then open a socket to it. Returns null when the
 * provider is reachable, so callers keep whatever text they had.
 */
export async function probeProvider(
  baseUrl: string,
  timeoutMs = 3000,
): Promise<{ code: string; message: string } | null> {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
  try {
    await dnsLookup(url.hostname);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "ENOTFOUND";
    return { code, message: `getaddrinfo ${code} ${url.hostname}` };
  }
  return await new Promise((resolve) => {
    const socket = netConnect({ host: url.hostname, port });
    const finish = (value: { code: string; message: string } | null) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () =>
      finish({
        code: "ETIMEDOUT",
        message: `connect ETIMEDOUT ${url.hostname}:${port}`,
      }),
    );
    socket.once("connect", () => finish(null));
    socket.once("error", (err: NodeJS.ErrnoException) => {
      const code = err.code ?? "ECONNREFUSED";
      finish({ code, message: `connect ${code} ${url.hostname}:${port}` });
    });
  });
}

/**
 * Full run error for a provider that could not be reached, using a live probe
 * when the SDK threw away the cause.
 */
export async function describeConnectionFailure(target: {
  providerName: string;
  baseUrl: string;
}): Promise<string> {
  const probe = await probeProvider(target.baseUrl);
  if (!probe) {
    return scrub(
      `Unable to connect to model provider "${target.providerName}" (${target.baseUrl}): connection failed`,
    );
  }
  return describeLlmError(
    Object.assign(new Error(probe.message), { cause: { code: probe.code } }),
    target,
  );
}
