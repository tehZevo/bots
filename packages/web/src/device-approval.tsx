import { useCallback, useEffect, useState } from "react";

interface PendingGrant {
  client_name: string;
  key_name: string | null;
  expires_at: number;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function DeviceApproval() {
  const params = new URLSearchParams(
    typeof location === "undefined" ? "" : location.search,
  );
  const initial = params.get("user_code") ?? "";
  const [code, setCode] = useState(initial);
  const [pending, setPending] = useState<PendingGrant | null>(null);
  const [state, setState] = useState<
    "input" | "loading" | "missing" | "ready" | "approved" | "denied"
  >(initial ? "loading" : "input");
  const [keyName, setKeyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lookup = useCallback(async (raw: string) => {
    const norm = normalizeCode(raw);
    if (norm.length !== 8) {
      setState("missing");
      setPending(null);
      return;
    }
    setState("loading");
    try {
      const res = await fetch(
        `/api/auth/device/pending?user_code=${encodeURIComponent(norm)}`,
      );
      if (!res.ok) {
        setState("missing");
        setPending(null);
        return;
      }
      setPending((await res.json()) as PendingGrant);
      setState("ready");
    } catch {
      setState("missing");
    }
  }, []);

  useEffect(() => {
    if (initial) void lookup(initial);
  }, [initial, lookup]);

  const decide = async (decision: "approve" | "deny") => {
    if (!pending || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/device/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_code: code,
          decision,
          ...(decision === "approve" && keyName.trim()
            ? { key_name: keyName.trim() }
            : {}),
        }),
      });
      if (res.ok) setState(decision === "approve" ? "approved" : "denied");
      else {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setErr(data?.error ?? `${res.status}`);
        setBusy(false);
      }
    } catch {
      setErr("request failed");
      setBusy(false);
    }
  };

  const client = pending?.client_name || "an unknown client";
  const defaultKeyName =
    `bots-cli ${pending?.client_name ?? ""} ${new Date().toISOString().slice(0, 10)}`
      .replace(/\s+/g, " ")
      .trim();

  if (state === "approved" || state === "denied") {
    return (
      <div className="authscreen">
        <div className="dialog narrow">
          <div className="viewhead">
            <h2>{state === "approved" ? "Approved" : "Denied"}</h2>
          </div>
          <p>
            {state === "approved"
              ? "The key was issued. You can go back to your terminal."
              : "Access was denied. You can close this page."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="authscreen">
      <form
        className="dialog narrow"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(code);
        }}
      >
        <div className="viewhead">
          <h2>CLI sign-in</h2>
        </div>
        {(state === "input" || state === "loading" || !pending) && (
          <label className="field">
            Code
            <input
              value={code}
              placeholder="XXXX-XXXX"
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        )}
        {state === "missing" && (
          <p className="error">That code is unknown, expired or used.</p>
        )}
        {state === "ready" && pending && (
          <>
            <p>
              <strong>{client}</strong> wants API access to this server.
            </p>
            <label className="field">
              Key name
              <input
                value={keyName}
                placeholder={defaultKeyName}
                onChange={(e) => setKeyName(e.target.value)}
              />
            </label>
            <p className="mutedline">
              Expires{" "}
              {new Date(pending.expires_at).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
              . The key is delivered to the terminal, never shown here.
            </p>
          </>
        )}
        {err && <p className="error">{err}</p>}
        <div className="actions">
          {state === "ready" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide("approve")}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide("deny")}
              >
                Deny
              </button>
            </>
          ) : (
            <button type="submit" disabled={!normalizeCode(code)}>
              Continue
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
