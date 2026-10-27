# Bot archive

- Archiving retires a bot without deleting it: everything (settings, triggers, runs, messages, workspace) is kept (`registry.md`) and the flag is part of config export (`../settings/config-backup.md`).
- `Archive` joins the pinned action row beside Delete in the General tab; it needs no confirm — unarchive is one click away (`../bots/detail.md`).
- An archived bot behaves as disabled: triggers do not fire, chat sends and run-now are rejected 409, its watchdog does not measure (`watchdog.md`, `../triggers/enable-disable.md`); a running loop is stopped first with the usual Stop confirm.
- Archived bots leave the default dashboard; cards reappear under an `Include archived` filter toggle, rendered muted with an `Archived` badge and their sleeping avatar pose (`avatars.md`).
- Search covers archived bots in a separate group; opening one lands on its detail modal where Unarchive is offered — never silently on chat.
- Unarchiving restores the card but always leaves the bot disabled: it resumes only after an explicit enable, so nothing fires by surprise.
- API: `POST /api/bots/:id/archive` and `/unarchive`; `GET /api/bots` omits archived rows unless `?archived=1`, and the flag is on the bot row.
