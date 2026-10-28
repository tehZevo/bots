import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const loader = fileURLToPath(
  new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url),
);
const fixture = fileURLToPath(
  new URL("./fixtures/durable-crash-tool.ts", import.meta.url),
);

interface ChildResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

function runChild(args: readonly string[]): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", loader, fixture, ...args],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    let endedStreams = 0;
    let closeResult: ChildResult | undefined;

    const finish = () => {
      if (closeResult && endedStreams === 2) resolve(closeResult);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.once("end", () => {
      endedStreams++;
      finish();
    });
    child.stderr.once("end", () => {
      endedStreams++;
      finish();
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      closeResult = { stdout, stderr, code, signal };
      finish();
    });
  });
}

test("a durable tool interrupted by SIGKILL resumes without running again", {
  timeout: 60_000,
}, async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "bots-durable-crash-"));

  try {
    const crashed = await runChild(["start", stateDir]);
    assert.ok(
      crashed.signal === "SIGKILL" || crashed.code === 137,
      `child should be killed (code=${crashed.code}, signal=${crashed.signal}): ${crashed.stderr}`,
    );
    assert.equal(existsSync(join(stateDir, "started")), true);
    assert.equal(
      readFileSync(join(stateDir, "tool-executions.log"), "utf8").trim(),
      "executed",
    );

    const recovered = await runChild(["resume", stateDir]);
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
