import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-pi-provider-")),
  "t.db",
);

const dbm = await import("../src/db.ts");
const { createModels } = await import("@earendil-works/pi-ai/models");
const { BOTS_PROVIDER_ID, botsModelCatalog, registerBotsProvider } =
  await import("../src/pi-provider.ts");

test("bots provider catalog includes configured and bot-specific models", () => {
  dbm.insertProvider({
    id: "openai",
    name: "OpenAI",
    base_url: "https://api.openai.com/v1",
    api_key: "key-1",
    models: ["gpt-test"],
    created_at: Date.now(),
  });
  dbm.insertProvider({
    id: "local",
    name: "Local",
    base_url: "http://localhost:8080/v1",
    api_key: "",
    models: ["llama-test"],
    created_at: Date.now(),
  });
  dbm.setSetting("default_provider_id", "openai");
  dbm.setSetting("default_model", "gpt-test");
  dbm.insertBot({
    id: "provider-bot",
    name: "Provider Bot",
    instructions: "",
    model_id: "custom-model",
    enabled: 1,
    created_at: Date.now(),
  });

  const ids = botsModelCatalog().map((model) => model.id);
  assert.deepEqual(ids.sort(), ["custom-model", "gpt-test", "llama-test"]);

  const models = createModels();
  registerBotsProvider(models);
  const provider = models.getProvider(BOTS_PROVIDER_ID);
  assert.ok(provider);
  assert.equal(provider.baseUrl, undefined);
});

test("bots provider auth uses a configured provider without exposing it", async () => {
  const models = createModels();
  registerBotsProvider(models);
  const auth = await models.getAuth(BOTS_PROVIDER_ID);
  assert.ok(auth);
  assert.equal(auth.auth.apiKey, "key-1");
  assert.match(auth.source ?? "", /^bots:/);
});
