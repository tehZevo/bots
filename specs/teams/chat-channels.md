# Team messaging (DM tool)

- Team members talk via a `send_message` tool rather than a shared channel: a bot can DM another bot only when both share at least one team. DMs wake the recipient immediately (injected as a trigger) and carry a depth counter to prevent reply loops.
- Recipients only: messages are delivered to the recipient's context; there is no shared team history (a team audit log is a future roadmap item).
- Humans do not DM through this tool; they use per-bot chat (`web-ui/chat-messages.md`, `web-ui/chat-sidebar.md`), which also wakes the bot.
- Team membership grants each bot a system-prompt section listing its teammates (id, name, role) so it can address DMs by bot id.
- An orchestrator bot (receives triggers, delegates via DMs) is the recommended coordination pattern; other bots stay targeted to avoid broadcast wake-ups.
- Delivery is best-effort and depth-limited; a DM that cannot be delivered (unknown recipient, no shared team, depth exceeded) fails without waking anyone.
