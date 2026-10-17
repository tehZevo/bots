# Agent loop

Status: implemented

Each run executes one agentic turn-loop against an OpenAI-compatible LLM endpoint until the model stops calling tools.

- The prompt for a run is `[bot run <ISO timestamp> trigger=<schedule|manual>]` followed by the bot's task, sent as a user message on top of the bot's stored conversation.
- System prompt: the bot's `system_prompt`, or a generic default when empty.
- Model: the bot's `model_id` if set, otherwise the server default model. All LLM access goes through one OpenAI-compatible base URL + API key configured on the server (BYOM).
- The loop may call any number of tools per run; it ends when the assistant replies without tool calls or the request fails.
- If the model reports an error mid-run, the run is marked `error` but any partial assistant text is still kept as output.
- The final assistant text of a successful run becomes the run's `output`.

## Scenarios

- Given a task requiring web data, When the bot calls web_fetch and then replies, Then one `ok` run stores that reply as output.
- Given LLM_BASE_URL unreachable, When a run starts, Then it reaches status `error` with the failure message.
