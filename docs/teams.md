# Teams

A **team** is a named grouping of bots on the sidebar's Teams tab. Bots can belong to any number of teams; deleting a team removes only the grouping, never the bots. Roles, providers and MCP servers stay global.

## Team cards and configuration

- The Teams tab lists teams as cards. **Create team** opens a modal — like create-bot — where you name the team and pick members and leaders from autocomplete multiselects before it exists at all.
- Each card shows a status icon computed across its members (blocked if any member is blocked, else issues, else active, else idle; disabled when every member is disabled) plus the member count in italics (e.g. *9 bots*). Filter the list by team name or with the bots multiselect (autocomplete) to see only teams containing the picked bots.
- Clicking a card opens the **team config modal**: rename the team, add or remove members and pick **leaders** with two separate autocomplete multiselects (leaders are added as members too), attach **Projects** (every member inherits them), or delete the team — deleting removes only the grouping, never the bots. Nothing changes until you press **Save**; closing with unsaved edits asks to confirm the discard.
- Membership is also editable from a bot's General tab, which offers the same teams multiselect; leaders are badged and listed first in the prompt section other bots see. What leaders may direct is defined by later specs.

## Team messaging (DMs)

Bots sharing a team can message each other with the built-in `send_message` tool (`recipient_bot_id` + `message`).

- A bot with teammates gets a **Teams** section in its system prompt listing them — id, name, role, and which teams they lead — so it knows who to address; bots with no teammates see neither that section nor the tool, so they never invent phantom coworkers.
- A DM reaches only its recipient, who is woken immediately (a run row with trigger `dm`). Bots message each other only when a task or their instructions call for coordination, not to post progress, start side conversations, or recruit help; a DM asks for a reply only when the sender requested one, so acknowledgements don't start a message loop.
- Delivery fails harmlessly — nobody wakes — when the recipient doesn't exist or shares no team. There is no shared team history or channel, and humans keep using per-bot chat.
