# Token usage

- Every model request reports input, output, cache-read and cache-write tokens; a run records the sum of its requests plus a total.
- Input is uncached prompt tokens. Cache-read and cache-write are separate and are never folded into input or output.
- Missing provider counts are zero. A failed run keeps usage from requests that completed.
- Usage is provider-reported, never estimated from text.
- Lifetime and trailing-30-day totals persist across restarts, independent of the last-50 run history.
- The bot's `Stats` tab shows lifetime and trailing-30-day totals for input, output, cache read, cache write and total.
