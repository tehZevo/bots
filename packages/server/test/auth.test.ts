import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-test-")),
  "t.db",
);
delete process.env.ALLOW_REGISTRATION;

const { createApp, SESSION_COOKIE } = await import("../src/api.ts");
const app = createApp();

function cookieOf(res: Response): string {
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function post(
  path: string,
  body: Record<string, unknown>,
  cookie?: string,
): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("protected routes require auth; health and webhooks stay open", async () => {
  assert.equal((await app.request("/api/bots")).status, 401);
  assert.equal(
    (await app.request("/api/webhooks/nope", { method: "POST" })).status,
    404,
  );
  assert.equal((await app.request("/api/health")).status, 200);
});

test("signup is gated by ALLOW_REGISTRATION", async () => {
  const blocked = await post("/api/auth/signup", {
    email: "a@example.com",
    password: "longenough1",
  });
  assert.equal(blocked.status, 403);

  process.env.ALLOW_REGISTRATION = "true";
  const weak = await post("/api/auth/signup", {
    email: "a@example.com",
    password: "short",
  });
  assert.equal(weak.status, 400);

  const ok = await post("/api/auth/signup", {
    email: "a@example.com",
    password: "longenough1",
  });
  assert.equal(ok.status, 201);
  const rawCookie = ok.headers.get("set-cookie") ?? "";
  assert.ok(rawCookie.startsWith(`${SESSION_COOKIE}=`));
  assert.match(rawCookie, /HttpOnly/i);
  assert.match(rawCookie, /SameSite=Lax/i);
  assert.match(rawCookie, /Secure/i);

  const dupe = await post("/api/auth/signup", {
    email: "A@Example.com",
    password: "longenough1",
  });
  assert.equal(dupe.status, 409);
});

test("login verifies credentials and issues a session", async () => {
  const bad = await post("/api/auth/login", {
    email: "a@example.com",
    password: "wrong-password",
  });
  assert.equal(bad.status, 401);

  const ok = await post("/api/auth/login", {
    email: "a@example.com",
    password: "longenough1",
  });
  assert.equal(ok.status, 200);
  const cookie = cookieOf(ok);
  const me = await app.request("/api/auth/me", {
    headers: { cookie },
  });
  assert.deepEqual((await me.json()) as unknown, { email: "a@example.com" });

  const afterLogout = await post("/api/auth/logout", {}, cookie);
  assert.equal(afterLogout.status, 200);
  assert.equal(
    (await app.request("/api/auth/me", { headers: { cookie } })).status,
    401,
  );
});

test("password change verifies current and evicts other sessions", async () => {
  const s1 = cookieOf(
    await post("/api/auth/login", {
      email: "a@example.com",
      password: "longenough1",
    }),
  );
  const s2 = cookieOf(
    await post("/api/auth/login", {
      email: "a@example.com",
      password: "longenough1",
    }),
  );

  const wrongCurrent = await post(
    "/api/auth/password",
    { current: "nope-nope-nope", new: "brand-new-2" },
    s1,
  );
  assert.equal(wrongCurrent.status, 403);

  const changed = await post(
    "/api/auth/password",
    { current: "longenough1", new: "brand-new-2" },
    s1,
  );
  assert.equal(changed.status, 200);
  assert.equal(
    (await app.request("/api/auth/me", { headers: { cookie: s1 } })).status,
    200,
  );
  assert.equal(
    (await app.request("/api/auth/me", { headers: { cookie: s2 } })).status,
    401,
  );

  const oldPw = await post("/api/auth/login", {
    email: "a@example.com",
    password: "longenough1",
  });
  assert.equal(oldPw.status, 401);
});

test("api keys are per-user and authenticate like sessions", async () => {
  process.env.ALLOW_REGISTRATION = "true";
  const bob = cookieOf(
    await post("/api/auth/signup", {
      email: "bob@example.com",
      password: "bobs-password",
    }),
  );

  const created = await post("/api/api-keys", { name: "ci" }, bob);
  assert.equal(created.status, 201);
  const value = ((await created.json()) as { value: string }).value;
  assert.match(value, /^bots_[0-9a-f]{40}$/);

  const viaKey = await app.request("/api/bots", {
    headers: { authorization: `Bearer ${value}` },
  });
  assert.equal(viaKey.status, 200);

  const badKey = await app.request("/api/bots", {
    headers: { authorization: "Bearer bots_deadbeef" },
  });
  assert.equal(badKey.status, 401);

  // bob sees his key; alice (a@example.com) does not see it in her list.
  const alice = cookieOf(
    await post("/api/auth/login", {
      email: "a@example.com",
      password: "brand-new-2",
    }),
  );
  const bobKeys = (await (
    await app.request("/api/api-keys", { headers: { cookie: bob } })
  ).json()) as { id: string; name: string }[];
  const aliceKeys = (await (
    await app.request("/api/api-keys", { headers: { cookie: alice } })
  ).json()) as { id: string; name: string }[];
  assert.equal(bobKeys.filter((k) => k.name === "ci").length, 1);
  assert.equal(aliceKeys.filter((k) => k.name === "ci").length, 0);

  const id = bobKeys.find((k) => k.name === "ci")?.id as string;
  const aliceDeletes = await app.request(`/api/api-keys/${id}`, {
    method: "DELETE",
    headers: { cookie: alice },
  });
  assert.equal(aliceDeletes.status, 404);
});

test("cookie state changes require same-origin or JSON content-type", async () => {
  const cookie = cookieOf(
    await post("/api/auth/login", {
      email: "bob@example.com",
      password: "bobs-password",
    }),
  );
  const crossOrigin = await app.request("/api/bots", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://evil.example",
      cookie,
    },
    body: JSON.stringify({ name: "csrf-bot" }),
  });
  assert.equal(crossOrigin.status, 403);

  const formPost = await app.request("/api/bots", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
    },
    body: "name=csrf-bot",
  });
  assert.equal(formPost.status, 415);
});
