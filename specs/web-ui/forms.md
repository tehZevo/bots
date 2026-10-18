# Modal forms

- Every field in a modal form stacks vertically: label on its own line above the control, the control spanning the full dialog width; no inline labels floating to the left of half-width inputs. Row spacing is uniform and buttons sit below the last field.

# Form sizing

- All multi-line text inputs have fixed dimensions: they never grow with typed content and do not offer a manual resize handle; overflow scrolls inside the box.
- Fixed heights keep modal sizes predictable (see `bot-detail.md` constant-size rule); long values remain reachable by scrolling within the field.

# Dirty-state save buttons

- Save buttons in edit forms (bot General tab, role and skill editors) are disabled until the form differs from its loaded values; saving an unchanged form is a no-op users should never be able to trigger.
- Once dirty, Save enables; reverting every field back disables it again without needing a reload.

