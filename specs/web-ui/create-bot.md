# Creating a bot

- The Bots tab has an "Add bot" button; it opens a modal dialog for creation — the sidebar and drawer no longer carry a new-bot form.
- On open, the name field is prefilled with a random pick from the name pool: `atlas` · `juno` · `marlow` · `sable` · `wren` · `nova` · `kestrel` · `orbit` · `tundra` · `quill` · `vesper` · `bramble` · `cinder` · `dune` · `ember` · `flint` · `gale` · `harbor` · `iris` · `juniper` · `kelp`. Picks prefer names no existing bot uses; the field stays editable.
- Modal fields: name (required), system prompt (optional), role picker listing existing roles (optional). Buttons: Create and Cancel.
- Create validates, stores the bot (role included), closes the modal, and the new card appears on the Bots tab; Cancel or Escape closes without saving.
