import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./api.ts";
import { config, dataDir } from "./config.ts";
import { clearDeviceGrants, sweepInterruptedRuns } from "./db.ts";
import { attachHookEvents } from "./hooks.ts";
import { attachPushNotifications } from "./push.ts";
import { startSandboxReaper } from "./sandbox.ts";
import { startScheduler } from "./scheduler.ts";

mkdirSync(dirname(config.databasePath), { recursive: true });

const swept = sweepInterruptedRuns();
if (swept > 0) console.log(`finalized ${swept} interrupted run(s)`);
clearDeviceGrants(); // pending device grants never survive a restart
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
