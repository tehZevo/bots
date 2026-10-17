# Memory

Status: implemented

Each bot has one persistent, growing conversation shared across all its runs.

- Every user/assistant/toolResult message produced in a run is stored against the bot and replayed as context at the start of the next run.
- Messages survive server restarts; they are the bot's long-term memory.
- Clearing memory (API or UI) wipes the conversation but keeps runs/history.
- Compaction: when the estimated context exceeds a token threshold (~24k), older messages are replaced by an LLM-written summary message ("Running memory") and only the most recent N (~16) raw messages are kept. The compaction result is persisted, so history shrinks permanently.
- If summarization fails, the uncompacted context is used as-is (never blocks a run).

## Scenarios

- Given a bot told "remember 42" in run 1, When run 2 asks for the number, Then the answer reflects stored memory.
- Given context over threshold, When a run proceeds, Then prior messages are replaced by a summary message plus recent tail.
- Given memory cleared, When GET /api/bots/:id/messages, Then [].
