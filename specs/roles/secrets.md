# Secret rotation confirmation

- Rotating a credential (provider API keys, webhook secrets) is destructive: it permanently invalidates the previous value for every caller.
- The UI therefore requires an explicit confirm dialog before rotating (`../ui/confirm.md`) — naming what rotates and warning that existing integrations break until updated.
- Rotation is only offered on deliberate user action; no automatic or implicit rotation path exists.
