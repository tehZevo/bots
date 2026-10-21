import { useEffect, useState } from "react";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function urlBase64ToBuffer(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `${res.status}`);
  return body as T;
}

export function PushSection() {
  const [state, setState] = useState<"checking" | "subscribed" | "off">(
    "checking",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pushSupported()) return;
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : "off"))
      .catch(() => setState("off"));
  }, []);

  const subscribe = async () => {
    setBusy(true);
    setError("");
    try {
      const { key } = await req<{ key: string }>("/api/push/key");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(key),
      });
      const json = sub.toJSON();
      await req("/api/push/subscription", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        }),
      });
      setState("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await req("/api/push/subscription", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!pushSupported()) return null;
  return (
    <>
      <p className="muted">Browser push</p>
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => void subscribe()}>
          Subscribe
        </button>
        <button
          type="button"
          disabled={busy || state !== "subscribed"}
          onClick={() => void unsubscribe()}
        >
          Unsubscribe
        </button>
        <span className="state">
          {error ||
            (state === "checking"
              ? "…"
              : state === "subscribed"
                ? "Subscribed"
                : "Off")}
        </span>
      </div>
    </>
  );
}
