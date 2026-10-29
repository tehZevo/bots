import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-fake-provider-api-")),
  "t.db",
);
process.env.DEV_FAKE_LLM = "1";
process.env.ALLOW_REGISTRATION = "true";

const { createApp } = await import("../src/api.ts");
const app = createApp();

function cookieOf(res: Response): string {
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
): Promise<Response> {
  return app.request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("fake provider is visible and read-only when enabled", async () => {
  const signup = await request(
    "POST",
    "/api/auth/signup",
    { email: "fake@example.com", password: "longenough1" },
    undefined,
  );
  assert.equal(signup.status, 201);
  const cookie = cookieOf(signup);

  const listed = await request("GET", "/api/providers", undefined, cookie);
  assert.equal(listed.status, 200);
  const providers = (await listed.json()) as Record<string, unknown>[];
  const fake = providers.find((row) => row.id === "fake-provider");
  assert.ok(fake);
  assert.deepEqual(
    {
      name: fake.name,
      models: fake.models,
      builtin: fake.builtin,
      has_key: fake.has_key,
    },
    { name: "Fake", models: ["fake"], builtin: true, has_key: false },
  );

  const updated = await request(
    "PUT",
    "/api/providers/fake-provider",
    { name: "Changed", base_url: "https://example.test/v1" },
    cookie,
  );
  assert.equal(updated.status, 409);

  const removed = await request(
    "DELETE",
    "/api/providers/fake-provider",
    undefined,
    cookie,
  );
  assert.equal(removed.status, 409);

  const settings = await request(
    "PUT",
    "/api/settings",
    { default_provider_id: "fake-provider", default_model: "fake" },
    cookie,
  );
  assert.equal(settings.status, 200);

  const readBack = (await (
    await request("GET", "/api/settings", undefined, cookie)
  ).json()) as Record<string, unknown>;
  assert.deepEqual(
    {
      default_provider_id: readBack.default_provider_id,
      default_model: readBack.default_model,
    },
    { default_provider_id: "fake-provider", default_model: "fake" },
  );
});
