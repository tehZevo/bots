# Notifications

The bell in the status bar collects events that need attention, including run failures and server alerts such as a tripped spend circuit breaker ([what the breaker does](/bots#lifecycle)).

Opening the bell shows notifications newest first, each with the bot and error details plus when it happened.

Clicking an unread item in the panel marks it read; a browser push click closes that notification and focuses an open app window (or opens the app root if none exists). Individual items can be marked read, or use **Mark all read**. Read state persists server-side, so refreshing the page does not bring it back.

The open UI receives new notifications through its normal polling refresh; no separate push connection is required for the in-app list.

## Sounds

Settings → **General** → **Notification sounds** (off by default) plays a short chime when a new notification arrives while any app page is open; a Preview button lets you hear it before enabling. A bot can pick its own sound — none, the default chime, or one of six built-in synth sounds — in the bot's General tab; bots without a pick follow the global default. Sounds are bundled with the app and obey browser autoplay rules: the first sound plays after any interaction on the page.

## Browser push

On first sign-in, the app asks once for browser notification permission and subscribes this device automatically (works in supported browsers, including when the site is installed as a [PWA](/pwa)). Dismissing the prompt does not nag on later visits; change the browser's site permission manually to opt back in. Settings → **General** → **Browser push** shows exactly one state and recovery control — **Unsubscribe** while subscribed, or **Retry** after a failed registration — never both. Outdated client subscriptions are removed automatically before retrying; choosing Retry may request permission again. Each new notification then delivers one silent system notification even when no tab is open; clicking it marks the notification read and opens its source, signing in first on a cold start. Back returns where you were. Browsers without push support simply don't show the controls — everything else keeps working.
