# Creating a bot

- The Bots tab has an "Add bot" button; it opens a modal dialog for creation — the sidebar and drawer no longer carry a new-bot form.
- On open, the name field is prefilled with a random pick from the name pool: `Atlas` · `Juno` · `Marlow` · `Sable` · `Wren` · `Nova` · `Kestrel` · `Orbit` · `Tundra` · `Quill` · `Vesper` · `Bramble` · `Cinder` · `Dune` · `Ember` · `Flint` · `Gale` · `Harbor` · `Iris` · `Juniper` · `Kelp` · `Lyra` · `Onyx` · `Rowan` · `Sage` · `Cobalt` · `Indigo` · `Zenith` · `Zephyr` · `Lark`. Picks prefer names no existing bot uses; the field stays editable.
- Modal fields: name (required), instructions (optional textarea), role picker listing existing roles (optional). Buttons: Create and Cancel.
- Create validates, stores the bot (role included), closes the modal, and the new card appears on the Bots tab; Cancel or Escape closes without saving.
- Pool names are proper nouns rendered properly cased (e.g. `Cobalt`, not `cobalt`) — on the prefill, after shuffle, and everywhere bot names appear.
