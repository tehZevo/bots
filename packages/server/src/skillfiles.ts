// specs/skills/files.md — advertised skills, on-demand file reads, bundle layout.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { dataDir } from "./config.ts";
import type { BotRow, SkillRow } from "./db.ts";
import { getRole, getSkill } from "./db.ts";

export const SKILLS_SANDBOX_ROOT = "/workspace/.skills";

// Advertisement order is by skill name so equal grants produce identical prompts.
export function grantedSkills(bot: BotRow): SkillRow[] {
  const role = bot.role_id ? getRole(bot.role_id) : undefined;
  return (role?.skill_ids ?? [])
    .map((id) => getSkill(id))
    .filter((s): s is SkillRow => Boolean(s))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
        a.id.localeCompare(b.id),
    );
}

export function skillDirName(name: string, taken?: Set<string>): string {
  let base = name
    .replace(/[^A-Za-z0-9._ -]/g, "-")
    .replace(/^[-. ]+|[-. ]+$/g, "")
    .slice(0, 64);
  if (!base) base = "skill";
  let dir = base;
  let n = 2;
  while (taken?.has(dir)) {
    dir = `${base}-${n++}`;
  }
  taken?.add(dir);
  return dir;
}

export function bundleDir(id: string): string | undefined {
  const dir = resolve(dataDir, "skills", id);
  try {
    return statSync(dir).isDirectory() ? dir : undefined;
  } catch {
    return undefined;
  }
}

// Hand-written skills have no stored bundle; SKILL.md is synthesized from the row.
export function syntheticSkillMd(skill: SkillRow): string {
  return `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.instructions.trim()}\n`;
}

function hashTree(dir: string, rel = ""): string {
  const entries = readdirSync(join(dir, rel), { withFileTypes: true }).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const acc = createHash("sha256");
  for (const entry of entries) {
    const childRel = rel ? join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      acc.update(`d ${childRel}\n${hashTree(dir, childRel)}`);
    } else {
      acc.update(`f ${childRel} ${readFileSync(join(dir, childRel))}`);
    }
  }
  return acc.digest("hex");
}

export function skillContentHash(skill: SkillRow): string {
  const dir = bundleDir(skill.id);
  if (dir) return hashTree(dir);
  return createHash("sha256").update(syntheticSkillMd(skill)).digest("hex");
}

// specs/skills/files.md — read a file inside a granted skill's bundle.
export function readSkillFile(skill: SkillRow, path = "SKILL.md"): string {
  const dir = bundleDir(skill.id);
  if (!dir) {
    if (path !== "SKILL.md") {
      throw new Error(`skill "${skill.name}" has no file ${path}`);
    }
    return syntheticSkillMd(skill);
  }
  if (isAbsolute(path)) {
    throw new Error(`path must be relative to the bundle: ${path}`);
  }
  const target = resolve(dir, path);
  const rel = relative(dir, target);
  if (!rel || rel.startsWith("..")) {
    throw new Error(`path escapes the skill bundle: ${path}`);
  }
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(target);
  } catch {
    throw new Error(`not found in skill "${skill.name}": ${path}`);
  }
  if (st.isDirectory()) {
    throw new Error(`${path} is a directory, not a file`);
  }
  return readFileSync(target, "utf8");
}
