import { dirname, resolve } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import type {
  HarnessSettings,
  Registry,
  Storage,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { config } from "./config.ts";
import { registerBotsProvider } from "./pi-provider.ts";

const registry = createRegistry<ToolRegistration>();
const models = createModels();

let harness: Harness | undefined;
let opening: Promise<Harness> | undefined;

export function getDurableRegistry(): Registry<ToolRegistration> {
  return registry;
}

export function durableStoragePath(): string {
  return resolve(dirname(config.databasePath), "pi-durable.sqlite");
}

export function durableSettings(): HarnessSettings {
  return {
    extensions: [],
    stream: { maxRetries: 0, maxRetryDelayMs: 60_000 },
    retry: { enabled: true, maxRetries: 3, baseDelayMs: 1000 },
    compaction: {
      enabled: true,
      keepRecentTokens: Math.max(1024, config.compaction.keepRecent * 2048),
      backgroundTokens: 0,
    },
    progress: { partialIntervalMs: 250, outputIntervalMs: 250 },
    toolExecution: "parallel",
    steeringMode: "all",
  };
}

export async function openDurableHarness(storage?: Storage): Promise<Harness> {
  registerBotsProvider(models);
  return Harness.open(
    storage ?? (await openNodeSqliteStorage(durableStoragePath())),
    { models, registry, settings: durableSettings(), onReport: report },
    BACKGROUND_CONTEXT,
  );
}

function report(error: unknown): void {
  console.error("durable runtime:", error);
}

export async function initDurableRuntime(): Promise<Harness> {
  if (harness) return harness;
  opening ??= openDurableHarness().then((opened) => {
    harness = opened;
    opening = undefined;
    opened.resume();
    return opened;
  });
  try {
    return await opening;
  } catch (err) {
    opening = undefined;
    throw err;
  }
}

export function getDurableHarness(): Harness | undefined {
  return harness;
}
