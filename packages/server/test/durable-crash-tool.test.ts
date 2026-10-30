import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runFixturePhase } from "./helpers/durable-child.ts";

test("a durable tool interrupted by SIGKILL resumes without running again", {
  timeout: 60_000,
}, async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "bots-durable-crash-"));

  try {
    const crashed = await runFixturePhase(
      "durable-crash-tool.ts",
      "start",
      stateDir,
    );
    assert.ok(
      crashed.signal === "SIGKILL" || crashed.code === 137,
      `child should be killed (code=${crashed.code}, signal=${crashed.signal}): ${crashed.stderr}`,
    );
    assert.equal(existsSync(join(stateDir, "started")), true);
    assert.equal(
      readFileSync(join(stateDir, "tool-executions.log"), "utf8").trim(),
      "executed",
    );

    const recovered = await runFixturePhase(
      "durable-crash-tool.ts",
      "resume",
      stateDir,
    );
    assert.equal(recovered.code, 0, recovered.stderr);
    assert.deepEqual(JSON.parse(recovered.stdout), {
      status: "done",
      executions: 1,
      finalText: "recovered",
    });
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
