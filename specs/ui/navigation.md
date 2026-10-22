# Navigation

- A persistent left sidebar on desktop carries the tabs in this order — `Bots`, `Teams`, `Roles`, `Machines`, `Integrations`, `Skills`, `Templates`, `Projects`, `Tags`, `Settings`; the main area shows the selected tab. Bot settings open as a modal over the main area (`../bots/detail.md`).
- The sidebar and the mobile drawer hold exactly the tab list: each tab name appears there once, as a tab.
- Every tab carries a meaningful icon from a free source (open-licensed set or custom inline SVG): `Bots` a robot/cube mark, `Roles` a badge/mask mark, `Integrations` a plug/puzzle mark, `Settings` an unmistakable cogwheel — a closed circular rim with evenly spaced teeth and a hollow hub; radial-spoke or asterisk-like marks do not read as gears. Expanded tabs show icon + label; the drawer shows them too.
- Every main screen titles itself with its tab name at the upper-left of the main pane, with that tab's actions aligned to the right on the same row.
- The sidebar collapses via a toggle control: collapsed, it is a slim rail showing only each tab’s icon — no text other than tooltips — with the active one marked, and tapping any icon selects the tab or expands the labels; expanded, it shows full tab names beside their icons. The choice persists across sessions.
- Below tablet width the sidebar is replaced by a hamburger button in the top bar; tapping it opens an overlay drawer holding the same tabs, which closes on selecting a tab or tapping outside it.
- The active tab is visually marked.
- Selecting a different tab while a saveable form is dirty asks to discard first (`unsaved-changes.md`); Keep editing leaves the current tab selected.
- Each tab owns a URL path — `/bots`, `/teams`, `/roles`, `/machines`, `/integrations`, `/skills`, `/templates`, `/projects`, `/tags`, `/settings`. Selecting a tab updates the browser history so back/forward walk between tabs; opening or reloading one of these paths lands directly on that tab, with `/` showing Bots. The server answers unknown non-API paths with the app shell so deep links survive reload.
