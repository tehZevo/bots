# In-app notifications

- The orchestrator records a notification when a run ends `error` or an approval is requested (`approvals`, future); each has kind, title referencing the bot, body and read flag.
- A bell in the status bar shows an unread-count badge; clicking opens a panel listing notifications newest-first with per-item mark-as-read and "Mark all read"; reading persists server-side per user once auth exists, globally until then.
- New notifications reach open UIs live via the existing polling refresh cadence — no push channel required for the list itself.
- Native browser push through the PWA service worker activates once push subscriptions exist: subscribe from Settings, deliver one silent push per new notification, tapping focuses the app; absent subscription or unsupported browser degrades silently.
