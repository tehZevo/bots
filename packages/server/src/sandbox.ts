import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getBot,
  getMachine,
  getSetting,
  secretEnvForBot,
  setMachineBuild,
  setSetting,
} from "./db.ts";

const IMAGE =
  process.env.SANDBOX_IMAGE ?? "ghcr.io/tehzevo/bots-sandbox:latest";

export function defaultSandboxImage(): string {
  return IMAGE;
}

let imageReady: Promise<void> | null = null;

function ensureImage(): Promise<void> {
  if (!imageReady) {
    imageReady = (async () => {
      const known = await spawnCapture(["image", "inspect", IMAGE]);
      if (known.code === 0) return;
      const pulled = await spawnCapture(["pull", IMAGE], {
        timeoutMs: 300_000,
      });
      if (pulled.code !== 0)
        throw new Error(
          `sandbox image ${IMAGE} unavailable — docker pull failed: ${pulled.stderr.trim().split("\n").pop() ?? "unknown error"}`,
        );
    })();
    imageReady.catch(() => {
      imageReady = null;
    });
  }
  return imageReady;
}
const BUILD_TIMEOUT_MS = 900_000;
const DIGEST_SETTING_KEY = "sandbox_image_ref";
const machineBuilds = new Map<string, Promise<string>>();

function machineTag(dockerfile: string): string {
  return `bots-machine:${createHash("sha256").update(dockerfile).digest("hex").slice(0, 16)}`;
}

async function buildImage(
  tag: string,
  dockerfile: string,
  force: boolean,
): Promise<void> {
  if (!force) {
    const known = await spawnCapture(["image", "inspect", tag]);
    if (known.code === 0) return;
  }
  const dir = mkdtempSync(join(tmpdir(), "bots-machine-"));
  try {
    writeFileSync(
      join(dir, "Dockerfile"),
      dockerfile.endsWith("\n") ? dockerfile : `${dockerfile}\n`,
    );
    const args = force
      ? ["build", "--pull", "-t", tag, dir]
      : ["build", "-t", tag, dir];
    const built = await spawnCapture(args, { timeoutMs: BUILD_TIMEOUT_MS });
    if (built.code !== 0)
      throw new Error(
        `machine image build failed: ${built.stderr.trim().split("\n").pop() ?? "unknown error"}`,
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function recordBuildFailure(machineId: string, err: unknown): never {
  setMachineBuild(
    machineId,
    getMachine(machineId)?.image ?? null,
    err instanceof Error ? err.message : String(err),
  );
  throw err;
}

export function buildMachineImage(
  machineId: string,
  dockerfile: string,
): Promise<string> {
  const tag = machineTag(dockerfile);
  let pending = machineBuilds.get(tag);
  if (!pending) {
    pending = buildImage(tag, dockerfile, false).then(
      () => {
        setMachineBuild(machineId, tag, null);
        return tag;
      },
      (err) => recordBuildFailure(machineId, err),
    );
    pending.finally(() => machineBuilds.delete(tag)).catch(() => {});
    machineBuilds.set(tag, pending);
  }
  return pending;
}

export function rebuildMachineImage(
  machineId: string,
  dockerfile: string,
): Promise<string> {
  const tag = machineTag(dockerfile);
  return buildImage(tag, dockerfile, true).then(
    () => {
      setMachineBuild(machineId, tag, null);
      return tag;
    },
    (err) => recordBuildFailure(machineId, err),
  );
}

async function defaultDigest(): Promise<void> {
  const insp = await spawnCapture([
    "image",
    "inspect",
    "-f",
    "{{index .RepoDigests 0}}",
    IMAGE,
  ]);
  const ref = insp.code === 0 ? insp.stdout.trim() : "";
  if (ref.includes("@")) setSetting(DIGEST_SETTING_KEY, ref);
}

export async function repullDefaultImage(): Promise<string> {
  const pulled = await spawnCapture(["pull", IMAGE], { timeoutMs: 300_000 });
  if (pulled.code !== 0)
    throw new Error(
      `docker pull ${IMAGE} failed: ${pulled.stderr.trim().split("\n").pop() ?? "unknown error"}`,
    );
  imageReady = Promise.resolve();
  await defaultDigest();
  return defaultImageRef();
}

export function defaultImageRef(): string {
  const pinned = getSetting(DIGEST_SETTING_KEY);
  return pinned?.startsWith(`${IMAGE}@`) ? pinned : IMAGE;
}

export async function imageForBot(botId: string): Promise<string> {
  const bot = getBot(botId);
  const machine = bot?.machine_id ? getMachine(bot.machine_id) : undefined;
  if (!machine) {
    await ensureImage();
    return defaultImageRef();
  }
  return buildMachineImage(machine.id, machine.dockerfile);
}

const EXEC_TIMEOUT_MS = 60_000;
const IDLE_SETTING_KEY = "sandbox_idle_minutes";
export const DEFAULT_IDLE_MINUTES = 5;

const lastActivity = new Map<string, number>();

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
  const image = await imageForBot(botId);
  lastActivity.set(botId, Date.now());
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
  // assigned secrets (bot-level overrides inherited team values)
  const secretArgs = Object.entries(secretEnvForBot(botId)).flatMap(
    ([key, value]) => ["-e", `${key}=${value}`],
  );
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
    ...secretArgs,
    image,
  ]);
  if (run.code !== 0) {
    const err = run.stderr.trim();
    throw new Error(
      /manifest unknown|not found/i.test(err)
        ? `sandbox image ${image} missing — build docker/sandbox/Dockerfile or check network access to the registry`
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
  lastActivity.delete(botId);
  void spawnCapture(["rm", "-f", containerName(botId)]).catch(() => {});
}

export async function restartSandbox(botId: string): Promise<void> {
  const name = containerName(botId);
  lastActivity.delete(botId);
  await spawnCapture(["stop", name, "--time", "5"]).catch(() => null);
  const removed = await spawnCapture(["rm", "-f", name]);
  if (removed.code !== 0 && !/no such container/i.test(removed.stderr))
    throw new Error(`docker rm ${name}: ${removed.stderr.trim()}`);
}

export function idleMinutes(): number {
  const raw = getSetting(IDLE_SETTING_KEY);
  if (raw === undefined) return DEFAULT_IDLE_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_IDLE_MINUTES;
}

export function touchSandbox(botId: string): void {
  lastActivity.set(botId, Date.now());
}

async function reapOnce(): Promise<void> {
  const minutes = idleMinutes();
  if (minutes <= 0) return;
  const ps = await spawnCapture([
    "ps",
    "--filter",
    "label=bots-sandbox=1",
    "--format",
    "{{.Names}}",
  ]).catch(() => null);
  if (!ps || ps.code !== 0) return;
  const { isLoopActive } = await import("./agent.ts");
  for (const [botId] of lastActivity)
    if (isLoopActive(botId)) touchSandbox(botId);
  const cutoff = Date.now() - minutes * 60_000;
  for (const line of ps.stdout.split("\n")) {
    const name = line.trim();
    if (!name.startsWith("bots-bot-")) continue;
    const botId = name.slice("bots-bot-".length);
    const seen = lastActivity.get(botId);
    if (seen === undefined) {
      lastActivity.set(botId, Date.now());
      continue;
    }
    if (seen > cutoff) continue;
    await spawnCapture(["rm", "-f", name]).catch(() => {});
    lastActivity.delete(botId);
  }
}

export function startSandboxReaper(): void {
  const timer = setInterval(() => {
    void reapOnce().catch((e) =>
      console.error("sandbox reaper:", e instanceof Error ? e.message : e),
    );
  }, 60_000);
  timer.unref();
}
