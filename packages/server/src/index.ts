import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./api.ts";
import { config } from "./config.ts";
import { startSandboxReaper } from "./sandbox.ts";
import { startScheduler } from "./scheduler.ts";

mkdirSync(dirname(config.databasePath), { recursive: true });

const app = createApp();
startScheduler();
startSandboxReaper();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`bots server listening on http://localhost:${info.port}`);
});
