# PWA install

The web UI is an installable progressive web app. It uses a manifest with the **Bots** name, application icons and standalone display mode; installing simply creates a normal native launcher entry for your platform.

Installation depends on the browser:

- Desktop Chrome or Edge usually offers an **Install** icon in the address bar.
- Android browsers commonly offer **Add to Home screen**.
- iOS Safari uses **Share → Add to Home Screen**.

An installed window opens without ordinary browser chrome while keeping the same login session and app behavior as a normal tab.

## Offline shell

In production builds, a service worker registers after the first page load and caches the built application shell and assets. API requests are deliberately not cached, so data remains fresh when the server is reachable. When you revisit offline, navigation falls back to the cached shell; pages show their normal empty or error states instead of breaking completely.

A new deployment replaces the cached shell on the next app load — there is no forced reload prompt. Browser push subscriptions and notification controls are separate from installation and are described in [Notifications](/notifications).
