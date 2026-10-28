import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./api.ts";
import { config, dataDir } from "./config.ts";
import { clearDeviceGrants, sweepInterruptedRuns } from "./db.ts";
import { attachHookEvents } from "./hooks.ts";
import { initDurableRuntime } from "./pi-runtime.ts";
import { attachPushNotifications } from "./push.ts";
import { startSandboxReaper } from "./sandbox.ts";
import { startScheduler } from "./scheduler.ts";

async function main(): Promise<void> {
  mkdirSync(dirname(config.databasePath), { recursive: true });

  const swept = sweepInterruptedRuns();
  if (swept > 0) console.log(`finalized ${swept} interrupted run(s)`);
  clearDeviceGrants(); // pending device grants never survive a restart
  attachPushNotifications();
  attachHookEvents();
  await initDurableRuntime();

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
