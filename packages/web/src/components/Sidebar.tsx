import type { Tab } from "../types.ts";
import { BotIcon, MenuIcon, SidebarToggleIcon } from "./icons/index.ts";
import { Nav } from "./Nav.tsx";

export function Sidebar({
  tab,
  rail,
  error,
  navOpen,
  onSelectTab,
  onToggleRail,
  onOpenNav,
  onCloseNav,
}: {
  tab: Tab;
  rail: boolean;
  error: string | null;
  navOpen: boolean;
  onSelectTab: (tab: Tab) => void;
  onToggleRail: () => void;
  onOpenNav: () => void;
  onCloseNav: () => void;
}) {
  return (
    <>
      <aside className={rail ? "rail" : ""}>
        <div className="brand">
          <BotIcon size={24} />
          {!rail && <span>Bots</span>}
        </div>
        {error && <p className="error">{error}</p>}
        <Nav tab={tab} rail={rail} onSelect={onSelectTab} />
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
            <div className="hdr">
              <div className="brand">
                <BotIcon size={24} />
                <span>Bots</span>
              </div>
            </div>
            {error && <p className="error">{error}</p>}
            <Nav tab={tab} rail={false} onSelect={onSelectTab} />
          </div>
        </div>
      )}
    </>
  );
}
