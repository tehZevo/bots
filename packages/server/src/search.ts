export type SearchType =
  | "bots"
  | "archived_bots"
  | "roles"
  | "skills"
  | "projects"
  | "tags"
  | "teams"
  | "templates";

export const SEARCH_TYPES: readonly SearchType[] = [
  "bots",
  "archived_bots",
  "roles",
  "skills",
  "projects",
  "tags",
  "teams",
  "templates",
];

const RESULT_LIMIT = 8;

export interface SearchMatch {
  type: SearchType;
  id: string;
  name: string;
  subtitle: string | null;
}

export interface SearchGroup {
  type: SearchType;
  total: number;
  matches: SearchMatch[];
}

interface Candidate extends SearchMatch {
  fields: readonly string[];
}

export interface SearchData {
  bots: readonly {
    id: string;
    name: string;
    instructions: string;
    role_id?: string | null;
    archived?: number;
  }[];
  roles: readonly { id: string; name: string; instructions: string }[];
  skills: readonly {
    id: string;
    name: string;
    description: string;
    instructions?: string;
  }[];
  projects: readonly {
    id: string;
    name: string;
    description: string;
    body?: string;
  }[];
  tags: readonly { id: string; name: string; bot_count: number }[];
  teams: readonly { id: string; name: string; members: readonly unknown[] }[];
  templates: readonly {
    id: string;
    name: string;
    description: string;
    instructions?: string;
  }[];
}

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, max = 180): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function previewForMatch(
  value: string | null | undefined,
  query: string,
): string | null {
  const text = clean(value);
  if (!text) return null;
  if (query) {
    const index = text.toLowerCase().indexOf(query);
    if (index >= 0) {
      const radius = Math.max(70, query.length * 3);
      const start = Math.max(0, index - radius);
      const end = Math.min(text.length, index + query.length + radius);
      return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
    }
  }
  return truncate(text);
}

function matchText(fields: readonly string[], query: string): boolean {
  return fields.some((field) => field.toLowerCase().includes(query));
}

function candidate(
  type: SearchType,
  id: string,
  name: string,
  subtitle: string | null,
  ...fields: readonly string[]
): Candidate {
  return { type, id, name, subtitle, fields };
}

function buildGroup(
  type: SearchType,
  candidates: readonly Candidate[],
  query: string,
): SearchGroup {
  if (!query) return { type, total: 0, matches: [] };
  const matches = candidates
    .filter((item) => matchText(item.fields, query))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    type,
    total: matches.length,
    matches: matches.slice(0, RESULT_LIMIT).map((item) => ({
      type: item.type,
      id: item.id,
      name: item.name,
      subtitle: item.subtitle,
    })),
  };
}

export function buildSearchResults({
  q,
  types = SEARCH_TYPES,
  data,
}: {
  q: string;
  types?: readonly SearchType[];
  data: SearchData;
}): SearchGroup[] {
  const query = q.trim().toLowerCase();
  const roleNames = new Map(data.roles.map((role) => [role.id, role.name]));

  const botCandidates = data.bots.map((bot) =>
    candidate(
      bot.archived ? "archived_bots" : "bots",
      bot.id,
      bot.name,
      (bot.role_id ? roleNames.get(bot.role_id) : null) ?? "No role",
      bot.name,
      bot.instructions,
    ),
  );

  const candidates: Record<SearchType, Candidate[]> = {
    bots: botCandidates.filter((item) => item.type === "bots"),
    archived_bots: botCandidates.filter(
      (item) => item.type === "archived_bots",
    ),
    roles: data.roles.map((role) =>
      candidate(
        "roles",
        role.id,
        role.name,
        previewForMatch(role.instructions, query),
        role.name,
        role.instructions,
      ),
    ),
    skills: data.skills.map((skill) =>
      candidate(
        "skills",
        skill.id,
        skill.name,
        previewForMatch(skill.description || skill.instructions, query),
        skill.name,
        skill.description,
      ),
    ),
    projects: data.projects.map((project) =>
      candidate(
        "projects",
        project.id,
        project.name,
        previewForMatch(project.description || project.body, query),
        project.name,
        project.description,
      ),
    ),
    tags: data.tags.map((tag) =>
      candidate(
        "tags",
        tag.id,
        tag.name,
        `${tag.bot_count} ${tag.bot_count === 1 ? "bot" : "bots"}`,
        tag.name,
      ),
    ),
    teams: data.teams.map((team) =>
      candidate(
        "teams",
        team.id,
        team.name,
        `${team.members.length} ${team.members.length === 1 ? "bot" : "bots"}`,
        team.name,
      ),
    ),
    templates: data.templates.map((template) =>
      candidate(
        "templates",
        template.id,
        template.name,
        previewForMatch(template.description || template.instructions, query),
        template.name,
        template.description,
      ),
    ),
  };

  return types.map((type) => buildGroup(type, candidates[type], query));
}
