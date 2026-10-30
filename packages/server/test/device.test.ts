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

const { createApp, normalizeUserCode } = await import("../src/api.ts");
const { clearDeviceGrants } = await import("../src/db.ts");
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

async function newCode(clientName = "workstation"): Promise<{
  device_code: string;
  user_code: string;
}> {
  const res = await post("/api/auth/device/code", { client_name: clientName });
  assert.equal(res.status, 200);
  return (await res.json()) as { device_code: string; user_code: string };
}

let session = "";

test("device code route is public and well-formed", async () => {
  const res = await post("/api/auth/device/code", { client_name: "desk" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.match(String(body.device_code), /^[0-9a-f]{64}$/);
  assert.match(
    String(body.user_code),
    /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/,
  );
  assert.equal(body.verification_uri, "http://localhost/device");
  assert.equal(
    body.verification_uri_complete,
    `http://localhost/device?user_code=${body.user_code}`,
  );
  assert.equal(body.expires_in, 600);
  assert.equal(body.interval, 5);

  const cookie = cookieOf(
    await post("/api/auth/signup", {
      email: "cli@example.com",
      password: "longenough1",
    }),
  );
  session = cookie;
});

test("pending lookup needs a session and resolves live codes case-insensitively", async () => {
  const { user_code } = await newCode("desk");
  assert.equal(
    (await app.request(`/api/auth/device/pending?user_code=${user_code}`))
      .status,
    401,
  );
  const res = await app.request(
    `/api/auth/device/pending?user_code=${user_code.toLowerCase().replace("-", " ")}`,
    { headers: { cookie: session } },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.client_name, "desk");
  assert.equal(body.key_name, null);

  const missing = await app.request(
    "/api/auth/device/pending?user_code=QQQQ-QQQQ",
    { headers: { cookie: session } },
  );
  assert.equal(missing.status, 404);
});

test("full approval flow delivers the key exactly once", async () => {
  const { device_code, user_code } = await newCode("laptop");

  const pendingPoll = await post("/api/auth/device/token", { device_code });
  assert.equal(pendingPoll.status, 400);
  assert.equal(
    ((await pendingPoll.json()) as { error: string }).error,
    "authorization_pending",
  );
  const earlyPoll = await post("/api/auth/device/token", { device_code });
  assert.equal(
    ((await earlyPoll.json()) as { error: string }).error,
    "slow_down",
  );

  const keysBefore = (
    await (
      await app.request("/api/api-keys", { headers: { cookie: session } })
    ).json()
  ).length;

  const approve = await post(
    "/api/auth/device/approve",
    { user_code, decision: "approve" },
    session,
  );
  assert.equal(approve.status, 200);

  // consumed for the approval page, but claimable by the device once
  const pendingAgain = await app.request(
    `/api/auth/device/pending?user_code=${user_code}`,
    { headers: { cookie: session } },
  );
  assert.equal(pendingAgain.status, 404);

  const claim = await post("/api/auth/device/token", { device_code });
  assert.equal(claim.status, 200);
  const body = (await claim.json()) as Record<string, string>;
  assert.match(body.api_key, /^bots_[0-9a-f]{40}$/);
  assert.ok(body.key_id);
  assert.match(body.key_name, /^bots-cli laptop \d{4}-\d{2}-\d{2}$/);
  assert.equal(body.email, "cli@example.com");

  const again = await post("/api/auth/device/token", { device_code });
  assert.equal(again.status, 400);
  assert.equal(
    ((await again.json()) as { error: string }).error,
    "access_denied",
  );

  const keys = (await (
    await app.request("/api/api-keys", { headers: { cookie: session } })
  ).json()) as { id: string; name: string }[];
  assert.equal(keys.length, keysBefore + 1);
  assert.ok(keys.some((k) => k.id === body.key_id));

  const me = await app.request("/api/auth/me", {
    headers: { authorization: `Bearer ${body.api_key}` },
  });
  assert.equal(me.status, 200);
  const meBody = (await me.json()) as Record<string, string>;
  assert.equal(meBody.email, "cli@example.com");
  assert.equal(meBody.key_id, body.key_id);

  const cookieMe = await app.request("/api/auth/me", {
    headers: { cookie: session },
  });
  assert.equal(
    ((await cookieMe.json()) as Record<string, unknown>).key_id,
    undefined,
  );
});

test("custom key names are honored; denial mints nothing", async () => {
  const { device_code, user_code } = await newCode("desk");
  const approve = await post(
    "/api/auth/device/approve",
    { user_code, decision: "approve", key_name: "  my laptop key  " },
    session,
  );
  assert.equal(approve.status, 200);
  const body = (await (
    await post("/api/auth/device/token", { device_code })
  ).json()) as {
    key_name: string;
  };
  assert.equal(body.key_name, "my laptop key");

  const keysBefore = (
    await (
      await app.request("/api/api-keys", { headers: { cookie: session } })
    ).json()
  ).length;
  const denied = await newCode("stranger");
  const deny = await post(
    "/api/auth/device/approve",
    { user_code: denied.user_code, decision: "deny" },
    session,
  );
  assert.equal(deny.status, 200);
  const poll = await post("/api/auth/device/token", {
    device_code: denied.device_code,
  });
  assert.equal(poll.status, 400);
  assert.equal(
    ((await poll.json()) as { error: string }).error,
    "access_denied",
  );
  const keysAfter = (
    await (
      await app.request("/api/api-keys", { headers: { cookie: session } })
    ).json()
  ).length;
  assert.equal(keysAfter, keysBefore);
});

test("expired grants stop resolving and end the poll with expired_token", async () => {
  const { device_code, user_code } = await newCode("desk");
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60_000;
  try {
    assert.equal(
      (
        await app.request(`/api/auth/device/pending?user_code=${user_code}`, {
          headers: { cookie: session },
        })
      ).status,
      404,
    );
    const poll = await post("/api/auth/device/token", { device_code });
    assert.equal(poll.status, 400);
    assert.equal(
      ((await poll.json()) as { error: string }).error,
      "expired_token",
    );
  } finally {
    Date.now = realNow;
  }
});

test("unknown device codes and restart wipes end polls with access_denied", async () => {
  const { device_code } = await newCode("desk");
  assert.equal(
    (
      (await (
        await post("/api/auth/device/token", { device_code: "f".repeat(64) })
      ).json()) as { error: string }
    ).error,
    "access_denied",
  );
  clearDeviceGrants();
  assert.equal(
    (
      (await (
        await post("/api/auth/device/token", { device_code })
      ).json()) as {
        error: string;
      }
    ).error,
    "access_denied",
  );
});

test("approve rejects missing decisions and malformed codes", async () => {
  const bad = await post(
    "/api/auth/device/approve",
    { user_code: "XXXX-XXXX", decision: "maybe" },
    session,
  );
  assert.equal(bad.status, 400);
  const shortCode = await post(
    "/api/auth/device/approve",
    { user_code: "AB", decision: "deny" },
    session,
  );
  assert.equal(shortCode.status, 404);
});

test("normalizeUserCode ignores case, spaces and hyphens", () => {
  assert.equal(normalizeUserCode(" ab-cd ef12 "), "ABCDEF12");
  assert.equal(normalizeUserCode("a1b2c3d4"), "A1B2C3D4");
});
