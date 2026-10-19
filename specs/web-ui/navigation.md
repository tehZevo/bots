# Navigation

- A persistent left sidebar on desktop carries the tabs — `Bots`, `Roles`, `Integrations`, and `Settings`; the main area shows the selected tab. Bot detail opens as a modal over the main area (see `bot-detail.md`).
- The sidebar and the mobile drawer hold exactly the tab list: each tab name appears there once, as a tab.
- Every tab carries a meaningful icon from a free source (open-licensed set or custom inline SVG): `Bots` a robot/cube mark, `Roles` a badge/mask mark, `Integrations` a plug/puzzle mark, `Settings` an unmistakable cogwheel — a closed circular rim with evenly spaced teeth and a hollow hub; radial-spoke or asterisk-like marks do not read as gears. Expanded tabs show icon + label; the drawer shows them too.
- Every main screen titles itself with its tab name at the upper-left of the main pane — `Bots`, `Roles`, or `Settings` — with that tab's actions aligned to the right on the same row (see `dashboard.md`).
- The sidebar collapses via a toggle control: collapsed, it is a slim rail showing only each tab’s icon — no text other than tooltips — with the active one marked, and tapping any icon selects the tab or expands the labels; expanded, it shows full tab names beside their icons. The choice persists across sessions.
- Below tablet width the sidebar is replaced by a hamburger button in the top bar; tapping it opens an overlay drawer holding the same tabs, which closes on selecting a tab or tapping outside it.
- The active tab is visually marked.
- Each tab owns a URL path — `/bots`, `/roles`, `/machines`, `/integrations`, `/skills`, `/templates`, `/settings`. Selecting a tab updates the browser history so back/forward walk between tabs; opening or reloading one of these paths lands directly on that tab, with `/` showing Bots. The server answers unknown non-API paths with the app shell so deep links survive reload.
