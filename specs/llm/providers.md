# LLM providers

- The server keeps a registry of OpenAI-compatible providers: display name, base URL, optional API key.
- Providers are added, edited and removed from the Settings tab; removal re-points the default at another configured provider when one remains.
- Each provider lists its model ids. A `Detect models` action fetches `<base>/models`; the user picks from the returned list or types an id manually either way. Detection failure shows an error and manual entry stays available.
- Exactly one provider + model pair is the default; every agent run uses it while a bot has no explicit model choice of its own.
- Providers and the default persist on the server across restarts and apply to subsequent runs without a restart.
- `LLM_BASE_URL` / `LLM_MODEL` env vars act as the implicit provider until any provider is configured, then the registry wins.
- API keys stay server-side: they never reach bot containers, run output, or logs; key fields render masked after save.
