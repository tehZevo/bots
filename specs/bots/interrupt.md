# Interrupt

- A bot whose loop is active (`running`) can be interrupted at any time; `POST /api/bots/:id/interrupt` aborts the in-flight inference request and stops the loop from taking further turns.
- The UI exposes this as a **Stop** button inside the bot detail modal, shown only while the bot's status is `running`.
- An interrupted run reaches terminal status `error` with error `interrupted`; messages produced up to that point are kept in context.
- Interrupting an idle bot is a no-op and returns `{ "stopped": false }`; interrupting a live loop returns `{ "stopped": true }`.
- The interrupted run's `error` result must not keep the bot looking Blocked once work resumes: any new chat message (or trigger fire) accepted by an interrupted bot restarts its loop and the bot reports Active while that run works; the Blocked cue clears with the new run, without waiting for manual refresh.
