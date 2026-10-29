import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-test-")),
  "t.db",
);
process.env.ALLOW_REGISTRATION = "true";
process.env.TRUST_PROXY = "true";

const { createApp } = await import("../src/api.ts");
const { resetRateLimits, resolveClientIp } = await import(
  "../src/ratelimit.ts"
);

const app = createApp();
let SESSION = "";

function withSession(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      ...(SESSION ? { cookie: SESSION } : {}),
      ...(init?.headers ?? {}),
    },
  };
}

async function authed(path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, withSession(init));
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function forwardedHeaders(ip: string, extra?: HeadersInit): HeadersInit {
  return { "x-forwarded-for": ip, ...(extra ?? {}) };
}

async function authPost(path: string, body: unknown, ip: string) {
  return app.request(path, {
    method: "POST",
    headers: forwardedHeaders(ip, { "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
}

async function webhookPost(
  triggerId: string,
  body = "x",
  authorization?: string,
) {
  return app.request(`/api/webhooks/${triggerId}`, {
    method: "POST",
    headers: authorization ? { authorization } : {},
    body,
  });
}

async function makeDisabledWebhook() {
  const botRes = await authed("/api/bots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `rate-webhook-${Date.now()}` }),
  });
  const bot = (await json(botRes)).id as string;
  await authed(`/api/bots/${bot}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });

  const triggerRes = await authed(`/api/bots/${bot}/triggers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "webhook", message: "Event arrived" }),
  });
  const trigger = await json(triggerRes);
  return {
    triggerId: trigger.id as string,
    secret: trigger.secret as string,
  };
}

const signup = await authed("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "rate@example.com", password: "dev-rate-1" }),
});
SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

test("client IP defaults to the socket address", () => {
  const previous = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  try {
    assert.equal(
      resolveClientIp("203.0.113.5, 10.0.0.1", "198.51.100.7"),
      "198.51.100.7",
    );
    assert.equal(resolveClientIp(undefined, undefined), "local");
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  }
});

test("TRUST_PROXY uses the first forwarded hop", () => {
  assert.equal(
    resolveClientIp("203.0.113.5, 10.0.0.1", "198.51.100.7"),
    "203.0.113.5",
  );
});

test("failed logins are capped at ten attempts per IP", async () => {
  resetRateLimits();
  const ip = "login-cap";
  for (let i = 0; i < 10; i++) {
    const res = await authPost(
      "/api/auth/login",
      { email: "rate@example.com", password: "wrong-password" },
      ip,
    );
    assert.equal(res.status, 401);
  }

  const blocked = await authPost(
    "/api/auth/login",
    { email: "rate@example.com", password: "dev-rate-1" },
    ip,
  );
  assert.equal(blocked.status, 429);
  assert.deepEqual(await json(blocked), { error: "rate_limited" });
});

test("a successful login resets the failed-attempt window", async () => {
  resetRateLimits();
  const ip = "login-reset";
  for (let i = 0; i < 9; i++) {
    assert.equal(
      (
        await authPost(
          "/api/auth/login",
          { email: "rate@example.com", password: "wrong-password" },
          ip,
        )
      ).status,
      401,
    );
  }

  const success = await authPost(
    "/api/auth/login",
    { email: "rate@example.com", password: "dev-rate-1" },
    ip,
  );
  assert.equal(success.status, 200);

  for (let i = 0; i < 10; i++) {
    const res = await authPost(
      "/api/auth/login",
      { email: "rate@example.com", password: "wrong-password" },
      ip,
    );
    assert.equal(res.status, 401);
  }
});

test("failed signups share the credential budget", async () => {
  resetRateLimits();
  const ip = "signup-cap";
  for (let i = 0; i < 10; i++) {
    assert.equal(
      (
        await authPost(
          "/api/auth/signup",
          { email: "rate@example.com", password: "dev-rate-1" },
          ip,
        )
      ).status,
      409,
    );
  }

  assert.equal(
    (
      await authPost(
        "/api/auth/signup",
        { email: "rate@example.com", password: "dev-rate-1" },
        ip,
      )
    ).status,
    429,
  );
});

test("public auth routes cap each IP at 300 requests per minute", async () => {
  resetRateLimits();
  const ip = "auth-ceiling";
  let denied = 0;
  for (let i = 0; i < 301; i++) {
    const res = await app.request("/api/auth/config", {
      headers: { "x-forwarded-for": ip },
    });
    if (res.status === 429) denied += 1;
    else assert.equal(res.status, 200);
  }
  assert.equal(denied, 1);
});

test("webhook trigger ids are capped at thirty requests per minute", async () => {
  resetRateLimits();
  const webhook = await makeDisabledWebhook();
  for (let i = 0; i < 30; i++) {
    assert.equal(
      (await webhookPost(webhook.triggerId, "x", `Bearer ${webhook.secret}`))
        .status,
      409,
    );
  }

  const blocked = await webhookPost(
    webhook.triggerId,
    "x",
    `Bearer ${webhook.secret}`,
  );
  assert.equal(blocked.status, 429);
});

test("all webhook traffic is capped at sixty requests per minute", async () => {
  resetRateLimits();
  for (let i = 0; i < 60; i++) {
    const triggerId = `global-${i % 31}`;
    assert.equal((await webhookPost(triggerId)).status, 404);
  }

  assert.equal((await webhookPost("global-fresh")).status, 429);
});

test("oversized webhook payloads fail with 413 before rate limiting", async () => {
  resetRateLimits();
  for (let i = 0; i < 30; i++) {
    assert.equal((await webhookPost("oversized")).status, 404);
  }

  assert.equal((await webhookPost("oversized")).status, 429);
  assert.equal(
    (await webhookPost("oversized", "x".repeat(64 * 1024 + 1))).status,
    413,
  );
});
