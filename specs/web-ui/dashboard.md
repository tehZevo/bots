# Bots dashboard

Single-page console for operating bots; any client that can reach the API may operate all bots.

- A status bar stretches across the very top of the app, above the sidebar, showing the total number of bots and how many are active/running (e.g. `4 total · 1 running`), refreshed by the same polling as the cards. The current screen's title sits at the upper-left of the main pane (see `navigation.md`).
- Bots tab (default view): a card per bot showing its name with status as a colored circle in the card's upper-right corner using the health levels of `status-colors.md` — red when erroring or blocked (operationally, or by the agent reporting level `blocked`), yellow while the agent reports issues, green otherwise. On desktop, hovering the circle reveals its meaning. Creating a bot adds a card; selecting a card opens that bot's detail modal (see `bot-detail.md`).
- Above the cards sit a search field (case-insensitive substring match on bot name) and status filter buttons `All` / `Running` / `Enabled` / `Disabled`; both filters combine, with an empty "no matches" state. Filtering is client-side over the polled list.
- Create a bot via the "Add bot" modal on the bots tab (see `create-bot.md`) — name, optional system prompt, optional role.
- Detail modal contents are specified in `bot-detail.md` (General / Triggers / Logs tabs).
- The logs tab shows run history (status + output/error); the view refreshes by polling the API.
- Works on phones and desktops: single-column layout below tablet width — navigation moves behind a hamburger menu (see `navigation.md`), modals span the screen, and controls are touch-sized. No horizontal scrolling at 360px wide.
- The server serves the built UI from its own origin; in dev Vite proxies `/api` → `:8787`.
