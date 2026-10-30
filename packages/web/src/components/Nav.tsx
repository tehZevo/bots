import { NAV_GROUPS } from "../lib/nav.ts";
import type { Tab } from "../types.ts";
export function Nav({
  tab,
  rail,
  onSelect,
}: {
  tab: Tab;
  rail: boolean;
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
          {group.items.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              title={label}
              className={tab === id ? "sel" : ""}
              onClick={() => onSelect(id)}
            >
              <Icon size={rail ? 20 : 17} />
              {!rail && label}
            </button>
          ))}
        </section>
      ))}
    </nav>
  );
}
