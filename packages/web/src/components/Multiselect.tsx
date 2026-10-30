import { useState } from "react";

export function Multiselect({
  label,
  options,
  selected,
  onChange,
  busy,
  placeholder,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  busy?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const sel = new Set(selected);
  const q = query.trim().toLowerCase();
  return (
    <div className="multiselect">
      <input
        aria-label={label}
        placeholder={placeholder ?? "Search…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {selected.length > 0 && (
        <span className="mschosen">{`${selected.length} selected`}</span>
      )}
      <ul className="msopts">
        {options
          .filter((o) => !q || o.name.toLowerCase().includes(q))
          .map((o) => (
            <li key={o.id}>
              <label>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={sel.has(o.id)}
                  onChange={() =>
                    onChange(
                      sel.has(o.id)
                        ? selected.filter((x) => x !== o.id)
                        : [...selected, o.id],
                    )
                  }
                />
                {o.name}
              </label>
            </li>
          ))}
      </ul>
    </div>
  );
}
