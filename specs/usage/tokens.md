# Token usage

- Every model request reports input, output, cache-read and cache-write tokens; a run records the sum of its requests plus a total.
- Input is uncached prompt tokens; cache-read and cache-write stay separate and are never folded into input or output. Missing provider counts are zero, usage is provider-reported — never estimated from text — and a failed run keeps usage from completed requests.
- Lifetime and trailing-30-day totals persist across restarts, independent of the last-50 run history; the bot's `Stats` tab shows both windows for input, output, cache read, cache write and total.

# Token budgets

- A bot has an optional budget over the trailing 30 days in total tokens (input + output + cache read + cache write); unset means unlimited. The `Stats` tab shows progress and sets or clears it; changes apply to the next run.
- Usage at or above the budget before a run records `error("token budget exhausted")` without calling the model; a run reaching it mid-flight stops after the current turn with the same error, keeping completed requests' usage.
- Budget refusal is a blocked status (`../bots/status-colors.md`); raising or clearing the budget lets the next run proceed.
