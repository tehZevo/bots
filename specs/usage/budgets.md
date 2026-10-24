# Token budgets

- A bot has an optional token budget over the trailing 30 days, measured in total tokens (input + output + cache read + cache write); unset means unlimited.
- The `Stats` tab shows budget progress and lets the user set or clear the budget; changes apply to the next run.
- Before a run starts, usage at or above the budget records `error("token budget exhausted")` without calling the model.
- A run that reaches the budget stops after the current turn with `error("token budget exhausted")`; completed requests keep their usage.
- Budget refusal is a blocked status (`../bots/status-colors.md`); raising or clearing the budget lets the next run proceed.
