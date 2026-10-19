import { type ReactNode, useCallback, useEffect, useState } from "react";

async function postJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  return { ok: false, error: data?.error ?? `${res.status}` };
}

export function AuthScreen({ onDone }: { onDone: () => void }) {
  const [config, setConfig] = useState({
    allow_registration: false,
    has_users: true,
  });
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/config")
      .then((r) => r.json())
      .then((c: { allow_registration: boolean; has_users: boolean }) => {
        setConfig(c);
        if (!c.has_users && c.allow_registration) setMode("signup");
      })
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    const path = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
    const res = await postJson(path, { email, password });
    if (res.ok) onDone();
    else {
      setErr(res.error ?? "failed");
      setBusy(false);
    }
  };

  return (
    <div className="authscreen">
      <form className="dialog narrow" onSubmit={(e) => void submit(e)}>
        <div className="viewhead">
          <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
        </div>
        <label className="field">
          Email
          <input
            type="email"
            value={email}
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            value={password}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {err && <p className="error">{err}</p>}
        <div className="actions">
          <button type="submit" disabled={busy || !email || !password}>
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
          {config.allow_registration && mode === "login" && (
            <button type="button" onClick={() => setMode("signup")}>
              Sign up
            </button>
          )}
          {mode === "signup" && config.has_users && (
            <button type="button" onClick={() => setMode("login")}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "out" | "in">("loading");

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      setState(res.ok ? "in" : "out");
    } catch {
      setState("out");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (state === "loading") return null;
  if (state === "out")
    return <AuthScreen onDone={() => window.location.reload()} />;
  return <>{children}</>;
}

export function AccountSection() {
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { email?: string } | null) => setEmail(m?.email ?? ""))
      .catch(() => undefined);
  }, []);

  const changePassword = async () => {
    setBusy(true);
    setMsg(null);
    const res = await postJson("/api/auth/password", { current, new: next });
    setBusy(false);
    if (res.ok) {
      setCurrent("");
      setNext("");
      setMsg("Password changed.");
    } else setMsg(res.error ?? "failed");
  };

  const logout = async () => {
    await postJson("/api/auth/logout", {});
    window.location.reload();
  };

  return (
    <section className="account">
      <p className="muted">Account — {email}</p>
      <label className="field">
        Current password
        <input
          type="password"
          value={current}
          autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label className="field">
        New password
        <input
          type="password"
          value={next}
          autoComplete="new-password"
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={busy || !current || next.length < 8}
          onClick={() => void changePassword()}
        >
          Change password
        </button>
        <button type="button" onClick={() => void logout()}>
          Logout
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}
