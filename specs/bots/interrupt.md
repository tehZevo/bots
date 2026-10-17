# Interrupt

- A bot whose loop is active (`running`) can be interrupted at any time; `POST /api/bots/:id/interrupt` aborts the in-flight inference request and stops the loop from taking further turns.
- The UI exposes this as a **Stop** button inside the bot detail modal, shown only while the bot's status is `running`.
- An interrupted run reaches terminal status `error` with error `interrupted`; messages produced up to that point are kept in context.
- Interrupting an idle bot is a no-op and returns `{ "stopped": false }`; interrupting a live loop returns `{ "stopped": true }`.
