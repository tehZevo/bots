import type { Tab } from "../types.ts";
import { MenuIcon, SidebarToggleIcon } from "./icons/index.ts";
import { Nav } from "./Nav.tsx";

export function Sidebar({
  tab,
  rail,
  error,
  navOpen,
  counts,
  onSelectTab,
  onToggleRail,
  onOpenNav,
  onCloseNav,
}: {
  tab: Tab;
  rail: boolean;
  error: string | null;
  navOpen: boolean;
  counts?: Partial<Record<Tab, number>>;
  onSelectTab: (tab: Tab) => void;
  onToggleRail: () => void;
  onOpenNav: () => void;
  onCloseNav: () => void;
}) {
  return (
    <>
      <aside className={rail ? "rail" : ""}>
        {error && <p className="error">{error}</p>}
        <Nav tab={tab} rail={rail} counts={counts} onSelect={onSelectTab} />
        <button
          type="button"
          className="railtoggle"
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          title={rail ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleRail}
        >
          <SidebarToggleIcon size={20} collapsed={rail} />
        </button>
      </aside>
      <div className="topbar">
        <button
          type="button"
          className="hamburger"
          aria-label="Menu"
          title="Open menu"
          onClick={onOpenNav}
        >
          <MenuIcon size={20} />
        </button>
      </div>
      {navOpen && (
        <div className="drawer">
          <button
            type="button"
            className="scrim"
            aria-label="Close menu"
            onClick={onCloseNav}
          />
          <div className="panel">
            {error && <p className="error">{error}</p>}
            <Nav
              tab={tab}
              rail={false}
              counts={counts}
              onSelect={onSelectTab}
            />
          </div>
        </div>
      )}
    </>
  );
}
