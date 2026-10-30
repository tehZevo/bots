# Theme

- The `Settings` tab (see `navigation.md`) presents the theme as a button group — three joined, mutually exclusive buttons `Light | Dark | System` in one segmented control with the active choice visibly pressed; clicking applies immediately. Dark is the default.
- The choice persists per device (localStorage) and applies immediately to every view; "System" follows the OS preference live while selected.
- No flash of the wrong theme on load: the saved preference is applied before first paint.
- Both themes keep all existing views legible — cards, runs, triggers, forms, and status colors included.
