# Resource tabs

The registry tabs — `Roles`, `Machines`, `Integrations`, `Skills`, `Templates`, `Projects`, `Tags`, `Secrets` — share one shape; a resource spec states only where it differs.

- The tab follows the sidebar, drawer, title and icon rules of `navigation.md`.
- Resources list as cards (name plus a short preview). Add opens a modal form per `forms.md`; Edit reopens it prefilled; Delete sits behind the confirm dialog (`confirm.md`).
- Invalid input returns 400 with an error message. CRUD goes through `/api/<resource>` and records persist on the server across restarts.
- References between resources use ids, so duplicate display names are allowed unless a resource spec requires unique ones.
