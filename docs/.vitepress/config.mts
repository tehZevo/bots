import { defineConfig } from "vitepress";

export default defineConfig({
  base: "/bots/",
  title: "bots",
  description: "Self-hosted bot orchestrator — operator documentation",
  appearance: true,
  cleanUrls: true,
  lastUpdated: false,
  ignoreDeadLinks: [/^https?:\/\/localhost/],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "API", link: "/api" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/getting-started" },
          { text: "Bots", link: "/bots" },
          {
            text: "Roles, skills & capabilities",
            link: "/roles-capabilities-skills",
          },
          { text: "Teams", link: "/teams" },
          { text: "Machines", link: "/machines" },
          { text: "MCP integrations", link: "/integrations-mcp" },
          { text: "Triggers & scheduling", link: "/triggers-scheduling" },
          { text: "Notifications", link: "/notifications" },
        ],
      },
    ],
    search: { provider: "local" },
  },
});
