# Docs site on GitHub Pages

- The repo hosts user-facing documentation under `docs/` — how to use the app (adding bots, roles and their capabilities, skills, MCP integrations, triggers, runs/logs) plus an API reference; specs, README, and ROADMAP stay repo-only.
- Everything in `docs/**/*.md` is published as a static docs site at the repository's GitHub Pages URL (`https://<owner>.github.io/bots/`).
- A `docs` workflow builds on pushes to `master` that touch `docs/**`, its own file, or the generator config, and deploys with the standard Pages artifact + `deploy-pages` actions; only the default `GITHUB_TOKEN` (pages write permission) is required.
- The build uses a markdown-native static site generator configured declaratively — no hand-written pages: navigation groups mirror `docs/` structure (`index.md` is the landing/how-to-start page), titles come from each file's first H1, and full-text search is on by default.
- Relative links between docs files resolve on the site; the build fails on any broken internal link or missing referenced file.
- The site follows the OS light/dark preference with a manual toggle (docs-site chrome only — unrelated to the app theme in `web-ui/theme.md`).
- Content is exactly the checked-in markdown at the built commit: no secrets, no API calls, no client-side data fetching.
