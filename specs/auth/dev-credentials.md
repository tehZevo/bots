# Dev seed credentials

- With server env `DEV_SEED_AUTH=1`, boot idempotently seeds one account `dev@example.com` with password `devpassword` and one API key named `dev`, printing the full key once to the startup log (`multi-user.md`).
- Seeding is additive only: an existing user or `dev` key keeps its current state; turning the flag off removes nothing — it just stops re-seeding.
- The seeded account is a normal user: same visibility, sessions and revocable key as any other; no special rights, headers or bypasses exist anywhere in the request path.
- Identity switching for multi-user testing stays ordinary: create more accounts while `ALLOW_REGISTRATION=true`, or add keys via the API with the dev key — there is no impersonation header.
- The flag changes nothing else about auth: 401s, session expiry and registration gating behave exactly as specced; a production server with the flag accidentally on gains one known-password account, not an open door.
- Intended pairing for local development: `DEV_SEED_AUTH=1` + `DEV_FAKE_LLM=1` (`../llm/fake-provider.md`) give agents a keyless, credential-stable smoke path end to end.
