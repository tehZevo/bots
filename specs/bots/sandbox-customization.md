# Sandbox customization

- A bot may specify its own container image; unset means `SANDBOX_IMAGE` (see `bots/sandbox.md`).
- A bot may declare extra packages and CPU/memory limits (`sandbox_cpus`, `sandbox_memory_mb`).
- With a custom image the orchestrator builds a per-bot derived image on first sandbox creation (base image + packages) and reuses it until the declaration changes.
- Limits are applied at container creation; recreating after idle reaping picks up the current values.
- Image, packages and limits are editable in the bot detail `General` tab; invalid values return 400 with an error message.
