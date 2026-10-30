import { NAV_GROUPS } from "../lib/nav.ts";
import type { Tab } from "../types.ts";
export function Nav({
  tab,
  rail,
  counts,
  onSelect,
}: {
  tab: Tab;
  rail: boolean;
  counts?: Partial<Record<Tab, number>>;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <nav className="sidetabs">
      {NAV_GROUPS.map((group) => (
        <section
          key={group.label}
          className="navgroup"
          aria-label={group.label}
        >
          <span className="navgrouplabel">{group.label}</span>
          {group.items.map(({ id, label, Icon }) => {
            const count = counts?.[id] ?? 0;
            return (
              <button
                key={id}
                type="button"
                title={`${label}${count ? ` · ${count}` : ""}`}
                className={tab === id ? "sel" : ""}
                onClick={() => onSelect(id)}
              >
                <Icon size={rail ? 20 : 17} />
                {!rail && label}
                {count > 0 && (
                  <span className="navcount">{count > 99 ? "99+" : count}</span>
                )}
              </button>
            );
          })}
        </section>
      ))}
    </nav>
  );
}
