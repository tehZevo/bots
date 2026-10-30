import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runFixturePhase } from "./helpers/durable-child.ts";

test("a durable provider retry interrupted by SIGKILL continues without a duplicate model call", {
  timeout: 60_000,
}, async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "bots-durable-retry-"));

  try {
    const crashed = await runFixturePhase(
      "durable-crash-retry.ts",
      "start",
      stateDir,
    );
    assert.ok(
      crashed.signal === "SIGKILL" || crashed.code === 137,
      `child should be killed (code=${crashed.code}, signal=${crashed.signal}): ${crashed.stderr}`,
    );
    assert.equal(
      readFileSync(join(stateDir, "model-calls.log"), "utf8").trim(),
      "model",
    );
    const state = JSON.parse(
      readFileSync(join(stateDir, "state.json"), "utf8"),
    ) as { until?: number };
    assert.equal(typeof state.until, "number");

    const recovered = await runFixturePhase(
      "durable-crash-retry.ts",
      "resume",
      stateDir,
    );
    assert.equal(recovered.code, 0, recovered.stderr);
    const result = JSON.parse(recovered.stdout) as {
      status: string;
      calls: number;
      finalText: string;
    };
    assert.equal(result.status, "done");
    assert.equal(result.calls, 2);
    assert.equal(result.finalText, "recovered");
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
