import { defineConfig } from "vitepress";

export default defineConfig({
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
          { text: "Roles, skills & capabilities", link: "/roles-capabilities-skills" },
          { text: "MCP integrations", link: "/integrations-mcp" },
          { text: "Triggers & scheduling", link: "/triggers-scheduling" },
        ],
      },
    ],
    search: { provider: "local" },
  },
});
