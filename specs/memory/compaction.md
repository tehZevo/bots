# Context compaction

- Past ~24k estimated tokens, older messages are permanently replaced by an LLM-written summary plus the last 16 raw messages.
- If summarizing fails, context is used uncompacted; a run never blocks on it.
