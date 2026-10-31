import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataDir } from "./config.ts";
import {
  getBot,
  getMachine,
  getSetting,
  type SkillRow,
  secretEnvForBot,
  setMachineBuild,
  setSetting,
} from "./db.ts";
import {
  bundleDir,
  SKILLS_SANDBOX_ROOT,
  skillContentHash,
  skillDirName,
  syntheticSkillMd,
} from "./skillfiles.ts";

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

// specs/machines/sandbox.md — server-wide resource caps for every sandbox.
const MEM_SETTING_KEY = "sandbox_memory_mb";
const CPU_SETTING_KEY = "sandbox_cpu";

export function sandboxMemoryMb(): number {
  const raw = Number.parseInt(getSetting(MEM_SETTING_KEY) ?? "", 10);
  return Number.isFinite(raw) && raw >= 64 ? raw : 1024;
}

export function sandboxCpu(): number {
  const raw = Number(getSetting(CPU_SETTING_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(Math.round(raw * 10) / 10, 32);
}

export function hardeningArgs(owner: { uid: number; gid: number }): string[] {
  return [
    "--user",
    `${owner.uid}:${owner.gid}`,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit=256",
    "--memory",
    `${sandboxMemoryMb()}m`,
    "--cpus",
    String(sandboxCpu()),
  ];
}
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

function workspaceOwner(dir: string): { uid: number; gid: number } {
  try {
    const st = statSync(dir);
    return { uid: st.uid, gid: st.gid };
  } catch {
    return { uid: 0, gid: 0 };
  }
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
    ...hardeningArgs(workspaceOwner(workspaceDir)),
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

export async function containerExists(botId: string): Promise<boolean> {
  const r = await spawnCapture([
    "inspect",
    "-f",
    "{{.State.Running}}",
    containerName(botId),
  ]).catch(() => null);
  return r?.code === 0 && r.stdout.trim() === "true";
}

// specs/skills/files.md — mirror granted bundles into /workspace/.skills at loop start:
// refresh when stored content changed, remove directories whose grant went away.
export async function syncSkillBundlesForBot(
  botId: string,
  skills: SkillRow[],
): Promise<void> {
  if (skills.length === 0) {
    if (await containerExists(botId)) {
      await spawnCapture([
        "exec",
        containerName(botId),
        "rm",
        "-rf",
        SKILLS_SANDBOX_ROOT,
      ]);
    }
    return;
  }
  const wsHost = join(dataDir, "workspaces", botId);
  mkdirSync(wsHost, { recursive: true });
  const name = await ensureContainer(botId, wsHost);
  const staging = mkdtempSync(join(tmpdir(), "bots-skill-"));
  try {
    const taken = new Set<string>();
    const desired = new Map<string, { hash: string; src: string }>();
    for (const skill of skills) {
      const dir = skillDirName(skill.name, taken);
      let src = bundleDir(skill.id);
      if (!src) {
        src = join(staging, skill.id);
        mkdirSync(src, { recursive: true });
        writeFileSync(join(src, "SKILL.md"), syntheticSkillMd(skill));
      }
      desired.set(dir, { hash: skillContentHash(skill), src });
    }
    await spawnCapture(["exec", name, "mkdir", "-p", SKILLS_SANDBOX_ROOT]).then(
      (r) => {
        if (r.code !== 0)
          throw new Error(`mkdir ${SKILLS_SANDBOX_ROOT}: ${r.stderr}`);
      },
    );
    const stateRead = await spawnCapture([
      "exec",
      name,
      "cat",
      `${SKILLS_SANDBOX_ROOT}/.state.json`,
    ]).catch(() => null);
    let state: Record<string, string> = {};
    try {
      const parsed = JSON.parse(stateRead?.stdout ?? "");
      if (parsed && typeof parsed === "object") state = parsed;
    } catch {
      state = {};
    }
    const listed = await spawnCapture([
      "exec",
      name,
      "find",
      SKILLS_SANDBOX_ROOT,
      "-mindepth",
      "1",
      "-maxdepth",
      "1",
      "-type",
      "d",
      "-printf",
      "%f\n",
    ]).catch(() => null);
    const present = new Set(
      (listed?.stdout ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
    for (const dir of present) {
      if (!desired.has(dir)) {
        await spawnCapture([
          "exec",
          name,
          "rm",
          "-rf",
          `${SKILLS_SANDBOX_ROOT}/${dir}`,
        ]);
        delete state[dir];
      }
    }
    for (const [dir, entry] of desired) {
      if (state[dir] === entry.hash && present.has(dir)) continue;
      await spawnCapture([
        "exec",
        name,
        "rm",
        "-rf",
        `${SKILLS_SANDBOX_ROOT}/${dir}`,
      ]);
      const copied = await spawnCapture([
        "cp",
        entry.src,
        `${name}:${SKILLS_SANDBOX_ROOT}/${dir}`,
      ]);
      if (copied.code !== 0) {
        throw new Error(`docker cp skills into ${name}: ${copied.stderr}`);
      }
      state[dir] = entry.hash;
    }
    const b64 = Buffer.from(JSON.stringify(state)).toString("base64");
    await spawnCapture([
      "exec",
      name,
      "sh",
      "-c",
      `echo ${sq(b64)} | base64 -d > ${sq(`${SKILLS_SANDBOX_ROOT}/.state.json`)}`,
    ]);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
