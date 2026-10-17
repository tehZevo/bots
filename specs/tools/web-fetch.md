# web_fetch

- GETs an absolute http(s) URL and returns status + body as text; HTML/XML has script/style/tags stripped.
- 30 s timeout, output capped at 8k chars with a truncation notice.
- A URL without an http(s) scheme is rejected.
