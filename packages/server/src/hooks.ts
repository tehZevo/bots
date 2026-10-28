import { createHmac, randomUUID } from "node:crypto";
import {
  type AppEvent,
  type HookDestinationRow,
  insertHookDelivery,
  isPaused,
  listHookDestinations,
  setOnAppEvent,
} from "./db.ts";

export const HOOK_EVENT_TYPES = [
  "run.finished",
  "bot.blocked",
  "bot.recovered",
  "notification.created",
  "breaker.tripped",
] as const;

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 4;

let transport: typeof fetch | null = null;
let sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function setHookTransport(f: typeof fetch | null): void {
  transport = f;
}

export function setHookSleep(fn: ((ms: number) => Promise<void>) | null): void {
  sleep =
    fn ?? (async (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}

interface DeliveryResult {
  ok: boolean;
  status: number | null;
  duration_ms: number;
  error: string | null;
}

function signBody(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function eventBody(event: AppEvent): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    occurred_at: event.occurred_at,
    data: event.data,
  });
}

async function postHook(
  destination: HookDestinationRow,
  body: string,
): Promise<DeliveryResult> {
  const startedAt = Date.now();
  try {
    const response = await (transport ?? fetch)(destination.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bots-signature": signBody(destination.secret, body),
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    const duration = Math.max(0, Date.now() - startedAt);
    return {
      ok: response.ok,
      status: response.status,
      duration_ms: duration,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      duration_ms: Math.max(0, Date.now() - startedAt),
      error: error instanceof Error ? error.message : "delivery failed",
    };
  }
}

function retryable(status: number | null): boolean {
  return (
    status === null || status === 429 || (status !== null && status >= 500)
  );
}

export function backoffDelay(attempt: number): number {
  const base = 1000 * 2 ** Math.max(0, attempt - 1);
  return Math.round(base + Math.random() * (base / 2));
}

async function deliverEvent(
  destination: HookDestinationRow,
  event: AppEvent,
): Promise<void> {
  if (!destination.enabled) return;
  if (!destination.event_types.includes(event.type)) return;

  const body = eventBody(event);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await postHook(destination, body);
    insertHookDelivery({
      destination_id: destination.id,
      event_type: event.type,
      status: result.ok ? "ok" : "error",
      http_status: result.status,
      duration_ms: result.duration_ms,
      attempt,
      error: result.error,
    });
    if (result.ok || !retryable(result.status) || attempt === MAX_ATTEMPTS)
      return;
    await sleep(backoffDelay(attempt));
  }
}

export function dispatchAppEvent(event: AppEvent): void {
  try {
    if (isPaused() && event.type !== "breaker.tripped") return;
    for (const destination of listHookDestinations()) {
      void deliverEvent(destination, event).catch(() => undefined);
    }
  } catch (error) {
    console.error("event destinations: dispatch failed:", error);
  }
}

export function attachHookEvents(): void {
  setOnAppEvent(dispatchAppEvent);
}

export async function sendHookTest(
  destination: HookDestinationRow,
): Promise<DeliveryResult> {
  const event: AppEvent = {
    id: randomUUID(),
    type: "ping",
    occurred_at: Date.now(),
    data: {},
  };
  const result = await postHook(destination, eventBody(event));
  insertHookDelivery({
    destination_id: destination.id,
    event_type: event.type,
    status: result.ok ? "ok" : "error",
    http_status: result.status,
    duration_ms: result.duration_ms,
    attempt: 1,
    error: result.error,
  });
  return result;
}
