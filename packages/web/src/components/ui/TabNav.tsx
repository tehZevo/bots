export interface TabNavTab {
  id: string;
  label: string;
}

export function TabNav({
  tabs,
  selected,
  onSelect,
  ariaLabel,
}: {
  tabs: readonly TabNavTab[];
  selected: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
}) {
  return (
    <nav className="mtabs" {...(ariaLabel ? { "aria-label": ariaLabel } : {})}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={selected === t.id ? "sel" : ""}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
