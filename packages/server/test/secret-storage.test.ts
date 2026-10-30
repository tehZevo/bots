import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dir = mkdtempSync(join(tmpdir(), "bots-storage-"));
process.env.DATABASE_PATH = join(dir, "t.db");
process.env.ALLOW_REGISTRATION = "true";

const KEY_ONE =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const KEY_TWO =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
process.env.SECRETS_KEY = KEY_ONE;

const {
  db,
  getProvider,
  getSecret,
  insertProvider,
  insertSecret,
  updateProvider,
  updateSecret,
} = await import("../src/db.ts");
const { createApp } = await import("../src/api.ts");
const { prepareSecretStorage } = await import("../src/secret-storage.ts");
const { decryptWithKey, parseEncryptionKey } = await import(
  "../src/encryption.ts"
);

const app = createApp();
const signup = await app.request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "storage@example.com",
    password: "storage-pass-1",
  }),
});
assert.equal(signup.status, 201);
const SESSION = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

function secretValue(name: string): string | undefined {
  return (
    db.prepare("SELECT value FROM secret WHERE name = ?").get(name) as
      | { value: string }
      | undefined
  )?.value;
}

function providerKey(name: string): string | undefined {
  return (
    db.prepare("SELECT api_key FROM providers WHERE name = ?").get(name) as
      | { api_key: string }
      | undefined
  )?.api_key;
}

test("secret and provider values are encrypted at rest", () => {
  insertSecret({
    id: "sec-encrypted",
    name: "Encrypted test secret",
    key: "ENCRYPTED_TEST_SECRET",
    value: "plain-secret-value",
    created_at: Date.now(),
  });
  assert.equal(getSecret("sec-encrypted")?.value, "plain-secret-value");
  const stored = secretValue("Encrypted test secret");
  assert.ok(stored?.startsWith("enc:v1:"));
  assert.ok(!stored?.includes("plain-secret-value"));

  updateSecret("sec-encrypted", { name: "Renamed encrypted secret" });
  assert.equal(secretValue("Renamed encrypted secret"), stored);

  insertProvider({
    id: "prov-encrypted",
    name: "Encrypted provider",
    base_url: "https://example.com/v1",
    api_key: "plain-provider-value",
    models: [],
    created_at: Date.now(),
  });
  assert.equal(getProvider("prov-encrypted")?.api_key, "plain-provider-value");
  const storedKey = providerKey("Encrypted provider");
  assert.ok(storedKey?.startsWith("enc:v1:"));
  assert.ok(!storedKey?.includes("plain-provider-value"));

  updateProvider("prov-encrypted", { name: "Renamed encrypted provider" });
  assert.equal(providerKey("Renamed encrypted provider"), storedKey);
});

test("plaintext material is encrypted once at boot", async () => {
  delete process.env.SECRETS_KEY;
  try {
    db.prepare(
      `INSERT INTO secret (id, name, key, value, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("sec-plain", "Migrated secret", "PLAIN_TOKEN", "plaintext-value", 1);
    db.prepare(
      `INSERT INTO providers (id, name, base_url, api_key, models, created_at)
       VALUES (?, ?, ?, ?, '[]', ?)`,
    ).run(
      "prov-plain",
      "Migrated provider",
      "https://example.com/v1",
      "plaintext-key",
      1,
    );
  } finally {
    process.env.SECRETS_KEY = KEY_ONE;
  }

  await prepareSecretStorage();

  assert.equal(getSecret("sec-plain")?.value, "plaintext-value");
  const migratedSecret = secretValue("Migrated secret");
  assert.ok(migratedSecret?.startsWith("enc:v1:"));
  assert.ok(!migratedSecret?.includes("plaintext-value"));

  assert.equal(getProvider("prov-plain")?.api_key, "plaintext-key");
  const migratedKey = providerKey("Migrated provider");
  assert.ok(migratedKey?.startsWith("enc:v1:"));
  assert.ok(!migratedKey?.includes("plaintext-key"));
});

test("boot fails fast and lists material without a usable key", async () => {
  delete process.env.SECRETS_KEY;
  try {
    await assert.rejects(
      prepareSecretStorage(),
      /secret "Migrated secret".*provider "Migrated provider"/,
    );
  } finally {
    process.env.SECRETS_KEY = KEY_ONE;
  }
});

test("SECRETS_KEY_OLD rotates every stored value", async () => {
  insertSecret({
    id: "sec-rotate",
    name: "Rotation token",
    key: "ROTATION_TOKEN",
    value: "rotate-me-value",
    created_at: Date.now(),
  });
  const before = secretValue("Rotation token");

  process.env.SECRETS_KEY_OLD = KEY_ONE;
  process.env.SECRETS_KEY = KEY_TWO;
  await prepareSecretStorage();

  const after = secretValue("Rotation token") as string;
  assert.notEqual(after, before);
  assert.equal(
    decryptWithKey(after, parseEncryptionKey(KEY_TWO) as Buffer),
    "rotate-me-value",
  );
  assert.throws(() =>
    decryptWithKey(after, parseEncryptionKey(KEY_ONE) as Buffer),
  );
});

test("saving encrypted material without SECRETS_KEY fails explicitly", async () => {
  const saved = process.env.SECRETS_KEY;
  delete process.env.SECRETS_KEY;
  try {
    const secretResponse = await app.request("/api/secrets", {
      method: "POST",
      headers: { cookie: SESSION, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Missing key secret",
        key: "MISSING_KEY_SECRET",
        value: "cannot-store-this",
      }),
    });
    assert.equal(secretResponse.status, 503);
    assert.match(String((await secretResponse.json()).error), /SECRETS_KEY/);
    assert.equal(
      db
        .prepare("SELECT id FROM secret WHERE name = ?")
        .get("Missing key secret"),
      undefined,
    );

    const providerResponse = await app.request("/api/providers", {
      method: "POST",
      headers: { cookie: SESSION, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Missing key provider",
        base_url: "https://example.com/v1",
        api_key: "cannot-store-this-key",
      }),
    });
    assert.equal(providerResponse.status, 503);
    assert.match(String((await providerResponse.json()).error), /SECRETS_KEY/);
    assert.equal(
      db
        .prepare("SELECT id FROM providers WHERE name = ?")
        .get("Missing key provider"),
      undefined,
    );
  } finally {
    process.env.SECRETS_KEY = saved;
  }
});
