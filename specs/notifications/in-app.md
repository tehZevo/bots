# In-app notifications

- The orchestrator records a notification when a run ends `error` or an approval is requested (`approvals`, future); each has kind, title referencing the bot, body and read flag.
- A bell in the status bar shows an unread-count badge; clicking opens a panel listing notifications newest-first with per-item mark-as-read and "Mark all read"; reading persists server-side per user.
- New notifications reach open UIs live via the existing polling refresh cadence — no push channel required for the list itself.
- Native browser push through the PWA service worker activates once push subscriptions exist: subscribe from Settings, deliver one silent push per new notification, tapping focuses the app; absent subscription or unsupported browser degrades silently.

# Notification sounds

- Playing a sound on new notifications is a Settings toggle (default off) with a `Preview` button; it applies while any app page is open, respecting this list.
- Each bot may set its own sound in detail General: none / default chime / one of a small built-in library (~6 short synth sounds); unset means the global default. Sounds are bundled static assets — no uploads; playback follows browser autoplay rules with no permission beyond an existing user interaction on the page.
