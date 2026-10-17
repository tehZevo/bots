# Memory

Each bot has one persistent conversation shared across all its runs.

- Every user/assistant/tool message is stored and replayed at the start of the next run; survives restarts.
- "Clear memory" wipes the conversation but keeps run history.
- Compaction: past ~24k estimated tokens, older messages are permanently replaced by an LLM-written summary + the last 16 raw messages. If summarizing fails, context is used uncompacted.
