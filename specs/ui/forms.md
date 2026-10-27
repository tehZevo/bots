# Modal forms

- Every field in a modal form stacks vertically: label on its own line above the control, the control spanning the full dialog width; no inline labels floating to the left of half-width inputs. Row spacing is uniform and buttons sit below the last field.
- A composite value with a unit or mode word (e.g. `Watchdog hours` + number, sandbox timeout + `minutes`) renders as one bordered control with the unit inside its trailing edge; a bare label-plus-small-input row is never used.
- Action rows align right: secondary actions (Cancel) in ghost styling left of the single solid primary (`Create`/`Save`); Delete/danger actions sit at the far right or bottom, never styled primary.
- Every group of fields inside a dialog or detail tab carries its section label — `Projects`, `Tags`, etc. — with identical size and casing; no field group appears unlabeled while its neighbors are labeled.

# Form sizing

- All multi-line text inputs have fixed dimensions: they never grow with typed content and do not offer a manual resize handle; overflow scrolls inside the box.
- Fixed heights keep modal sizes predictable (see `../bots/detail.md` constant-size rule); long values remain reachable by scrolling within the field.

# Dirty-state save buttons

- Every saveable form tracks dirty state and guards navigation per `unsaved-changes.md`.
- The bot detail `General` tab's Save button is disabled until Name, Instructions, role, machine or Projects differs from the loaded values; reverting every field back disables it again. Trigger editor Save follows the same rule. The Stats budget Save follows the same rule. Saving an unchanged form is never possible.
- Other edit forms keep plain always-enabled Save while still showing the unsaved-changes indicator.

