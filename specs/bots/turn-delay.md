# Turn delay

- A bot may carry a turn delay: the number of seconds the agent loop waits between one turn finishing and the next turn starting.
- The delay is stored per bot (`registry.md`), defaults to 0 (no delay), and applies to every turn of the loop, including the first one after a run starts.
- While the loop waits, the bot stays `running` and its current task shows the waiting state; the delay never applies between a run and the next run.
- The delay is editable in the bot detail `General` tab; values are whole seconds from 0 to 3600, and anything else returns 400 with an error message.
- A run's duration includes the delays, and an interrupted run stops waiting immediately (`interrupt.md`).
