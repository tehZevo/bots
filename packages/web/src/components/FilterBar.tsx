import { titleCase } from "../lib/format.ts";
import { HEALTH_LABEL, HEALTH_ORDER } from "../lib/health.ts";
import type { Bot, Role, Tag } from "../types.ts";
import { Multiselect } from "./Multiselect.tsx";

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

// Controlled bots filter row: search plus the shared multiselect for status,
// role and tags, and the archived toggle. Status is a fixed short list, so it
// skips the text filter; role and tag lists can grow and keep it.
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

  const statusOptions = HEALTH_ORDER.map((s) => ({
    id: s,
    name: titleCase(HEALTH_LABEL[s]),
  }));
  const roleOptions = [
    { id: "", name: "(no role)" },
    ...roles.map((r) => ({ id: r.id, name: r.name })),
  ];
  const tagOptions = (tags ?? []).map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="filterrow">
      <input
        placeholder="Search bots by name"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <Multiselect
        label="Status"
        options={statusOptions}
        selected={statuses}
        onChange={onStatusesChange}
        filterable={false}
      />
      <Multiselect
        label="Role"
        options={roleOptions}
        selected={roleIds}
        onChange={onRoleIdsChange}
        placeholder="Search roles"
      />
      {tagOptions.length > 0 && onTagIdsChange && (
        <Multiselect
          label="Tag"
          options={tagOptions}
          selected={tagIds}
          onChange={onTagIdsChange}
          placeholder="Search tags"
        />
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
