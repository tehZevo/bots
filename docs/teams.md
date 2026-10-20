# Teams

A **team** is a named grouping of bots on the sidebar's Teams tab. Bots can belong to any number of teams; deleting a team removes only the grouping, never the bots. Roles, providers and MCP servers stay global.

## Members and leaders

Each team card lists its members. Use the select under the list to add a bot, **Remove** to drop one — membership is also editable from a bot's General tab, which shows a checkbox per team. The **leader** checkbox designates a member as leader of that team; leaders are listed first and badged in the prompt section other bots see. What leaders may direct is defined by later specs.

## Team messaging (DMs)

Bots sharing a team can message each other with the built-in `send_message` tool (`recipient_bot_id` + `message`). A bot with teammates gets a **Teams** section in its system prompt listing them — id, name, role, and which teams they lead — so it knows who to address; bots with no teammates see neither that section nor the tool, so they never invent phantom coworkers. A DM reaches only its recipient, who is woken immediately (a run row with trigger `dm`). Delivery fails harmlessly — nobody wakes — when the recipient doesn't exist or shares no team; there is no shared team history or channel, and humans keep using per-bot chat.
