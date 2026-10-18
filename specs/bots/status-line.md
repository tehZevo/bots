# Bot status line

- A bot exposes `status`: a short agent-reported one-liner shown under the current task on cards and in the detail header, rendered italic in the muted secondary color; null until set.
- The agent gets a `set_status` tool — deliberately separate from `set_current_task`, not a parameter of it: status has an independent lifecycle (it survives task changes and describes how things are going, not what is being worked on). Empty string clears to null.
- `set_status` takes no bot argument and always targets the running bot itself; setting status never counts as output.
- `GET /api/bots` includes `status`; Clear memory resets it to null alongside the current task.
- The agent-reported status is the designated signal source for the future yellow health state (ROADMAP); today it is display-only.
