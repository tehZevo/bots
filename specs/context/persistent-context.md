# Persistent context

Each bot has one persistent, forever-running conversation that drives everything it does.

- Triggers don't start sessions; they inject steering messages into the context — a schedule tick posts the bot's task with a timestamped header, manual runs post the same (`hook`/chat triggers will do the same).
- Each injected message drives one agent loop: tool-calling against an OpenAI-compatible endpoint (bot model override or server default; bot system prompt or generic default) until the assistant replies without tool calls. The final reply is returned to whatever triggered it (stored as run output today).
- The context survives restarts and grows forever, bounded by automatic size-based compaction: when it nears its token budget, oldest history is replaced with an LLM-written summary + recent tail (pi's native compaction where available). Compaction failure must never block a reply.
- "Clear memory" wipes the context manually; run history is kept.
