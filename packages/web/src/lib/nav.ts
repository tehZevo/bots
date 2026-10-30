import type { ReactElement } from "react";
import { BookIcon } from "../components/icons/BookIcon.tsx";
import { BotIcon } from "../components/icons/BotIcon.tsx";
import { GearIcon } from "../components/icons/GearIcon.tsx";
import { KeyIcon } from "../components/icons/KeyIcon.tsx";
import { MachineIcon } from "../components/icons/MachineIcon.tsx";
import { PlugIcon } from "../components/icons/PlugIcon.tsx";
import { ProjectIcon } from "../components/icons/ProjectIcon.tsx";
import { RoleIcon } from "../components/icons/RoleIcon.tsx";
import { TagIcon } from "../components/icons/TagIcon.tsx";
import { TeamIcon } from "../components/icons/TeamIcon.tsx";
import { TemplateIcon } from "../components/icons/TemplateIcon.tsx";

const NAV_ITEMS: NavItem[] = [
  { id: "bots", label: "Bots", Icon: BotIcon },
  { id: "teams", label: "Teams", Icon: TeamIcon },
  { id: "roles", label: "Roles", Icon: RoleIcon },
  { id: "skills", label: "Skills", Icon: BookIcon },
  { id: "templates", label: "Templates", Icon: TemplateIcon },
  { id: "projects", label: "Projects", Icon: ProjectIcon },
  { id: "tags", label: "Tags", Icon: TagIcon },
  { id: "machines", label: "Machines", Icon: MachineIcon },
  { id: "integrations", label: "Integrations", Icon: PlugIcon },
  { id: "secrets", label: "Secrets", Icon: KeyIcon },
  { id: "settings", label: "Settings", Icon: GearIcon },
];

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Operate", ids: ["bots", "teams"] },
  {
    label: "Library",
    ids: ["roles", "skills", "templates", "projects", "tags"],
  },
  {
    label: "Admin",
    ids: ["machines", "integrations", "secrets", "settings"],
  },
]
  .map((group) => ({
    label: group.label,
    items: group.ids.flatMap(
      (id) => NAV_ITEMS.filter((item) => item.id === id) as NavItem[],
    ),
  }))
  .filter((group) => group.items.length > 0);

const SETTINGS_TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "providers", label: "Providers" },
  { id: "system", label: "System" },
];

import type { SettingsTab, Tab } from "../types.ts";
export type NavItem = {
  id: Tab;
  label: string;
  Icon: (p: { size?: number }) => ReactElement;
};
