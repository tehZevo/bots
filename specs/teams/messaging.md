# Team messaging

- Bots in a shared team can DM each other with a `send_message` tool (recipient bot id + message text).
- The tool is offered only to bots that have at least one teammate; a bot in no team, or alone in one, gets neither the tool nor the Teams section.
- A DM is delivered only to the recipient and wakes it immediately (injected as a trigger).
- DMs are recipient-only: there is no shared team history or channel.
- Only bots can invoke the tool; humans use per-bot chat (`../chat/messages.md`, `../chat/sidebar.md`).
- Team membership adds a system-prompt section listing teammates (id, name, role) so a bot can address DMs by id.
- A DM that cannot be delivered (unknown recipient, no shared team) fails without waking anyone.
