import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface ChildResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

const loader = fileURLToPath(
  new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url),
);
const fixtures = new URL("../fixtures/", import.meta.url);

export function runFixturePhase(
  fixture: string,
  phase: string,
  stateDir: string,
): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        loader,
        fileURLToPath(new URL(fixture, fixtures)),
        phase,
        stateDir,
      ],
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
