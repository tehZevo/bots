# Machines

A machine is a named sandbox image definition: display name, optional description and a Dockerfile. Bots run inside the machine they select; each bot gets its own container of that image.

## The Machines tab

The sidebar's **Machines** tab lists all machines plus the built-in **Default** machine — the stock `bots-sandbox` image, which always exists and cannot be edited or deleted. Add a machine with a name and Dockerfile (both required); Edit opens the same form, Delete asks for confirmation and refuses while bots still reference it (they must switch first).

## Images

The orchestrator builds one image per machine, tagged by a content hash of its Dockerfile:

- The build happens on first use by any bot — until then the row shows "Built on first use".
- While the Dockerfile is unchanged the built image is reused; editing it rebuilds lazily on the next sandbox creation.
- A failed build surfaces inline on the machine row and never affects running sandboxes or other machines.

## Choosing a machine for a bot

Pick a machine when creating a bot, or switch it later in the bot's **General** tab (Machine select). Switching takes effect on the next sandbox — after the idle reap or once the container is recreated — not mid-run. Per-bot CPU/memory limits are unrelated to machine selection and apply either way.
