# Notifications

The bell in the status bar collects events that need attention. A run ending with `error` creates one notification for its bot.

Opening the bell shows notifications newest first, each with the bot and error details plus when it happened. Individual items can be marked read, or use **Mark all read**. Read state persists server-side, so refreshing the page does not bring it back.

The open UI receives new notifications through its normal polling refresh; no separate push connection is required for the in-app list.
