# Workspace file browser

- The bot settings modal carries a `Files` tab (`../bots/detail.md`) over the bot's workspace directory `data/workspaces/<bot-id>/`, served by reading host files directly — it works whether or not the sandbox container is running (`sandbox.md`).
- API: `GET /api/bots/:id/workspace?path=...` returns `{ path, entries: [{ name, type, size_bytes, modified_at }] }`; `GET /api/bots/:id/workspace/file?path=...` returns file bytes. Any signed-in user may read (`../auth/multi-user.md`).
- Paths are jailed to the workspace root: traversal outside it and symlink escapes return 400; unknown paths return 404.
- The tab lists one level at a time with breadcrumbs back to the root; folders sort first, then names alphabetically; each row shows size and modified time. An empty directory shows an empty-state line.
- Text files up to 256 KB render in place as monospace code (truncated with a notice); larger or binary-detected files offer Download only. Downloads keep their file name.
- Refresh is manual via a button; the tab never polls and never starts or wakes a container.
- The browser is read-only: no create, rename, move or delete — file mutation stays the agent's job through `shell`.
