import { useState } from "react";
import { toggleIn } from "../lib/filterBots.ts";
import { titleCase } from "../lib/format.ts";
import { HEALTH_LABEL, HEALTH_ORDER } from "../lib/health.ts";
import type { Bot, Role, Tag } from "../types.ts";

export interface FilterBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  statuses: Bot["health"][];
  onStatusesChange: (next: Bot["health"][]) => void;
  roles: Role[];
  roleIds: string[];
  onRoleIdsChange: (next: string[]) => void;
  tags?: Tag[];
  tagIds?: string[];
  onTagIdsChange?: (next: string[]) => void;
  includeArchived: boolean;
  onIncludeArchivedChange: (next: boolean) => void;
}

// Controlled bots filter row: search, status/role/tag dropdowns, archived
// toggle. Role search filters the option list through state — no DOM walking.
export function FilterBar(props: FilterBarProps) {
  const {
    query,
    onQueryChange,
    statuses,
    onStatusesChange,
    roles,
    roleIds,
    onRoleIdsChange,
    tags,
    tagIds = [],
    onTagIdsChange,
    includeArchived,
    onIncludeArchivedChange,
  } = props;
  const [roleSearch, setRoleSearch] = useState("");

  const rq = roleSearch.trim().toLowerCase();
  const visibleRoles = roles.filter(
    (r) => rq === "" || r.name.toLowerCase().includes(rq),
  );
  const noRoleVisible = rq === "" || "(no role)".includes(rq);

  return (
    <div className="filterrow">
      <input
        placeholder="Search bots by name"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <details className="filterdd">
        <summary
          aria-label={`Status filter: ${statuses.length === 0 ? "All" : `${statuses.length} selected`}`}
        >
          Status:{" "}
          {statuses.length === 0
            ? "All"
            : statuses.map((s) => titleCase(HEALTH_LABEL[s])).join(", ")}
        </summary>
        <div className="filterpanel">
          {HEALTH_ORDER.map((s) => (
            <label key={s}>
              <input
                type="checkbox"
                checked={statuses.includes(s)}
                onChange={() => onStatusesChange(toggleIn(statuses, s))}
              />{" "}
              {titleCase(HEALTH_LABEL[s])}
            </label>
          ))}
        </div>
      </details>
      <details className="filterdd">
        <summary
          aria-label={`Role filter: ${roleIds.length === 0 ? "All" : `${roleIds.length} selected`}`}
        >
          Role:{" "}
          {roleIds.length === 0
            ? "All"
            : roleIds
                .map(
                  (id) => roles.find((r) => r.id === id)?.name ?? "(no role)",
                )
                .join(", ")}
        </summary>
        <div className="filterpanel">
          <input
            placeholder="Search roles"
            value={roleSearch}
            onChange={(e) => setRoleSearch(e.target.value)}
          />
          {noRoleVisible && (
            <label data-name="(no role)">
              <input
                type="checkbox"
                checked={roleIds.includes("")}
                onChange={() => onRoleIdsChange(toggleIn(roleIds, ""))}
              />{" "}
              (no role)
            </label>
          )}
          {visibleRoles.map((r) => (
            <label key={r.id} data-name={r.name}>
              <input
                type="checkbox"
                checked={roleIds.includes(r.id)}
                onChange={() => onRoleIdsChange(toggleIn(roleIds, r.id))}
              />{" "}
              {r.name}
            </label>
          ))}
        </div>
      </details>
      {tags && tags.length > 0 && (
        <details className="filterdd">
          <summary
            aria-label={`Tag filter: ${tagIds.length === 0 ? "All" : `${tagIds.length} selected`}`}
          >
            Tag:{" "}
            {tagIds.length === 0
              ? "All"
              : tagIds
                  .map((id) => tags.find((t) => t.id === id)?.name ?? "?")
                  .join(", ")}
          </summary>
          <div className="filterpanel">
            {tags.map((t) => (
              <label key={t.id} data-name={t.name}>
                <input
                  type="checkbox"
                  checked={tagIds.includes(t.id)}
                  onChange={() => onTagIdsChange?.(toggleIn(tagIds, t.id))}
                />{" "}
                {t.name}
              </label>
            ))}
          </div>
        </details>
      )}
      <label className="filtertoggle">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => onIncludeArchivedChange(e.target.checked)}
        />{" "}
        Include archived
      </label>
    </div>
  );
}
