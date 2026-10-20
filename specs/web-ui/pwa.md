# PWA

- The web UI is installable: a manifest with app name, icons and standalone display, registered from every page.
- A service worker precaches the built app shell; offline visits serve the shell and show the normal empty/error states for API calls instead of breaking.
- Cached shell updates activate on next load after a new deploy; no forced reload prompt.
- Push delivery, subscription and Settings controls are specified in `notifications/in-app.md`.
