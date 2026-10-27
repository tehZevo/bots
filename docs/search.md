# Search & commands

The status bar carries a **Search** control that opens one overlay for finding records and running common actions. The overlay is transient: opening or typing in it does not add browser history, and Escape or an outside click closes it.

## Find records

Type at least two characters; results refresh after the query settles. Matches are grouped by record type:

- **Bots** — name or instructions, with the assigned role shown beside the result.
- **Roles** — name or instructions.
- **Skills**, **Projects** and **Templates** — name or description.
- **Tags** and **Teams** — name, with the number of attached bots.

Matching is case-insensitive substring matching, not fuzzy search. Each group shows up to eight matches plus a count of any additional results; matched text is highlighted. Press Enter on a bot to open its chat sidebar, or Enter on another record to open its tab with that record's editor in place. Use ↑/↓ to move across groups and Tab to jump between result groups.

## Run commands

Start the query with `>` to switch from records to actions:

```text
> run Atlas
> stop Sable
> disable Researcher
> pause all
> new bot
> open teams
```

Command rows show live target state where available, such as a running indicator for a bot that can be stopped. Disabled commands stay visible with their reason but cannot be selected. `stop all` and global pause require confirmation; successful commands close the overlay, while failures remain open and display the error inline. The same ↑/↓/Enter/Tab keyboard model applies in both modes.
