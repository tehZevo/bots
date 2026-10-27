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
          { text: "Search & commands", link: "/search" },
          { text: "Accounts & access", link: "/authentication" },
          { text: "Bots", link: "/bots" },
          {
            text: "Roles, skills & capabilities",
            link: "/roles-capabilities-skills",
          },
          { text: "Teams", link: "/teams" },
          { text: "Machines", link: "/machines" },
          { text: "MCP integrations", link: "/integrations-mcp" },
          { text: "Triggers & scheduling", link: "/triggers-scheduling" },
          { text: "Templates", link: "/templates" },
          { text: "Projects", link: "/projects" },
          { text: "Tags", link: "/tags" },
          { text: "Secrets", link: "/secrets" },
          { text: "Notifications", link: "/notifications" },
          { text: "Editors & unsaved changes", link: "/editors" },
        ],
      },
      {
        text: "App & operations",
        items: [
          { text: "PWA install", link: "/pwa" },
          { text: "CLI basics", link: "/cli" },
          { text: "Operations", link: "/operations" },
        ],
      },
    ],
    search: { provider: "local" },
  },
});
