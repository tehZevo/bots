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

const db = await import("../src/db.ts");
const { createApp, SESSION_COOKIE } = await import("../src/api.ts");
const { DEV_SEED_EMAIL, DEV_SEED_KEY_NAME, seedDevCredentials } = await import(
  "../src/dev-auth.ts"
);
const app = createApp();

function cookieOf(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  assert.ok(raw.startsWith(`${SESSION_COOKIE}=`));
  return raw.split(";")[0];
}

async function post(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("DEV_SEED_AUTH idempotently seeds a normal dev account and key", async () => {
  process.env.DEV_SEED_AUTH = "1";

  const first = seedDevCredentials();
  const apiKey = first?.apiKey;
  assert.equal(first?.userCreated, true);
  assert.ok(apiKey);
  assert.match(apiKey, /^bots_[0-9a-f]{40}$/);

  const user = db.getUserByEmail(DEV_SEED_EMAIL);
  assert.ok(user);
  assert.ok(db.verifyPassword("devpassword", user.password_hash));

  const keysBefore = db.listAllApiKeys();
  assert.equal(keysBefore.length, 1);
  const seededKey = keysBefore[0];
  assert.equal(seededKey?.name, DEV_SEED_KEY_NAME);
  assert.equal(seededKey?.user_id, user.id);

  const login = await post("/api/auth/login", {
    email: DEV_SEED_EMAIL,
    password: "devpassword",
  });
  assert.equal(login.status, 200);
  const session = cookieOf(login);
  const me = await app.request("/api/auth/me", {
    headers: { cookie: session },
  });
  assert.deepEqual((await me.json()) as unknown, { email: DEV_SEED_EMAIL });

  const viaKey = await app.request("/api/bots", {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  assert.equal(viaKey.status, 200);

  const second = seedDevCredentials();
  assert.equal(second?.apiKey, null);
  assert.equal(db.countUsers(), 1);

  const keysAfter = db.listAllApiKeys();
  assert.equal(keysAfter.length, 1);
  assert.deepEqual(
    keysAfter.map((key) => ({
      name: key.name,
      user_id: key.user_id,
      hash: key.hash,
    })),
    [{ name: DEV_SEED_KEY_NAME, user_id: user.id, hash: seededKey?.hash }],
  );

  delete process.env.DEV_SEED_AUTH;
  assert.equal(seedDevCredentials(), null);
  assert.equal(db.countUsers(), 1);
  assert.equal(db.listAllApiKeys().length, 1);

  db.setUserPassword(user.id, db.hashPassword("changed-password"));
  process.env.DEV_SEED_AUTH = "1";
  const afterChange = seedDevCredentials();
  assert.equal(afterChange?.apiKey, null);

  const changedUser = db.getUserByEmail(DEV_SEED_EMAIL);
  assert.ok(changedUser);
  assert.equal(
    db.verifyPassword("devpassword", changedUser.password_hash),
    false,
  );
  assert.ok(db.verifyPassword("changed-password", changedUser.password_hash));
});
