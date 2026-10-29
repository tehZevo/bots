type Bucket = { start: number; count: number; windowMs: number };

const windows = new Map<string, Bucket>();

function sweep(now: number): void {
  if (windows.size <= 10_000) return;
  for (const [bucket, state] of windows) {
    if (now - state.start > state.windowMs) windows.delete(bucket);
  }
}

export function isRateLimitReached(
  name: string,
  key: string,
  max: number,
  _windowMs = 60_000,
): boolean {
  const now = Date.now();
  sweep(now);
  const state = windows.get(`${name}:${key}`);
  if (!state || now - state.start > state.windowMs) return false;
  return state.count >= max;
}

export function consumeRate(
  name: string,
  key: string,
  max: number,
  windowMs = 60_000,
): boolean {
  const bucket = `${name}:${key}`;
  const now = Date.now();
  sweep(now);

  const state = windows.get(bucket);
  if (!state || now - state.start > state.windowMs) {
    windows.set(bucket, { start: now, count: 1, windowMs });
    return false;
  }

  state.count += 1;
  return state.count > max;
}

export function resetRate(name: string, key: string): void {
  windows.delete(`${name}:${key}`);
}

export function resetRateLimits(): void {
  windows.clear();
}

export function resolveClientIp(
  forwardedFor: string | undefined,
  socketAddress: string | undefined,
): string {
  if (process.env.TRUST_PROXY === "true") {
    const firstHop = forwardedFor?.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }
  return socketAddress ?? "local";
}
