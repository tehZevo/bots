# CLI raw API command

- `bots api METHOD PATH [--data JSON|--file -|path] [--header KEY=VALUE ...] [--raw]` sends one authenticated request to the configured server.
- PATH is absolute and begins with a single `/`; `//host` and absolute URLs are rejected with exit 2 so a request can never leave the configured origin.
- The CLI adds `Authorization: Bearer <stored key>` and `Content-Type: application/json` when a body exists; explicit `--header` values override the defaults.
- `--data` and `--file` are mutually exclusive. Bodies are allowed only for POST, PUT and PATCH; malformed JSON or a body on another method exits 2 without sending.
- The response body is pretty-printed JSON by default; `--raw` writes the bytes unchanged. Non-JSON responses are printed as text.
- `api` maps statuses to the standard exit codes in `output.md` and prints the server's `error` field on failure.
- `api` is the escape hatch for `/mcp`, `/api/openapi.json` and any route without a dedicated wrapper; it never bypasses server authentication or validation.
- Redirects are not followed; 3xx responses are reported as errors.
