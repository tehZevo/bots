import { useState } from "react";
import type { GrantOption } from "../types.ts";

export function GrantDualList({
  label,
  options,
  selected,
  onChange,
  emptyText,
}: {
  label: string;
  options: GrantOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyText: string;
}) {
  const [query, setQuery] = useState("");
  const chosen = new Set(selected);
  const q = query.trim().toLowerCase();
  const available = options.filter(
    (option) =>
      !chosen.has(option.id) &&
      (!q ||
        `${option.name} ${option.description ?? ""}`.toLowerCase().includes(q)),
  );
  const granted = selected
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is GrantOption => Boolean(option));

  return (
    <div className="grantpicker">
      <section
        className="grantpane grantavailable"
        aria-label={`Available ${label}`}
      >
        <h3>Available</h3>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          aria-label={`Search ${label}`}
        />
        <ul className="grantlist">
          {available.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className="grantentry grantadd"
                aria-label={`Add ${option.name}`}
                onClick={() => onChange([...selected, option.id])}
              >
                <span className="grantname">{option.name}</span>
                {option.description && (
                  <span className="grantdesc">{option.description}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {options.length === 0 && (
          <p className="grantempty muted">{emptyText}</p>
        )}
        {options.length > 0 && available.length === 0 && (
          <p className="grantempty muted">
            {q
              ? `No matches for “${query.trim()}”.`
              : `All ${label.toLowerCase()} are granted.`}
          </p>
        )}
      </section>

      <section
        className="grantpane grantselected"
        aria-label={`Granted ${label}`}
      >
        <h3>Granted</h3>
        <ul className="grantlist">
          {granted.map((option) => (
            <li key={option.id} className="grantentry grantselrow">
              <span className="grantinfo">
                <strong>{option.name}</strong>
                {option.description && (
                  <small className="grantdesc">{option.description}</small>
                )}
              </span>
              <button
                type="button"
                className="grantremove"
                aria-label={`Remove ${option.name}`}
                onClick={() =>
                  onChange(selected.filter((id) => id !== option.id))
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {granted.length === 0 && (
          <p className="grantempty muted">Nothing granted yet.</p>
        )}
      </section>
    </div>
  );
}
