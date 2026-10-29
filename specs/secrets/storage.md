# Encrypted secret storage

- Secret values (`secrets/manage.md`), provider API keys (`llm/providers.md`) and the VAPID private key are encrypted at rest in SQLite with AES-256-GCM — a leaked database file or raw volume copy yields no plaintext credentials.
- The data encryption key comes from `SECRETS_KEY` (32 random bytes, hex): it lives outside the volume, so DB + backup alone is inert without it.
- Booting with encrypted rows but no usable `SECRETS_KEY` fails fast at startup listing which material cannot be decrypted; an install with no stored secrets starts keyless and encrypts on first save once the key is set — saving a secret, provider key or newly generated VAPID pair with no `SECRETS_KEY` configured returns an explicit error instead of storing plaintext.
- One-time migration: existing plaintext secrets, provider keys and the pre-feature `vapid.json` file are encrypted into SQLite automatically on boot when a `SECRETS_KEY` is present; nothing else rewrites them.
- Hashes stay unencrypted (sessions, API keys, device codes) — they are not reversible material anyway (`auth/multi-user.md`).
- Config backup export with values decrypts for the download and is explicitly user-initiated; an encrypted DB copy remains safe as a cold backup without the key.
- Rotating `SECRETS_KEY` is supported by starting once with `SECRETS_KEY_OLD` set alongside the new key, which re-encrypts all rows in place; there is no UI for rotation.
