import { useEffect, useRef, useState } from "react";
import { useDismissOnFocusLost } from "../hooks/useDismissOnFocusLost.ts";
import { toggleIn } from "../lib/filterBots.ts";

export interface MultiselectProps<T extends string> {
  label: string;
  options: { id: T; name: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  busy?: boolean;
  placeholder?: string;
  filterable?: boolean;
  onCreate?: (name: string) => boolean | Promise<boolean>;
}

// The one multiselect in the app: a summary button opening a checkbox list,
// optionally narrowed by a text filter and optionally offering to create a
// missing option. Closes on outside click, focus loss or Escape.
export function Multiselect<T extends string>({
  label,
  options,
  selected,
  onChange,
  busy,
  placeholder,
  filterable = true,
  onCreate,
}: MultiselectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnFocusLost(ref, open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const sel = new Set<T>(selected);
  const q = query.trim().toLowerCase();
  const visible =
    filterable && q !== ""
      ? options.filter((o) => o.name.toLowerCase().includes(q))
      : options;
  const canCreate =
    onCreate !== undefined &&
    q !== "" &&
    !options.some((o) => o.name.toLowerCase() === q);
  const summary =
    selected.length === 0
      ? "All"
      : selected
          .map((id) => options.find((o) => o.id === id)?.name ?? "?")
          .join(", ");

  const toggle = (id: T) => onChange(toggleIn(selected, id));

  // A create that reports failure leaves the text in place so it can be fixed.
  const create = async () => {
    const name = query.trim();
    if (!onCreate || name === "") return;
    const result = await onCreate(name);
    if (result !== false) setQuery("");
  };

  // Enter commits what is typed: a missing option is created, an exact match is
  // attached, anything else leaves the text alone so it can be corrected.
  const commit = () => {
    if (canCreate) {
      void create();
      return;
    }
    if (visible.length === 1 && !sel.has(visible[0].id)) toggle(visible[0].id);
  };

  return (
    <div className="filterdd multiselect" ref={ref}>
      <button
        type="button"
        className="filtertrigger"
        aria-label={`${label} filter: ${summary}`}
        aria-expanded={open}
        title={summary}
        onClick={() => setOpen((v) => !v)}
      >
        {label}: {summary}
      </button>
      {open && (
        <div className="filterpanel">
          {filterable && (
            <input
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder={placeholder ?? `Search ${label.toLowerCase()}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
              }}
            />
          )}
          {visible.map((o) => (
            <label key={o.id} data-name={o.name}>
              <input
                type="checkbox"
                disabled={busy}
                checked={sel.has(o.id)}
                onChange={() => toggle(o.id)}
              />{" "}
              {o.name}
            </label>
          ))}
          {canCreate && (
            <button
              type="button"
              className="mscreate"
              disabled={busy}
              onClick={create}
            >
              {`+ Create "${query.trim()}"`}
            </button>
          )}
          {visible.length === 0 && !canCreate && (
            <span className="msempty">No matches</span>
          )}
        </div>
      )}
    </div>
  );
}
