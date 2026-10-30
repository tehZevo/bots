import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-durable-settings-")),
  "t.db",
);

const { config } = await import("../src/config.ts");
const { durableSettings, durableStoragePath } = await import(
  "../src/pi-runtime.ts"
);

test("durable settings disable SDK retries and background compaction", () => {
  const settings = durableSettings();

  assert.equal(settings.stream?.maxRetries, 0);
  assert.equal(settings.retry?.enabled, true);
  assert.equal(settings.retry?.maxRetries, 3);
  assert.equal(settings.compaction?.enabled, true);
  assert.equal(
    settings.compaction?.keepRecentTokens,
    Math.max(1024, config.compaction.keepRecent * 2048),
  );
  assert.equal(settings.compaction?.backgroundTokens, 0);
  assert.equal(settings.steeringMode, "all");
});

test("Harness storage sits beside the configured application database", () => {
  const durablePath = durableStoragePath();

  assert.equal(dirname(durablePath), dirname(config.databasePath));
  assert.equal(basename(durablePath), "pi-durable.sqlite");
});
