import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import type { Tab } from "../types.ts";

export const TAB_PATHS: Record<Tab, string> = {
  inbox: "/inbox",
  bots: "/bots",
  teams: "/teams",
  activity: "/activity",
  roles: "/roles",
  machines: "/machines",
  integrations: "/integrations",
  skills: "/skills",
  templates: "/templates",
  projects: "/projects",
  tags: "/tags",
  secrets: "/secrets",
  settings: "/settings",
};

export function tabFromPath(path: string): Tab {
  const hit = (Object.keys(TAB_PATHS) as Tab[]).find(
    (t) =>
      TAB_PATHS[t] === path.replace(/\/+$/, "") ||
      (path === "/" && t === "bots"),
  );
  return hit ?? "bots";
}

// Tab/route state machine: the initial tab derives from the current location,
// `setTab` switches tabs and pushes the mapped path, and back/forward restores
// the tab — unless the host owns popstate itself (syncLocation: false).
export function useTabRoute(
  options: { syncLocation?: boolean } = {},
): [Tab, (tab: Tab) => void, Dispatch<SetStateAction<Tab>>] {
  const { syncLocation = true } = options;
  const [tab, setTabInPlace] = useState<Tab>(() =>
    typeof location === "undefined" ? "bots" : tabFromPath(location.pathname),
  );
  useEffect(() => {
    if (!syncLocation || typeof addEventListener === "undefined")
      return undefined;
    const onPop = () => setTabInPlace(tabFromPath(location.pathname));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [syncLocation]);
  const setTab = useCallback((next: Tab) => {
    setTabInPlace(next);
    if (typeof history !== "undefined")
      history.pushState({}, "", TAB_PATHS[next]);
  }, []);
  return [tab, setTab, setTabInPlace];
}
