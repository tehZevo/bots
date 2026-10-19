# Team messaging

- Bots in a shared team can DM each other with a `send_message` tool (recipient bot id + message text).
- A DM is delivered only to the recipient and wakes it immediately (injected as a trigger); each carries a depth counter, and messages beyond the limit are dropped to prevent reply loops.
- DMs are recipient-only: there is no shared team history or channel.
- Only bots can invoke the tool; humans use per-bot chat (`web-ui/chat-messages.md`, `web-ui/chat-sidebar.md`).
- Team membership adds a system-prompt section listing teammates (id, name, role) so a bot can address DMs by id.
- A DM that cannot be delivered (unknown recipient, no shared team, depth exceeded) fails without waking anyone.
