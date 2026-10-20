# Teams

- A team is a named grouping of bots, independent of user accounts.
- Teams are created, renamed and deleted from a Teams view; creating opens a modal like create-bot (name plus member/leader pickers), deleting only removes the grouping, never its bots.
- Every bot may belong to any number of teams; adding or removing membership uses a multiselect with autocomplete, available both from the Teams view and from bot detail. The create/edit team modal has two separate multiselects — one for leaders and one for members — rather than a member list with leader checkboxes.
- A member within a team can be designated a leader; leaders are badged in the UI and the designation is editable per membership. What leaders may direct is defined by later specs.
- Member, leader and project changes in the modal are not applied until Save is pressed.
- The Teams view lists teams as cards; each card shows the team name and a single status icon computed across its members by priority: blocked if any member is blocked, else issues if any has issues, else active if any is active, else idle if any is idle, and disabled only when every member is disabled. Each card also shows its member count in secondary italic (e.g. `9 bots`). Clicking a card opens a team config modal for renaming the team and adding/removing members.
- Teams are filterable by name or by a separate bots multiselect with autocomplete.
- A team may attach Projects; all members inherit them (`projects/projects.md`).
- Roles, providers and MCP servers stay global resources shared across teams.
