# Global search

- The status bar carries a Search control opening an overlay: one input plus grouped live results; Escape or outside click closes it (`../bots/dashboard.md`, `navigation.md`).
- Groups cover bots (name, instructions), roles (name, instructions), skills, Projects, tags, teams and templates (name + description fields): case-insensitive substring matching — no fuzzy ranking.
- Queries hit the server only after 2 characters settle (~300 ms); each group caps at 8 matches; a truncated group shows how many more matched.
- Rows show entity name plus kind-specific context (role on bots, bot count on tags/teams, description preview elsewhere) with the matched substring highlighted.
- Choosing a result navigates: bots open their chat sidebar (`../chat/sidebar.md`), other entities open their tab with that record's edit modal in place; overlay state is not part of browser history.
- Keyboard-first: up/down move selection across groups, Enter opens, Tab cycles groups; the overlay traps focus while open and returns it on close.
- API: `GET /api/search?q=...&types=bots,roles,...` returns grouped results `{ type, id, name, subtitle }`; any signed-in user may search (`../auth/multi-user.md`). Tags stay invisible to bots — search is a human surface only (`../tags/tags.md`).
- Empty query and no-match states are single muted lines; runs and messages are out of scope for v1.
- Command mode: a leading `>` switches the overlay from results to actions (`command-palette.md`).
