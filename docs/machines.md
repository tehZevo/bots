# Machines

A machine is a named sandbox image definition: display name, optional description and a Dockerfile. Bots run inside the machine they select; each bot gets its own container of that image.

## The Machines tab

The sidebar's **Machines** tab lists all machines plus the built-in **Default** machine — the stock `bots-sandbox` image, which always exists and cannot be edited or deleted. Add a machine with a name and Dockerfile (both required); Edit opens the same form, Delete asks for confirmation and refuses while bots still reference it (they must switch first).

## Images

The orchestrator builds one image per machine, tagged by a content hash of its Dockerfile:

- The build happens on first use by any bot — until then the row shows "Built on first use".
- While the Dockerfile is unchanged the built image is reused; editing it rebuilds lazily on the next sandbox creation.
- A failed build surfaces inline on the machine row and never affects running sandboxes or other machines.

## Refreshing images

Each machine row has a manual refresh button:

- **Repull** (Default) fetches the registry tag even when a local copy already exists and pins the resulting digest for future sandbox recreations. A failed pull leaves the last known-good local image usable.
- **Rebuild** forces a fresh build from the current Dockerfile with refreshed parent bases, regardless of an existing content-hash tag.

Both affect only *future* sandbox creations — running containers keep their current image until the idle reap or **Restart machine**. A failed rebuild shows inline on the row while preserving the previous built image.

## Choosing a machine for a bot

Pick a machine when creating a bot, or switch it later in the bot's **General** tab (Machine select). Switching takes effect on the next sandbox — after the idle reap, or immediately via **Restart machine** in the same tab — not mid-run. Per-bot CPU/memory limits are unrelated to machine selection and apply either way.

## Workspace files

The bot's workspace `data/workspaces/<bot-id>/` (bind-mounted as `/workspace`) is browsable read-only from the bot modal's **Files** tab, straight off the host — it works whether or not the sandbox container is running. One level at a time with breadcrumbs back to the root, folders first then names alphabetically, each row showing size and modified time; an empty directory says so. Refresh is manual only: the tab never polls and never wakes a container.

Text files up to 256 KB open in place as monospace code (truncated with a notice); larger or binary-detected files offer Download under their original name. Nothing here mutates files — create, rename, move and delete stay the agent's job through `shell`.

The API mirrors this: `GET /api/bots/:id/workspace?path=...` returns `{ path, entries: [{ name, type, size_bytes, modified_at }] }` and `GET /api/bots/:id/workspace/file?path=...` streams the bytes. Paths are jailed to the workspace root — traversal outside it and symlink escapes answer 400, unknown paths 404. Any signed-in user may read.
