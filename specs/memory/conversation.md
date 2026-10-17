# Conversation memory

Each bot has one persistent conversation shared across all its runs.

- Every user/assistant/tool message is stored and replayed at the start of the next run; survives restarts.
- "Clear memory" wipes the conversation but keeps run history.
