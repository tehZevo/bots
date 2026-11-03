# Multiselect

- The app has exactly one multiselect control, used everywhere several choices come from one list: dashboard filters, inbox filters, bot tags, teams and secrets pickers. No screen rolls its own checkbox list or chip input.
- Collapsed it is a button reading `<label>: All` with nothing chosen and `<label>: <comma-joined names>` otherwise. The summary truncates with an ellipsis and carries the full text as a tooltip.
- Activating it opens a panel of checkbox rows, one per option, in the order supplied. Activating it again closes the panel.
- The panel closes on a press outside it, on focus leaving it, and on Escape. Closing never changes the selection.
- Unless the option list is short and fixed, the panel opens with a text field filtering the list by case-insensitive substring of the option name; narrowing the list never changes the selection. Fixed short lists (bot status, inbox kind) omit the field.
- Ticking or unticking a row reports the whole new selection at once: the control holds no draft state and needs no confirm step.
- Where the caller allows new options, text matching no existing name exactly replaces the empty result with a single `+ Create "<name>"` action, and Enter performs the same commit. A create that fails leaves the text in place to be corrected.
- With the filter showing exactly one option, Enter selects it; an already-selected option is left alone.
- While a save is in flight the control is disabled: rows grey out and ignore input.
