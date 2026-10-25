# Transcript secret redaction

- Before any tool result is persisted or replayed to the model, exact matches of secret values are replaced with a `name` placeholder: managed secrets assigned to the bot (directly or via teams), provider API keys, and declared MCP env values (`../mcp/child-env.md`, `../secrets/manage.md`).
- Redaction covers tool-result text only — shell output, web_fetch bodies, MCP tool results; system prompts and user chat input are never rewritten.
- The placeholder is the secret's name (e.g. `[REDACTED:GITHUB_TOKEN]`), not asterisks, so the model keeps reasoning about which credential was involved.
- Matching is exact on values of at least 8 characters; shorter or empty values are skipped to avoid mangling ordinary text.
- Redaction happens once at commit time (`../runs/crash-recovery.md`); stored transcripts and chat renders contain no plaintext secrets, and the sandbox itself is never modified.
- A value that changed mid-run redacts under its current stored value only; superseded historical values are not hunted down.
- Redaction failure never blocks a turn: on any error the original text commits unchanged rather than dropping content.
- Provider keys and MCP env values are redacted for every bot regardless of grants; managed secrets apply per assignment so an unassigned secret's value may legitimately appear in output.
