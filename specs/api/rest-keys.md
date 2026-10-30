# REST API and API keys

- The entire UI surface is available headlessly as a documented REST API under `/api`: the same routes the web client uses, with OpenAPI documentation served at `/api/openapi.json` and linked from Settings.
- Per-user API keys authenticate it: created/revoked in Settings’ **System** tab (`Name`, createdAt, lastUsedAt), value shown once as `bots_` + 40 hex chars, stored hashed server-side.
- A request is authenticated by session cookie or `Authorization: Bearer <api key>`; key-authenticated requests carry the key-owner's access — currently all users share full visibility (`auth/multi-user.md`) until an ownership model lands.
- Creating a key requires a name; revoked keys fail 401 like unknown ones; lastUsedAt updates at most once per minute to avoid write churn.
- Key management is session-only: `GET/POST /api/api-keys` and `DELETE /api/api-keys/:keyId` reject Bearer-authenticated requests with `403 {"error":"session authentication required"}` — a stolen key can neither mint replacement keys (self-persistence) nor enumerate or revoke the owner's others.
- Device-flow approval remains the session-side path for creating keys (`auth/device-login.md`); it is unaffected by the Bearer restriction.
