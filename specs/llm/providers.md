# LLM providers

- The server keeps a registry of OpenAI-compatible providers: display name, base URL, optional API key.
- Providers are added, edited and removed from the Settings **Providers** tab; removal re-points the default at another configured provider when one remains.
- Each provider lists its model ids. A `Detect models` action fetches `<base>/models`; the user picks from the returned list or types an id manually either way. Detection failure shows an error and manual entry stays available.
- Exactly one provider + model pair is the default; every agent run uses it while a bot has no explicit model choice of its own.
- Providers and the default persist on the server across restarts and apply to subsequent runs without a restart.
- The Settings Providers tab owns provider registration, available model ids, and the server default. A bot's General tab may pin any model from that provider via `model_id`; clearing restores the default. Provider, base URL, and API-key configuration stay in Settings.
- A run started with no usable model fails fast and its row records `error("no model configured")`.
- API keys stay server-side: they never reach bot containers, run output, or logs; key fields render masked after save.
- With `DEV_FAKE_LLM=1` a keyless built-in Fake provider exists for development (`fake-provider.md`).
