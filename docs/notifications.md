# Notifications

The bell in the status bar collects events that need attention. A run ending with `error` creates one notification for its bot.

Opening the bell shows notifications newest first, each with the bot and error details plus when it happened. Individual items can be marked read, or use **Mark all read**. Read state persists server-side, so refreshing the page does not bring it back.

The open UI receives new notifications through its normal polling refresh; no separate push connection is required for the in-app list.

## Sounds

Settings → **Notification sounds** (off by default) plays a short chime when a new notification arrives while any app page is open; a Preview button lets you hear it before enabling. A bot can pick its own sound — none, the default chime, or one of six built-in synth sounds — in the bot's General tab; bots without a pick follow the global default. Sounds are bundled with the app and obey browser autoplay rules: the first sound plays after any interaction on the page.
