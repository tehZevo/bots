# Context usage breakdown

- The bot settings modal's `Stats` tab shows the bot's current context as estimated tokens against its model's context window, as a stacked bar plus a count and percentage per category.
- Categories are system prompt, tool definitions, conversation and free space.
- System prompt covers the generic prompt, name, instructions, role, granted skills, Projects and team sections; tool definitions cover tool names, descriptions and schemas only.
- Conversation covers user, assistant and tool-result messages plus any compaction summary; free space is the model context window minus the other categories.
- Tokens are estimated with the same estimator as compaction, not provider-reported usage; the section says it is an estimate.
- The breakdown refreshes after each turn while a run is active and when the modal opens; it never calls the model. With no model configured, show the used total without a window.
