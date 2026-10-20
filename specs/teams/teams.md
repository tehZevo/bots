# Teams

- A team is a named grouping of bots — no user accounts, sign-in or ownership are involved (multi-user auth stays in the ROADMAP).
- Teams are created, renamed and deleted from a Teams view; deleting a team only removes the grouping, never its bots.
- Every bot may belong to any number of teams; adding or removing membership uses a multiselect with autocomplete, available both from the Teams view and from bot detail.
- A member within a team can be designated a leader; leaders are badged in the UI and the designation is editable per membership. What leaders may direct is defined by later specs.
- The Teams view lists teams as cards; each card shows the team name and a single status icon computed across its members by priority: blocked if any member is blocked, else issues if any has issues, else active if any is active, else idle if any is idle, and disabled only when every member is disabled. Each card also shows its member count in secondary italic (e.g. `9 bots`). Clicking a card opens a team config modal for renaming the team and adding/removing members.
- Teams are filterable by name or by a separate bots multiselect with autocomplete.
- Roles, providers and MCP servers stay global resources shared across teams.
