# Provider connection failures

- A run that cannot reach its model provider stores an error naming the provider and its base URL, e.g. `Unable to connect to model provider "Lab" (http://llm.example.com:8080/v1): getaddrinfo ENOTFOUND llm.example.com — the host could not be resolved`.
- The provider SDK collapses every transport failure to the fixed text `Connection error.`; the real reason is read from the wrapped `cause` chain, walking at most a few levels.
- Classification by error code: `ENOTFOUND`/`EAI_AGAIN` host could not be resolved, `ECONNREFUSED` connection refused, `ETIMEDOUT`/`ECONNABORTED`/abort timed out, `ECONNRESET`/`EPIPE` connection reset, `ENETUNREACH`/`EHOSTUNREACH`/`ENETDOWN` host unreachable, certificate codes TLS handshake failed.
- An HTTP status on the error is reported instead: 401/403 check the provider API key, 429 rate limited, 404 model or endpoint not found, anything else as the bare status.
- When nothing matches, the stored error is the original message unchanged — classification never invents a reason.
- Stored text is scrubbed: API keys and `Authorization` values are replaced, and the message is length-capped. Headers and response bodies are never included.
- Only the error text changes; run status handling and terminal states are unchanged (`../runs/lifecycle.md`).
