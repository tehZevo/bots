# Unsaved changes

- Every editor with an explicit Save or Create action — modal forms, the bot detail `General` tab, the Stats budget field, the trigger editor, and the Settings idle-timeout field — tracks dirty state by comparing its saveable values with the snapshot loaded when it opened or last saved; create forms use their initial prefill as the snapshot. Fields that persist immediately, such as the bot enable toggle, are not dirty.
- While dirty, the form shows `Unsaved changes` in its action row beside the primary action. The label clears when every saveable value matches the snapshot again and after a successful save.
- A save that fails validation or whose request fails keeps the form open and dirty with the error shown.
- Leaving dirty state asks first: close button, Escape, outside tap, Cancel, switching main navigation tabs, opening another bot or resource, selecting another item in a master/detail editor, or browser back/forward.
- Leaving a pristine form performs the same action immediately with no dialog.
- The dialog reads `Discard unsaved changes?` and names the affected object or setting, with a neutral `Keep editing` default and a danger `Discard changes` action; Escape and outside taps mean Keep editing.
- `Discard changes` drops the pending edits and completes the attempted navigation or close without sending a request; `Keep editing` leaves the form, its values, and the current tab and history in place.
- Switching tabs asks first when the switch would unmount a dirty editor; tabs that share one form and keep its values, such as the role `General` / `MCP` / `Skills` tabs, switch freely. Opening a confirmation, picker, or other nested dialog above the editor does not count as leaving either.
- Saving never triggers the dialog; after success the snapshot becomes the saved values and the form's normal save behavior applies.
- Browser reload or window close while dirty uses the browser's native leave-page prompt; the custom dialog covers in-app navigation only.
- Only one discard dialog exists at a time, rendered above the editor; it is local-only and never sends an API request.
