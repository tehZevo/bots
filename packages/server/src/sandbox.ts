import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const IMAGE = process.env.SANDBOX_IMAGE ?? "bots-sandbox:latest";
const EXEC_TIMEOUT_MS = 60_000;

export function containerName(botId: string): string {
  return `bots-bot-${botId}`;
}

interface ProcResult {
  stdout: string;
  stderr: string;
  code: number | null;
  killed?: boolean;
}

const MAX_BUFFER = 1024 * 1024;

function sq(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

async function spawnCapture(
  args: string[],
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ProcResult> {
  const result = await new Promise<ProcResult>((resolvePromise, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const take = (chunk: Buffer): string => {
      if (stdout.length + stderr.length >= MAX_BUFFER) {
        truncated = true;
        return "";
      }
      const room = MAX_BUFFER - stdout.length - stderr.length;
      return chunk.toString().slice(0, room);
    };
    child.stdout.on("data", (c: Buffer) => {
      stdout += take(c);
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr += take(c);
    });
    const timer = opts.timeoutMs
      ? setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs)
      : null;
    let killed = false;
    const onAbort = (): void => {
      killed = true;
      child.kill("SIGTERM");
    };
    opts.signal?.addEventListener("abort", onAbort);
    child.on("error", reject);
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolvePromise({
        stdout: truncated ? `${stdout}\n... [truncated]` : stdout,
        stderr: truncated ? `${stderr}\n... [truncated]` : stderr,
        code,
        killed: killed || (!!opts.timeoutMs && code === null),
      });
    });
  });
  return result;
}

export async function ensureContainer(
  botId: string,
  workspaceDir: string,
): Promise<string> {
  const name = containerName(botId);
  const state = await spawnCapture([
    "inspect",
    "-f",
    "{{.State.Running}}",
    name,
  ]).catch(() => ({ stdout: "", stderr: "", code: null }));
  if (state.code === 0) {
    if (state.stdout.trim() !== "true")
      await spawnCapture(["start", name]).then((r) => {
        if (r.code !== 0) throw new Error(`docker start ${name}: ${r.stderr}`);
      });
    return name;
  }
  const run = await spawnCapture([
    "run",
    "-d",
    "--name",
    name,
    "--label",
    "bots-sandbox=1",
    "-v",
    `${workspaceDir}:/workspace`,
    "-w",
    "/workspace",
    "-e",
    "HOME=/workspace",
    IMAGE,
  ]);
  if (run.code !== 0) {
    const err = run.stderr.trim();
    throw new Error(
      /manifest unknown|not found/i.test(err)
        ? `sandbox image ${IMAGE} missing — build docker/sandbox/Dockerfile first`
        : `docker run ${name}: ${err}`,
    );
  }
  return name;
}

export async function execInContainer(
  botId: string,
  workspaceDir: string,
  command: string,
  signal?: AbortSignal,
): Promise<ProcResult> {
  const name = await ensureContainer(botId, workspaceDir);
  if (signal?.aborted) throw new Error("aborted");
  const pidFile = `/tmp/bots-exec-${randomUUID()}.pid`;
  const remote = `echo $$ > ${sq(pidFile)} && exec bash -lc ${sq(command)}`;
  const result = await spawnCapture(["exec", "-i", name, "sh", "-c", remote], {
    timeoutMs: EXEC_TIMEOUT_MS,
    signal,
  });
  if (result.killed) {
    await spawnCapture([
      "exec",
      name,
      "sh",
      "-c",
      `pkill -9 -P $(cat ${sq(pidFile)} 2>/dev/null) 2>/dev/null; kill -9 $(cat ${sq(pidFile)} 2>/dev/null) 2>/dev/null; rm -f ${sq(pidFile)}`,
    ]).catch(() => {});
  }
  return result;
}

export function removeContainer(botId: string): void {
  void spawnCapture(["rm", "-f", containerName(botId)]).catch(() => {});
}
