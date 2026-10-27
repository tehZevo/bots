// specs/machines/workspace-browser.md — read-only host view of a bot's workspace.
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { dataDir } from "./config.ts";

export const WORKSPACE_PREVIEW_LIMIT = 256 * 1024;
const MAX_SERVE_BYTES = 32 * 1024 * 1024;

export class WorkspaceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function workspaceRoot(botId: string): string {
  return join(dataDir, "workspaces", botId);
}

// Paths are jailed to the workspace root: traversal outside it and symlink
// escapes throw 400; unknown paths throw 404.
function resolveJail(botId: string, rawPath: string): string {
  const root = workspaceRoot(botId);
  if (rawPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rawPath))
    throw new WorkspaceError(400, "path must be relative to the workspace");
  let current = root;
  for (const part of rawPath.split("/")) {
    if (part === "" || part === ".") continue;
    if (
      part !== ".." &&
      lstatSync(join(current, part), {
        throwIfNoEntry: false,
      })?.isSymbolicLink()
    )
      throw new WorkspaceError(400, "symlink escapes are not allowed");
    current = resolve(current, part);
    if (current !== root && !current.startsWith(root + "/"))
      throw new WorkspaceError(400, "path escapes the workspace");
  }
  let st: ReturnType<typeof lstatSync>;
  try {
    st = lstatSync(current);
  } catch {
    throw new WorkspaceError(404, "not found");
  }
  if (st.isSymbolicLink()) {
    const real = realpathSync(current);
    if (real !== root && !real.startsWith(root + "/"))
      throw new WorkspaceError(400, "symlink escapes the workspace");
  }
  return current;
}

export interface WorkspaceEntry {
  name: string;
  type: "dir" | "file";
  size_bytes: number;
  modified_at: number;
}

export function listWorkspace(
  botId: string,
  rawPath: string,
): { path: string; entries: WorkspaceEntry[] } {
  const root = workspaceRoot(botId);
  if (!existsSync(root)) return { path: "", entries: [] };
  const dir = resolveJail(botId, rawPath);
  const st = statSync(dir);
  if (!st.isDirectory()) throw new WorkspaceError(404, "not a directory");
  const entries: WorkspaceEntry[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    let est: ReturnType<typeof statSync>;
    try {
      est = statSync(join(dir, ent.name));
    } catch {
      continue;
    }
    entries.push({
      name: ent.name,
      type: est.isDirectory() ? "dir" : "file",
      size_bytes: est.size,
      modified_at: Math.round(est.mtimeMs),
    });
  }
  entries.sort(
    (a, b) =>
      Number(b.type === "dir") - Number(a.type === "dir") ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const path = rawPath.replace(/^\/+|\/+$/g, "");
  return { path, entries };
}

export function readWorkspaceFile(botId: string, rawPath: string): Buffer {
  const file = resolveJail(botId, rawPath);
  const st = statSync(file);
  if (!st.isFile()) throw new WorkspaceError(404, "not a file");
  if (st.size > MAX_SERVE_BYTES)
    throw new WorkspaceError(400, "file too large to serve");
  return readFileSync(file);
}
