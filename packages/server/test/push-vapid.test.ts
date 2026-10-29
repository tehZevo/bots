import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dir = mkdtempSync(join(tmpdir(), "bots-vapid-"));
process.env.DATA_DIR = dir;
process.env.DATABASE_PATH = join(dir, "t.db");
process.env.ALLOW_REGISTRATION = "true";
writeFileSync(
  join(dir, "vapid.json"),
  JSON.stringify({
    publicKey: "AAAA",
    privateKey: {
      kty: "EC",
      crv: "P-256",
      x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      y: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      d: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    },
  }),
);

const { createApp } = await import("../src/api.ts");
const db = await import("../src/db.ts");
const { dispatchNewNotification, setPushTransport } = await import(
  "../src/push.ts"
);

const app = createApp();

test("corrupt VAPID state regenerates one valid pair", async () => {
  const signup = await app.request("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "vapid@example.com",
      password: "vapid-pass-1",
    }),
  });
  assert.equal(signup.status, 201);
  const session = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

  const [firstResponse, secondResponse] = await Promise.all([
    app.request("/api/push/key", { headers: { cookie: session } }),
    app.request("/api/push/key", { headers: { cookie: session } }),
  ]);
  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  const first = (await firstResponse.json()) as { key: string };
  const second = (await secondResponse.json()) as { key: string };
  assert.match(first.key, /^[\w-]+$/);
  assert.equal(first.key, second.key);

  const raw = Buffer.from(first.key, "base64url");
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 0x04);
  const stored = JSON.parse(readFileSync(join(dir, "vapid.json"), "utf8")) as {
    publicKey: string;
  };
  assert.equal(stored.publicKey, first.key);

  const calls: { url: string; headers?: HeadersInit }[] = [];
  setPushTransport((async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: init?.headers });
    return new Response(null, { status: 201 });
  }) as typeof fetch);

  db.upsertPushSubscription({
    id: "sub-vapid",
    user_id: null,
    endpoint: "https://push.example.com/s/vapid",
    p256dh: "BNzip",
    auth: "bXlhdA",
  });
  db.createNotification({ kind: "test", title: "t", body: "b" });
  const notification = db.listNotifications()[0];
  assert.ok(notification);
  await dispatchNewNotification(notification);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://push.example.com/s/vapid");
  const headers = calls[0].headers as Record<string, string>;
  const match = headers.authorization.match(
    /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/,
  );
  assert.ok(match);
  const [, token, publicKey] = match;
  const [header, payload, signature] = token.split(".");
  const publicRaw = Buffer.from(publicKey, "base64url");
  assert.equal(publicRaw.length, 65);
  assert.equal(publicRaw[0], 0x04);

  const verifyKey = await crypto.subtle.importKey(
    "raw",
    publicRaw,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  assert.ok(
    await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      new Uint8Array(Buffer.from(signature, "base64url")),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  );

  setPushTransport(null);
});
