# In-app notifications

- The orchestrator records a notification when a run ends `error` or an approval is requested (`approvals`, future); each has kind, title referencing the bot, body and read flag.
- A bell (SVG icon button, per `../ui/visual-style.md`) in the status bar shows an unread-count badge; clicking opens a panel listing notifications newest-first with per-item mark-as-read and "Mark all read"; reading persists server-side per user. Unread items lead with emphasized titles and an accent marker while read items render muted; item actions are ghost buttons, at most one solid action (header) per panel; times show relative for today and absolute otherwise.
- New notifications reach open UIs live via the existing polling refresh cadence — no push channel required for the list itself.
- Native browser push through the PWA service worker activates once push subscriptions exist: on first authenticated load the app requests notification permission once (no Settings visit, no re-prompt after dismissal), delivers one silent push per new notification, tapping focuses the app; absent subscription or unsupported browser degrades silently. Settings shows current status and unsubscribe only.

# Notification sounds

- Playing a sound on new notifications is a Settings toggle (default off) with a `Preview` button; it applies while any app page is open, respecting this list.
- Each bot may set its own sound in detail General: none / default chime / one of a small built-in library (~6 short synth sounds); unset means the global default. Sounds are bundled static assets — no uploads; playback follows browser autoplay rules with no permission beyond an existing user interaction on the page.
