# Random name shuffle

- The Add bot dialog (`create.md`) shows a circular-arrows icon button beside the prefilled name; clicking re-rolls another random name from the curated pool, different from the current one.
- Re-rolling never fights the user: if the name field was manually edited since the last roll, the button reverts to the current pool-suggestion behavior only after the field returns to unedited state; edits are never silently replaced mid-typing.
- Pool exhaustion degrades gracefully (repeat with any pool ≥ 2 names); with fewer, the button hides itself.
