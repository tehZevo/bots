import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it as test } from "vitest";
import { BookIcon } from "../src/components/icons/BookIcon.tsx";
import { BotIcon } from "../src/components/icons/BotIcon.tsx";
import { GearIcon } from "../src/components/icons/GearIcon.tsx";
import { MachineIcon } from "../src/components/icons/MachineIcon.tsx";
import { PlugIcon } from "../src/components/icons/PlugIcon.tsx";
import { RoleIcon } from "../src/components/icons/RoleIcon.tsx";
import { TeamIcon } from "../src/components/icons/TeamIcon.tsx";
import { TemplateIcon } from "../src/components/icons/TemplateIcon.tsx";

const ICONS: Record<string, (p: { size?: number }) => React.ReactElement> = {
  BotIcon,
  RoleIcon,
  BookIcon,
  GearIcon,
  PlugIcon,
  MachineIcon,
  TeamIcon,
  TemplateIcon,
};

for (const [name, Icon] of Object.entries(ICONS)) {
  test(`${name} renders a sized svg`, () => {
    const html = renderToStaticMarkup(React.createElement(Icon));
    assert.match(html, /^<svg width="18" height="18" viewBox="0 0 24 24"/);
    assert.match(
      renderToStaticMarkup(React.createElement(Icon, { size: 9 })),
      /^<svg width="9" height="9"/,
    );
  });
}
