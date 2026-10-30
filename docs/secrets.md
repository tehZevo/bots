# Secrets

A secret is an environment variable stored centrally, injected into selected bot sandboxes when their containers start, and redacted from persisted tool output. Manage them under **Secrets**.

## Managing secrets

Cards show only a name and the environment-variable key — never the value. **Add secret** requires:

- **Name** — unique human label.
- **Env var key** — letters, digits and underscores; it may not start with a digit.
- **Value** — required when creating the record.

Opening an existing card lets you rename it or change its env-var key. The saved value stays masked: choose **Show** to fetch it into the field for review, then leave it unchanged to preserve it or type a replacement before saving. Deleting asks for confirmation and warns that running sandboxes must be restarted before they stop seeing the variable.

## Storage and rotation

Values are encrypted in SQLite with AES-256-GCM using `SECRETS_KEY`; provider API keys and VAPID push credentials use the same protection. The database file alone yields no plaintext credentials. Set `SECRETS_KEY_OLD` beside a new key for one restart to rotate all stored material without a UI action.

Without a key the app still boots: values written before encryption keep working unencrypted, and saving a secret or provider key answers an explicit error until you configure `SECRETS_KEY`. Add it once and the next boot encrypts everything stored — including legacy push credentials — in place. Once rows are encrypted the key is mandatory at startup; a missing or wrong one fails fast listing what cannot be decrypted, so keep it somewhere safe outside the data volume.

## Assignment and injection

Once at least one secret exists, a bot’s General tab shows a checkbox for each one; toggling attaches or detaches it immediately. An assigned secret is passed to that bot’s sandbox as an environment variable named by its key. The value never enters the system prompt, trigger message or chat input — the agent sees only the environment variable when it runs shell commands.

A bot also inherits secrets attached to teams it belongs to. If both a team and the bot attach values for the same env-var key, the bot’s own assignment wins. Existing containers keep their original environment until they are restarted; **Restart machine** recreates them with the current assignments.

## Redaction

Before tool results are stored or replayed, exact matches of assigned secret values — and provider API keys plus declared MCP environment values — are replaced with placeholders such as `[REDACTED:GITHUB_TOKEN]`. Only values at least eight characters long are matched; system prompts and your own chat text are not rewritten. Managed secrets apply only when attached to the bot, so an unassigned secret’s value may legitimately appear in output if a command prints it.

## API

Secret records are managed through `/api/secrets`; request shapes, value access and assignment fields live in the [API reference](/api#secrets).
