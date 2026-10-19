# Persistent context

Each bot has one persistent, forever-running conversation that drives everything it does.

- Triggers don't start sessions — they inject steering messages into the context: a schedule tick posts its task with a timestamped header, a manual run posts the same, future hook/chat triggers post their events.
- An injected message continues the bot's existing agent loop, starting it only if idle. The loop calls tools against an OpenAI-compatible endpoint (bot model override or server default; composed name+instructions prompt or generic default) and goes quiet when the assistant replies without tool calls. Its final reply is returned to whatever triggered it (stored as run output today).
- The context survives restarts and grows forever, bounded by automatic size-based compaction: when it nears its token budget, oldest history is replaced with an LLM-written summary + recent tail (pi's native compaction where available). Compaction failure must never block a reply.
- "Clear memory" wipes the context manually; run history is kept.
