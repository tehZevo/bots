# Editors & unsaved changes

Every form with an explicit **Save** or **Create** action — modal forms, a bot's General tab, the trigger editor, and the Settings sandbox idle timeout — tracks dirty state against the values it loaded (create forms compare against their initial prefill). Fields that persist immediately, like the bot enable toggle or team membership, are never dirty.

- While a form has unsaved edits it shows *Unsaved changes* beside its primary action; reverting every field clears the label.
- The General tab's **Save** and the trigger editor's **Save** stay disabled until something actually differs from the loaded values — saving an unchanged form is never possible. Other edit forms keep Save always enabled.
- A failed save keeps the form open and dirty with the error shown.
- Leaving a dirty form asks first: closing it (button, Escape or outside tap), Cancel, switching sidebar tabs, opening another bot or resource, or browser back/forward. The dialog reads **“Discard unsaved changes to …?”** with **Keep editing** (also what Escape does) and a danger **Discard changes** that drops the edits without sending anything.
- A pristine form closes and navigates immediately; nested confirmations and pickers above an editor don't count as leaving; tabs that share one form (a role's General / MCP / Skills tabs) switch freely.
- Reloading or closing the browser tab while dirty triggers the browser's native leave-page prompt.
