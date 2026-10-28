import { useEffect, useState } from "react";

export const PUSH_STATE_EVENT = "bots-push-state";

const PROMPTED_KEY = "bots-push-prompted";

type PushStatus =
  | "unsupported"
  | "checking"
  | "subscribed"
  | "off"
  | "blocked"
  | "error";

interface PushState {
  status: PushStatus;
  subscribed: boolean;
  error?: string;
}

const LABELS: Record<PushStatus, string> = {
  unsupported: "Unsupported",
  checking: "…",
  subscribed: "Subscribed",
  off: "Off",
  blocked: "Blocked in browser settings",
  error: "Push unavailable",
};

let current: PushState = { status: "checking", subscribed: false };
let ensurePromise: Promise<PushState> | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.isSecureContext ?? true) &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function notificationPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "default";
  return Notification.permission;
}

export function urlBase64ToBuffer(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

function bufferToBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `${res.status}`);
  return body as T;
}

function publish(state: PushState): PushState {
  current = state;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PUSH_STATE_EVENT, { detail: state }));
  }
  return state;
}

export function resetPushStateForTests(): void {
  current = { status: "checking", subscribed: false };
  ensurePromise = null;
}

async function waitForRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const timeout = delay(4_000).then(() => null);
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } catch {
    return null;
  }
}

function subscriptionKey(subscription: PushSubscription): string | null {
  const raw = subscription.options?.applicationServerKey;
  if (!raw) return null;
  return bufferToBase64Url(raw as ArrayBuffer);
}

async function removeSubscription(endpoint: string): Promise<void> {
  try {
    await req("/api/push/subscription", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch (error) {
    if (!errorMessage(error).includes("404")) throw error;
  }
}

async function persistSubscription(
  subscription: PushSubscription,
): Promise<PushState> {
  const json = subscription.toJSON();
  await req("/api/push/subscription", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    }),
  });
  return publish({
    status: notificationPermission() === "denied" ? "blocked" : "subscribed",
    subscribed: true,
  });
}

function isTransientPushError(message: string): boolean {
  return /push service|network|timeout|abort/i.test(message);
}

async function attemptSubscribe(
  registration: ServiceWorkerRegistration,
  key: string,
): Promise<PushSubscription> {
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(key),
    });
  } catch (error) {
    if (
      notificationPermission() === "denied" ||
      !isTransientPushError(errorMessage(error))
    ) {
      throw error;
    }
    await delay(400);
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(key),
    });
  }
}

async function runEnsurePushSubscription(): Promise<PushState> {
  if (current.status !== "subscribed") {
    publish({ status: "checking", subscribed: false });
  }
  const registration = await waitForRegistration();
  if (!registration) {
    return publish({
      status: "off",
      subscribed: false,
      error: "Service worker unavailable",
    });
  }

  let existing: PushSubscription | null = null;
  try {
    existing = await registration.pushManager.getSubscription();
  } catch {
    existing = null;
  }

  if (existing) {
    const keyResponse = await req<{ key: string }>("/api/push/key").catch(
      () => null,
    );
    if (!keyResponse || subscriptionKey(existing) === keyResponse.key) {
      try {
        return await persistSubscription(existing);
      } catch (error) {
        return publish({
          status: notificationPermission() === "denied" ? "blocked" : "error",
          subscribed: true,
          error: errorMessage(error),
        });
      }
    }

    const perm = notificationPermission();
    if (
      perm !== "denied" &&
      !(perm === "default" && localStorage.getItem(PROMPTED_KEY))
    ) {
      try {
        await removeSubscription(existing.endpoint);
      } catch {}
      try {
        await existing.unsubscribe();
      } catch {}
      existing = null;
    } else {
      return publish({
        status: perm === "denied" ? "blocked" : "off",
        subscribed: true,
      });
    }
  }

  const permissionBefore = notificationPermission();
  if (permissionBefore === "denied") {
    localStorage.setItem(PROMPTED_KEY, "1");
    return publish({ status: "blocked", subscribed: false });
  }
  if (permissionBefore === "default" && localStorage.getItem(PROMPTED_KEY)) {
    return publish({ status: "off", subscribed: false });
  }

  const { key } = await req<{ key: string }>("/api/push/key");
  let subscription: PushSubscription;
  try {
    subscription = await attemptSubscribe(registration, key);
  } catch (error) {
    const deniedAfterPrompt = notificationPermission() === "denied";
    if (deniedAfterPrompt) localStorage.setItem(PROMPTED_KEY, "1");
    return publish({
      status: deniedAfterPrompt ? "blocked" : "error",
      subscribed: false,
      error: errorMessage(error),
    });
  }

  localStorage.setItem(PROMPTED_KEY, "1");
  try {
    return await persistSubscription(subscription);
  } catch (error) {
    return publish({
      status: "error",
      subscribed: true,
      error: errorMessage(error),
    });
  }
}

export async function ensurePushSubscription(): Promise<PushState> {
  if (!pushSupported()) {
    return publish({ status: "unsupported", subscribed: false });
  }
  if (ensurePromise) return ensurePromise;
  ensurePromise = runEnsurePushSubscription()
    .catch((error) =>
      publish({
        status: "error",
        subscribed: false,
        error: errorMessage(error),
      }),
    )
    .finally(() => {
      ensurePromise = null;
    });
  return ensurePromise;
}

export async function unsubscribePush(): Promise<PushState> {
  try {
    const registration = await waitForRegistration();
    const subscription = registration
      ? await registration.pushManager.getSubscription()
      : null;
    if (subscription) {
      await removeSubscription(subscription.endpoint);
      await subscription.unsubscribe();
    }
    localStorage.setItem(PROMPTED_KEY, "1");
    return publish({
      status: notificationPermission() === "denied" ? "blocked" : "off",
      subscribed: false,
    });
  } catch (error) {
    return publish({
      status: "error",
      subscribed: true,
      error: errorMessage(error),
    });
  }
}

export function PushSection() {
  const [state, setState] = useState<PushState>(current);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onState = (event: Event) => {
      setState((event as CustomEvent<PushState>).detail);
    };
    window.addEventListener(PUSH_STATE_EVENT, onState);
    void ensurePushSubscription()
      .then(setState)
      .catch(() => undefined);
    return () => {
      window.removeEventListener(PUSH_STATE_EVENT, onState);
    };
  }, []);

  if (state.status === "unsupported") return null;

  return (
    <>
      <p className="muted">Browser push</p>
      <div className="actions">
        <button
          type="button"
          disabled={!state.subscribed || state.status === "checking"}
          onClick={() => void unsubscribePush()}
        >
          Unsubscribe
        </button>
        <span className="state">{state.error ?? LABELS[state.status]}</span>
      </div>
    </>
  );
}
