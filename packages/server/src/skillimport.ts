// Skill import (specs/skills/import.md): resolve a skills.sh or Git source to
// previews, then store selected bundles byte-for-byte with immutable provenance.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  type Stats,
  statSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { dataDir } from "./config.ts";
import { HostNotAllowedError, type Lookup, safeFetch } from "./ssrf.ts";

export const MAX_BUNDLE_FILES = 200;
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

const SKILLS_SH_SEARCH = "https://skills.sh/api/search";

export interface Frontmatter {
  name: string;
  description: string;
  license: string | null;
  body: string;
}

// Minimal frontmatter reader per the Agent Skills contract: a leading
// `---` block of `key: value` lines. Unknown fields are preserved in the
// stored file but never interpreted here.
export function parseFrontmatter(markdown: string): Frontmatter | null {
  const text = markdown.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return null;
  const lines = text.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    fields[m[1].toLowerCase()] = m[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  const name = (fields.name ?? "").trim();
  const description = (fields.description ?? "").trim();
  if (!name || !description) return null;
  return {
    name,
    description,
    license: fields.license?.trim() || null,
    body: lines
      .slice(end + 1)
      .join("\n")
      .replace(/^\r?\n/, ""),
  };
}

export interface GitSource {
  cloneUrl: string;
  ownerRepo: string | null;
  ref: string | null;
  subpath: string | null;
  skillFilter: string | null;
}

// Accepts `owner/repo`, a repository URL, an optional `/tree/<ref>/<path>`
// subpath, an optional trailing `@<skill>` filter and an optional `#<ref>`.
export function parseGitSource(raw: string): GitSource | null {
  let rest = raw.trim();
  if (!rest) return null;
  const hashAt = rest.indexOf("#");
  let ref: string | null = null;
  if (hashAt !== -1) {
    ref = rest.slice(hashAt + 1).trim() || null;
    rest = rest.slice(0, hashAt);
  }
  let skillFilter: string | null = null;
  const atPath = rest.lastIndexOf("/");
  const at = rest.indexOf("@", atPath === -1 ? 1 : atPath + 1);
  if (at !== -1) {
    skillFilter = rest.slice(at + 1).trim() || null;
    rest = rest.slice(0, at);
  }
  rest = rest.trim().replace(/\/+$/, "");
  const short = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(rest);
  if (short && !rest.includes("://")) {
    return {
      cloneUrl: `https://github.com/${short[1]}/${short[2]}.git`,
      ownerRepo: `${short[1]}/${short[2]}`,
      ref,
      subpath: null,
      skillFilter,
    };
  }
  let url: URL;
  try {
    url = new URL(rest);
  } catch {
    return null;
  }
  if (!["https:", "http:", "file:"].includes(url.protocol)) return null;
  const treeMatch = /^(.*?)\/tree\/([^/]+)\/(.*)$/.exec(
    url.pathname.replace(/\/+$/, ""),
  );
  let subpath: string | null = null;
  if (treeMatch) {
    ref = ref ?? decodeURIComponent(treeMatch[2]);
    subpath = decodeURIComponent(treeMatch[3]) || null;
    url.pathname = treeMatch[1];
  } else {
    const repoTree = /^(.*?)\/tree\/([^/]+)$/.exec(
      url.pathname.replace(/\/+$/, ""),
    );
    if (repoTree) {
      ref = ref ?? decodeURIComponent(repoTree[2]);
      url.pathname = repoTree[1];
    }
  }
  let ownerRepo: string | null = null;
  if (url.hostname === "github.com" || url.hostname === "") {
    const parts = url.pathname.replace(/^\/|\/$|\.git$/g, "").split("/");
    if (parts.length >= 2 && url.hostname)
      ownerRepo = `${parts[0]}/${parts[1]}`;
  }
  return { cloneUrl: url.toString(), ownerRepo, ref, subpath, skillFilter };
}

function runGit(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", () => reject(new Error("git is not available")));
    child.on("close", (code) => {
      const command = args.find((arg) => !arg.startsWith("-")) ?? "command";
      if (code === 0) resolve(out.trim());
      else reject(new Error(`git ${command} failed: ${err.trim() || code}`));
    });
  });
}

const GIT_NO_REDIRECTS = ["-c", "http.followRedirects=false"];

function gitInfoUrl(repo: string): string {
  const url = new URL(repo);
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return `${url.protocol}//${url.host}${path}info/refs?service=git-upload-pack`;
}

function repoFromProbe(original: string, finalUrl: string): string {
  try {
    const url = new URL(finalUrl);
    if (!url.pathname.endsWith("/info/refs")) return original;
    url.pathname = url.pathname
      .replace(/\/info\/refs$/, "")
      .replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.origin === "null" ? url.toString() : url.href;
  } catch {
    return original;
  }
}

export async function resolveSafeCloneUrl(
  cloneUrl: string,
  options: { lookup?: Lookup } = {},
): Promise<string> {
  let url: URL;
  try {
    url = new URL(cloneUrl);
  } catch {
    throw new HostNotAllowedError("source host not allowed");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    if (
      process.env.BOTS_ALLOW_PRIVATE_NETWORK === "1" &&
      url.protocol === "file:"
    )
      return cloneUrl;
    throw new HostNotAllowedError("source host not allowed");
  }

  try {
    const probe = await safeFetch(gitInfoUrl(cloneUrl), {
      errorMessage: "source host not allowed",
      timeoutMs: 8_000,
      lookup: options.lookup,
    });
    return repoFromProbe(cloneUrl, probe.finalUrl);
  } catch (err) {
    if (
      err instanceof HostNotAllowedError ||
      (err instanceof Error && /too many redirects/.test(err.message))
    )
      throw err;
    return cloneUrl; // Let git report authentication or transport failures.
  }
}

export interface ClonedRepo {
  dir: string;
  resolvedCommit: string;
}

// `--depth 1` for the default branch; init+fetch for an explicit ref so tags,
// branches and commit shas all resolve.
export async function cloneRepo(source: GitSource): Promise<ClonedRepo> {
  const cloneUrl = await resolveSafeCloneUrl(source.cloneUrl);
  const dir = await mkdtemp(join(tmpdir(), "bots-skill-src-"));
  try {
    if (source.ref) {
      await runGit(["init", "-q"], dir);
      await runGit(
        [...GIT_NO_REDIRECTS, "remote", "add", "origin", "--", cloneUrl],
        dir,
      );
      const fetch = await runGit(
        [
          ...GIT_NO_REDIRECTS,
          "fetch",
          "-q",
          "--depth",
          "1",
          "origin",
          "--",
          source.ref,
        ],
        dir,
      ).catch(() => null);
      if (fetch === null) {
        await runGit([...GIT_NO_REDIRECTS, "fetch", "-q", "origin"], dir);
      }
      await runGit(["checkout", "-q", "FETCH_HEAD"], dir).catch(async () => {
        await runGit(["checkout", "-q", "--", source.ref as string], dir);
      });
    } else {
      await runGit(
        [
          ...GIT_NO_REDIRECTS,
          "clone",
          "-q",
          "--depth",
          "1",
          "--",
          cloneUrl,
          ".",
        ],
        dir,
      );
    }
    const resolvedCommit = await runGit(["rev-parse", "HEAD"], dir);
    return { dir, resolvedCommit };
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

export function cleanupClone(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export type GitRefKind = "default" | "branch" | "tag" | "commit";

function remoteOutputHasRef(output: string, namespace: string, ref: string) {
  return output
    .split(/\r?\n/)
    .some((line) => line.split("\t")[1] === `${namespace}/${ref}`);
}

// specs/skills/updates.md — branches track their head; tags and commits are pinned.
export async function classifyRemoteRef(
  cloneUrl: string,
  ref: string | null,
): Promise<GitRefKind | null> {
  if (!ref) return "default";
  if (/^[0-9a-f]{40}$/i.test(ref)) return "commit";
  const output = await runGit(["ls-remote", "--refs", cloneUrl]);
  if (remoteOutputHasRef(output, "refs/heads", ref)) return "branch";
  if (remoteOutputHasRef(output, "refs/tags", ref)) return "tag";
  return null;
}

function walkFiles(root: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const r = rel ? posix.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...walkFiles(root, r));
    else if (entry.isFile()) out.push(r);
  }
  return out;
}

export interface BundleStats {
  fileCount: number;
  totalSize: number;
  contentHash: string;
}

// Content hash over sorted relpaths and per-file hashes — stable across clones.
export function bundleStats(dir: string, folderRel: string): BundleStats {
  const base = join(dir, folderRel);
  const files = walkFiles(base).sort();
  let totalSize = 0;
  const hash = createHash("sha256");
  for (const f of files) {
    const buf = readFileSync(join(base, f));
    totalSize += buf.length;
    hash.update(`${f}\u0000`);
    hash.update(createHash("sha256").update(buf).digest("hex"));
    hash.update("\n");
  }
  return {
    fileCount: files.length,
    totalSize,
    contentHash: hash.digest("hex"),
  };
}

export interface SkillPreview {
  folder: string;
  name: string;
  description: string;
  license: string | null;
  file_count: number;
  total_size: number;
  content_hash: string;
}

// Every discoverable SKILL.md under the (sub)path, narrowed by @skill filter.
export function previewSkills(dir: string, source: GitSource): SkillPreview[] {
  const rootRel = source.subpath ?? "";
  const rootAbs = join(dir, rootRel);
  let stat: Stats | undefined;
  try {
    stat = statSync(rootAbs);
  } catch {
    throw new Error("requested path is missing from the repository");
  }
  if (!stat.isDirectory()) throw new Error("requested path is not a directory");
  const out: SkillPreview[] = [];
  for (const file of walkFiles(dir, rootRel)) {
    if (posix.basename(file) !== "SKILL.md") continue;
    const folder = posix.dirname(file);
    let fm: Frontmatter | null;
    try {
      fm = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
    } catch {
      fm = null;
    }
    if (!fm) continue; // unreadable/invalid entries are not discoverable here
    const stats = bundleStats(dir, folder);
    out.push({
      folder,
      name: fm.name,
      description: fm.description,
      license: fm.license,
      file_count: stats.fileCount,
      total_size: stats.totalSize,
      content_hash: stats.contentHash,
    });
  }
  const filtered = source.skillFilter
    ? out.filter(
        (s) =>
          s.name.toLowerCase() === source.skillFilter?.toLowerCase() ||
          posix.basename(s.folder).toLowerCase() ===
            source.skillFilter?.toLowerCase(),
      )
    : out;
  if (!filtered.length) {
    throw new Error(
      source.skillFilter
        ? `no SKILL.md matched "${source.skillFilter}"`
        : "no valid SKILL.md found in the source",
    );
  }
  return filtered.sort((a, b) => a.folder.localeCompare(b.folder));
}

export function bundleDir(id: string): string {
  return join(dataDir, "skills", id);
}

// Byte-for-byte copy of one skill folder into the data directory.
export function storeBundle(
  skillId: string,
  srcRoot: string,
  folderRel: string,
): void {
  const dest = bundleDir(skillId);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(join(srcRoot, folderRel), dest, { recursive: true });
}

export function removeBundle(skillId: string): void {
  rmSync(bundleDir(skillId), { recursive: true, force: true });
}

// Legacy helper kept for tests that seed bundles in a throwaway data dir.
export function tempDataHint(): string {
  return mkdtempSync(join(tmpdir(), "bots-skill-dst-"));
}

export interface SkillsShResult {
  id: string;
  source: string;
  skill_id: string;
  name: string;
  installs: number | null;
}

export async function searchSkillsSh(q: string): Promise<SkillsShResult[]> {
  const res = await fetch(`${SKILLS_SH_SEARCH}?q=${encodeURIComponent(q)}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`skills.sh responded ${res.status}`);
  const data = (await res.json()) as {
    skills?: {
      id?: string;
      source?: string;
      skillId?: string;
      name?: string;
      installs?: number;
    }[];
  };
  return (data.skills ?? [])
    .filter((s) => s.source && s.skillId)
    .map((s) => ({
      id: String(s.id ?? `${s.source}/${s.skillId}`),
      source: String(s.source),
      skill_id: String(s.skillId),
      name: String(s.name ?? s.skillId),
      installs: typeof s.installs === "number" ? s.installs : null,
    }));
}
