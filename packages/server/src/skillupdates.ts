// specs/skills/updates.md — check, apply and detach imported skill bundles.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSkill, listSkills, type SkillRow, updateSkill } from "./db.ts";
import { bundleDir } from "./skillfiles.ts";
import {
  bundleStats,
  type ClonedRepo,
  classifyRemoteRef,
  cleanupClone,
  cloneRepo,
  type GitSource,
  parseFrontmatter,
  previewSkills,
  type SkillPreview,
  storeBundle,
} from "./skillimport.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SkillUpdateStatus =
  | "up_to_date"
  | "update_available"
  | "source_unavailable";

export type SkillActionStatus =
  | SkillUpdateStatus
  | "updated"
  | "pinned"
  | "not_imported";

interface LastCheck {
  checked_at: number;
  status: SkillUpdateStatus;
  error?: string | null;
}

export interface SkillImportInfo extends Record<string, unknown> {
  origin: string;
  source: string;
  requested_ref: string | null;
  resolved_commit: string;
  path: string;
  content_hash: string;
  installed_at: number;
  updated_at: number;
  pinned?: boolean;
  modified?: boolean;
  last_check?: LastCheck;
}

export interface SkillUpdateState {
  status: SkillUpdateStatus | null;
  checked_at: number | null;
  modified: boolean;
  pinned: boolean;
}

export type SkillPayload = SkillRow & { update_state: SkillUpdateState | null };

export interface SkillActionResponse {
  id: string;
  name: string | null;
  status: SkillActionStatus | "not_found";
  error: string | null;
  skill: SkillPayload | null;
}

type ResolvedSource =
  | { kind: "pinned"; resolved_commit: string }
  | {
      kind: "found";
      clone: ClonedRepo;
      preview: SkillPreview;
      resolved_commit: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUpdateStatus(value: unknown): value is SkillUpdateStatus {
  return (
    value === "up_to_date" ||
    value === "update_available" ||
    value === "source_unavailable"
  );
}

export function parseImportInfo(raw: string | null): SkillImportInfo | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const requiredStrings = [
      "origin",
      "source",
      "resolved_commit",
      "path",
      "content_hash",
    ];
    for (const key of requiredStrings) {
      if (typeof parsed[key] !== "string") return null;
    }

    let lastCheck: LastCheck | undefined;
    if (isRecord(parsed.last_check)) {
      const checkedAt =
        typeof parsed.last_check.checked_at === "number" &&
        Number.isFinite(parsed.last_check.checked_at)
          ? parsed.last_check.checked_at
          : 0;
      if (checkedAt > 0 && isUpdateStatus(parsed.last_check.status)) {
        lastCheck = {
          ...parsed.last_check,
          checked_at: checkedAt,
          status: parsed.last_check.status,
          error:
            typeof parsed.last_check.error === "string"
              ? parsed.last_check.error
              : null,
        };
      }
    }

    return {
      ...parsed,
      origin: String(parsed.origin),
      source: String(parsed.source),
      requested_ref:
        typeof parsed.requested_ref === "string" && parsed.requested_ref
          ? parsed.requested_ref
          : null,
      resolved_commit: String(parsed.resolved_commit),
      path: String(parsed.path),
      content_hash: String(parsed.content_hash),
      installed_at:
        typeof parsed.installed_at === "number" &&
        Number.isFinite(parsed.installed_at)
          ? parsed.installed_at
          : 0,
      updated_at:
        typeof parsed.updated_at === "number" &&
        Number.isFinite(parsed.updated_at)
          ? parsed.updated_at
          : 0,
      pinned: parsed.pinned === true,
      modified: parsed.modified === true,
      last_check: lastCheck,
    };
  } catch {
    return null;
  }
}

function sourceCloneUrl(source: string): string | null {
  const raw = source.trim();
  if (!raw) return null;
  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) return `https://github.com/${raw}.git`;
  return null;
}

function isPinnedCommit(info: SkillImportInfo): boolean {
  return (
    Boolean(info.pinned) || /^[0-9a-f]{40}$/i.test(info.requested_ref ?? "")
  );
}

export function importedSkillIsModified(
  skill: SkillRow,
  info: SkillImportInfo,
): boolean {
  const dir = bundleDir(skill.id);
  if (!dir) return true;
  try {
    const fm = parseFrontmatter(readFileSync(join(dir, "SKILL.md"), "utf8"));
    if (
      !fm ||
      fm.name !== skill.name ||
      fm.description !== skill.description ||
      fm.body.trim() !== skill.instructions.trim()
    ) {
      return true;
    }
    return bundleStats(dir, "").contentHash !== info.content_hash;
  } catch {
    return true;
  }
}

export function enrichSkill(row: SkillRow): SkillPayload {
  const info = parseImportInfo(row.import_info);
  if (!info) return { ...row, update_state: null };
  return {
    ...row,
    update_state: {
      status: info.last_check?.status ?? null,
      checked_at: info.last_check?.checked_at ?? null,
      modified: Boolean(info.modified),
      pinned: isPinnedCommit(info),
    },
  };
}

export function listSkillPayloads(): SkillPayload[] {
  return listSkills().map(enrichSkill);
}

function actionResponse(
  row: SkillRow | null | undefined,
  status: SkillActionStatus | "not_found",
  error: string | null = null,
): SkillActionResponse {
  return {
    id: row?.id ?? "",
    name: row?.name ?? null,
    status,
    error,
    skill: row ? enrichSkill(row) : null,
  };
}

function currentModified(row: SkillRow, info: SkillImportInfo): boolean {
  try {
    return importedSkillIsModified(row, info);
  } catch {
    return true;
  }
}

function persistModified(row: SkillRow, info: SkillImportInfo): void {
  info.modified = currentModified(row, info);
  updateSkill(row.id, { import_info: JSON.stringify(info) });
}

function saveCheckResult(
  row: SkillRow,
  info: SkillImportInfo,
  status: SkillUpdateStatus,
  error?: string | null,
): void {
  info.modified = currentModified(row, info);
  info.last_check = { checked_at: Date.now(), status };
  if (error) info.last_check.error = error;
  updateSkill(row.id, { import_info: JSON.stringify(info) });
}

async function resolveImportedSource(
  info: SkillImportInfo,
): Promise<ResolvedSource | { kind: "error"; message: string }> {
  try {
    const cloneUrl = sourceCloneUrl(info.source);
    if (!cloneUrl) return { kind: "error", message: "source is unavailable" };

    let pinned = isPinnedCommit(info);
    if (!pinned) {
      const kind = await classifyRemoteRef(cloneUrl, info.requested_ref);
      pinned = kind === "tag" || kind === "commit";
    }
    if (pinned)
      return { kind: "pinned", resolved_commit: info.resolved_commit };

    const source: GitSource = {
      cloneUrl,
      ownerRepo: null,
      ref: info.requested_ref,
      subpath: null,
      skillFilter: null,
    };
    let clone: ClonedRepo;
    try {
      clone = await cloneRepo(source);
    } catch (err) {
      return { kind: "error", message: errorMessage(err) };
    }

    const previews = previewSkills(clone.dir, source);
    const preview = previews.find((item) => item.folder === info.path);
    if (!preview) {
      cleanupClone(clone.dir);
      return { kind: "error", message: "upstream skill path is missing" };
    }
    return {
      kind: "found",
      clone,
      preview,
      resolved_commit: clone.resolvedCommit,
    };
  } catch (err) {
    return { kind: "error", message: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function performCheck(id: string): Promise<SkillActionResponse> {
  const row = getSkill(id);
  if (!row) return actionResponse(null, "not_found");
  const info = parseImportInfo(row.import_info);
  if (!info) return actionResponse(row, "not_imported");

  const upstream = await resolveImportedSource(info);
  if (upstream.kind === "error") {
    saveCheckResult(row, info, "source_unavailable", upstream.message);
    return actionResponse(getSkill(id), "source_unavailable", upstream.message);
  }

  try {
    if (upstream.kind === "pinned") {
      info.pinned = true;
      saveCheckResult(row, info, "up_to_date");
      return actionResponse(getSkill(id), "up_to_date");
    }

    const status: SkillUpdateStatus =
      upstream.preview.content_hash === info.content_hash
        ? "up_to_date"
        : "update_available";
    info.pinned = false;
    saveCheckResult(row, info, status);
    return actionResponse(getSkill(id), status);
  } finally {
    if (upstream.kind === "found") cleanupClone(upstream.clone.dir);
  }
}

async function performUpdate(id: string): Promise<SkillActionResponse> {
  const row = getSkill(id);
  if (!row) return actionResponse(null, "not_found");
  const info = parseImportInfo(row.import_info);
  if (!info) return actionResponse(row, "not_imported");

  const upstream = await resolveImportedSource(info);
  if (upstream.kind === "error") {
    saveCheckResult(row, info, "source_unavailable", upstream.message);
    return actionResponse(getSkill(id), "source_unavailable", upstream.message);
  }

  try {
    if (upstream.kind === "pinned") {
      info.pinned = true;
      saveCheckResult(row, info, "up_to_date");
      return actionResponse(getSkill(id), "pinned");
    }

    if (upstream.preview.content_hash === info.content_hash) {
      info.pinned = false;
      saveCheckResult(row, info, "up_to_date");
      return actionResponse(getSkill(id), "up_to_date");
    }

    const fm = parseFrontmatter(
      readFileSync(
        join(upstream.clone.dir, upstream.preview.folder, "SKILL.md"),
        "utf8",
      ),
    );
    if (!fm) {
      saveCheckResult(
        row,
        info,
        "source_unavailable",
        "upstream SKILL.md is invalid",
      );
      return actionResponse(
        getSkill(id),
        "source_unavailable",
        "upstream SKILL.md is invalid",
      );
    }

    storeBundle(id, upstream.clone.dir, upstream.preview.folder);
    const now = Date.now();
    info.content_hash = upstream.preview.content_hash;
    info.resolved_commit = upstream.resolved_commit;
    info.updated_at = now;
    info.pinned = false;
    info.modified = false;
    info.last_check = { checked_at: now, status: "up_to_date" };
    updateSkill(id, {
      name: fm.name,
      description: fm.description,
      instructions: fm.body,
      import_info: JSON.stringify(info),
    });
    return actionResponse(getSkill(id), "updated");
  } finally {
    if (upstream.kind === "found") cleanupClone(upstream.clone.dir);
  }
}

const skillChains = new Map<string, Promise<unknown>>();

function withSkillTask<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = skillChains.get(id) ?? Promise.resolve();
  const result = previous.then(task, task);
  const settled = result.catch(() => undefined);
  skillChains.set(id, settled);
  void settled.then(
    () => {
      if (skillChains.get(id) === settled) skillChains.delete(id);
    },
    () => {
      if (skillChains.get(id) === settled) skillChains.delete(id);
    },
  );
  return result;
}

export function checkSkillUpdate(id: string): Promise<SkillActionResponse> {
  return withSkillTask(id, () => performCheck(id));
}

export function updateImportedSkill(id: string): Promise<SkillActionResponse> {
  return withSkillTask(id, () => performUpdate(id));
}

export async function refreshImportedModified(
  id: string,
): Promise<SkillPayload | null> {
  await withSkillTask(id, async () => {
    const row = getSkill(id);
    if (!row) return;
    const info = parseImportInfo(row.import_info);
    if (info) persistModified(row, info);
  });
  const updated = getSkill(id);
  return updated ? enrichSkill(updated) : null;
}

export function detachSkill(id: string): SkillPayload | null {
  if (!getSkill(id)) return null;
  updateSkill(id, { import_info: null });
  const row = getSkill(id);
  return row ? enrichSkill(row) : null;
}

let backgroundRunning = false;

export async function runDailySkillChecks(now = Date.now()): Promise<number> {
  if (backgroundRunning) return 0;
  backgroundRunning = true;
  try {
    const due = listSkills().filter((row) => {
      const info = parseImportInfo(row.import_info);
      return Boolean(
        info &&
          (!info.last_check || now - info.last_check.checked_at >= DAY_MS),
      );
    });
    for (const row of due) {
      await checkSkillUpdate(row.id).catch(() => undefined);
    }
    return due.length;
  } finally {
    backgroundRunning = false;
  }
}
