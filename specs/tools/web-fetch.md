# web_fetch

- GETs an absolute http(s) URL and returns status + body as text; HTML/XML has script/style/tags stripped.
- 30 s timeout, output capped at 8k chars with a truncation notice.
- A URL without an http(s) scheme is rejected.
- SSRF guard: a hostname that resolves to loopback, RFC1918/ULA private, link-local (including cloud metadata `169.254.169.254`) or unspecified addresses is refused with a "host not allowed" tool error — surfaced to the agent as a tool failure, never a crashed run.
- Every redirect hop is re-validated under the same guard (max 5 hops); IP literals are checked directly and DNS names are validated at connect time against the resolved address to blunt rebinding.
- Setting `BOTS_ALLOW_PRIVATE_NETWORK=1` disables the guard for trusted single-host deployments (all ranges allowed).
