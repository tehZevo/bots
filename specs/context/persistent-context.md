# Persistent context

Each bot has one persistent, forever-running conversation that drives everything it does.

- Triggers don't start sessions — they inject steering messages into the context: a schedule tick posts its task with a timestamped header, a manual run posts the same, chat sends post user turns (`../chat/messages.md`), and webhook triggers post their event payloads (`triggers/webhooks.md`).
- An injected message continues the bot's existing agent loop — steering it when busy or starting it when idle (`../runs/lifecycle.md`). The loop calls tools against an OpenAI-compatible endpoint with the model and prompt of `bots/registry.md` and goes quiet when the assistant replies without tool calls; that reply is recorded as run output.
- The context survives restarts and grows forever, bounded by automatic size-based compaction: when it nears its token budget, oldest history is replaced with an LLM-written summary + recent tail (pi's native compaction where available). Compaction failure must never block a reply.
- The `Stats` tab shows the current composition of this context — system prompt, tool definitions, conversation and free space (`usage-breakdown.md`).
- "Clear memory" wipes the context manually; run history is kept.
