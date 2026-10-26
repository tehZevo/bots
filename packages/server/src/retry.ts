// specs/llm/retry-backoff.md — server-wide retry policy for model requests.

// Server-wide policy; not user-configurable (`specs/llm/retry-backoff.md`).
export const retryPolicy = { maxRetries: 3, baseMs: 1000 };
const MAX_RETRY_AFTER_S = 60;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// Retry-After on a 429 sets the wait when present, capped at 60 s.
// Malformed values fall back to the computed delay.
export function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (raw === null) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) {
    return Math.min(secs, MAX_RETRY_AFTER_S) * 1000;
  }
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) {
    const delta = (date - Date.now()) / 1000;
    if (delta >= 0) return Math.min(delta, MAX_RETRY_AFTER_S) * 1000;
  }
  return null;
}

export function computedDelayMs(attempt: number): number {
  const base = retryPolicy.baseMs * 2 ** attempt;
  return base + Math.floor(Math.random() * base * 0.25);
}

function abortError(): Error {
  return Object.assign(new Error("The operation was aborted"), {
    name: "AbortError",
  });
}

async function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function retryFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    let res: Response | undefined;
    let thrown: unknown;
    try {
      res = await globalThis.fetch(input as RequestInfo | URL, init);
    } catch (err) {
      if (init?.signal?.aborted) throw err;
      thrown = err;
    }
    if (res && !isRetryableStatus(res.status)) return res;
    if (attempt >= retryPolicy.maxRetries) {
      if (!res && thrown !== undefined) throw thrown;
      return res as Response;
    }
    let headerWait: number | null = null;
    if (res?.status === 429) headerWait = retryAfterMs(res);
    await sleep(headerWait ?? computedDelayMs(attempt), init?.signal);
    attempt++;
  }
}
