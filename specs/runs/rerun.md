# Re-run from transcript

- Every user-message step in a run's replay offers `Run this`: it starts a fresh run on the same bot with that exact message (`../bots/run-now.md`), leaving history untouched (`drill-down.md`).
- The action is disabled while the bot is running — injection into the live loop stays trigger/chat behavior (`../runs/lifecycle.md`), never a hidden steer.
- Runs started this way carry source `manual`; the original run gains no marker or link.
- Tool-result and assistant steps offer copy-to-clipboard only; there is no edit-and-run in v1.
