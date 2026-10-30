# Templates

A template is a reusable bundle for starting a new bot: name, optional description, instructions, machine selection, role and starter triggers. Manage them under **Templates**.

## Editing templates

**Add template** opens an editor with fields for the bundle. Starter triggers are message/schedule pairs — add or remove rows as needed; schedules use the same cron and `@every` syntax as normal triggers ([Triggers & scheduling](/triggers-scheduling)). Webhook triggers cannot be templated.

The server requires a non-empty name, rejects duplicate names with `409`, and validates machine and role references when saving. If a saved template points at a deleted machine or role, the editor shows an inline warning so you can correct it before creating another bot from that template. Deleting a template removes only the bundle; bots created earlier remain untouched.

## Creating bots from templates

- **Save as template…** appears in a bot’s General tab. It copies the bot’s instructions, machine and role, plus current schedule triggers, into an editable draft named `<bot> template`.
- When at least one template exists, the **Add bot** dialog shows a **Template** dropdown. Choosing one prefills instructions, role and machine — everything stays editable before you press Create.
- Starter schedule triggers are created on the new bot after creation. The source template is not modified, and afterward the bot and template evolve independently.

Templates are available headlessly through `/api/templates`; see the [API reference](/api) for create and update payloads.
