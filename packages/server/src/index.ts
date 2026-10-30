import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./api.ts";
import { config, dataDir } from "./config.ts";
import { clearDeviceGrants, sweepInterruptedRuns } from "./db.ts";
import {
  DEV_SEED_EMAIL,
  DEV_SEED_KEY_NAME,
  DEV_SEED_PASSWORD,
  seedDevCredentials,
} from "./dev-auth.ts";
import { recoverDurableRuns } from "./durable-runs.ts";
import { attachHookEvents } from "./hooks.ts";
import { initDurableRuntime } from "./pi-runtime.ts";
import { attachPushNotifications } from "./push.ts";
import { startSandboxReaper } from "./sandbox.ts";
import { startScheduler } from "./scheduler.ts";
import { prepareSecretStorage } from "./secret-storage.ts";

async function main(): Promise<void> {
  mkdirSync(dirname(config.databasePath), { recursive: true });
  await prepareSecretStorage();

  clearDeviceGrants(); // pending device grants never survive a restart

  const devSeed = seedDevCredentials();
  if (devSeed?.apiKey) {
    console.log(
      `dev credentials seeded — ${DEV_SEED_EMAIL} / ${DEV_SEED_PASSWORD}, API key "${DEV_SEED_KEY_NAME}": ${devSeed.apiKey}`,
    );
  }

  try {
    await initDurableRuntime();
    const recovery = await recoverDurableRuns();
    if (recovery.resumed > 0)
      console.log(`resumed ${recovery.resumed} durable run(s)`);
    if (recovery.swept > 0)
      console.log(`finalized ${recovery.swept} unresumable run(s)`);
  } catch (err) {
    console.error("durable recovery failed:", err);
    const swept = sweepInterruptedRuns();
    if (swept > 0) console.log(`finalized ${swept} interrupted run(s)`);
  }

  attachPushNotifications();
  attachHookEvents();

  const app = createApp();
  startScheduler();
  startSandboxReaper();

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(
      `bots server listening on http://localhost:${info.port} (DATA_DIR=${dataDir})`,
    );
  });
}

void main().catch((err) => {
  console.error("server failed to start:", err);
  process.exitCode = 1;
});
