# Run execution

One run = a tool-calling loop against an OpenAI-compatible endpoint until the model stops calling tools.

- Prompt: timestamped header + the bot's task, sent on top of stored memory.
- System prompt: the bot's own, or a generic default. Model: bot override or server default. One base URL + key for all bots (BYOM).
- The run ends when the assistant replies with no tool calls, or errors out.
