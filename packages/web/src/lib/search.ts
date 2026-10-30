import type { Bot, SearchMatch } from "../types.ts";

// specs/machines/workspace-browser.md — read-only browse of data/workspaces/<bot-id>.
export interface SearchCommand {
  id: string;
  label: string;
  group: "Bot actions" | "All bots" | "Navigation";
  disabledReason?: string;
  bot?: Bot;
  confirm?: { text: string; label: string };
  run: () => Promise<void>;
}

export interface SearchRenderRow {
  key: string;
  kind: "search" | "command";
  match?: SearchMatch;
  action?: SearchCommand;
  selectedIndex: number | null;
}
