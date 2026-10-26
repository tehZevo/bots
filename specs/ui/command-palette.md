# Command palette

- The global search overlay doubles as a command palette: a leading `>` switches from entity results to action matching (`search.md`); toggling modes clears the other's state and they never mix in one list.
- Actions cover quick bot ops and navigation — `run <bot>`, `stop <bot>`, `enable <bot>`, `disable <bot>`, `pause all`, `resume all`, `stop all`, `new bot`, `open <tab>` — matched by substring on name; no aliases, no fuzzy ranking.
- Enter executes against the current server state via existing endpoints (`../bots/run-now.md`, `../bots/interrupt.md`, `../bots/global-pause.md`, `../bots/emergency-stop.md`) with no new API; rows show the target's live status where known (e.g. running dot for stoppable bots).
- Destructive commands (`stop all`, global pause) run through the confirm dialog (`../ui/confirm.md`); results close the overlay, and a failed command surfaces its error inline instead of closing.
- `>` alone lists every available action; disabled ones (e.g. `stop <bot>` on an idle bot) render muted with the reason, unselectable.
- Keyboard model is shared with search: same up/down/Enter/Tab behavior; Escape returns to empty-query results mode before closing.
