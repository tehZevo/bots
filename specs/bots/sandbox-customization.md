# Machines and sandbox customization

- A new `Machines` tab manages named machines: a display name, optional description and a Dockerfile. Create, edit (fixed-size code textarea) and delete behind the confirm dialog; empty name or empty Dockerfile returns 400.
- The built-in default machine — `SANDBOX_IMAGE` as-is — always exists, cannot be edited or deleted, and is what bots get when no machine is selected.
- Bots select a machine at creation and can switch machines later from the bot detail `General` tab; switching only takes effect on the next sandbox (recreate after idle reap or explicit restart).
- The orchestrator builds one image per machine (content-hash tag) on first use by any bot, reuses it while the Dockerfile is unchanged, and rebuilds lazily after edits; build failures surface inline on the Machines tab without affecting running sandboxes.
- Per-bot CPU/memory limits stay on the bot (`sandbox_cpus`, `sandbox_memory_mb`), applied at container creation regardless of machine.
- Deleting a machine that bots still reference returns 409 listing them; machines carry no secrets beyond what the Dockerfile itself contains.
