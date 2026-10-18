# Bot Git authentication

- A bot may push from its sandbox using a repository-scoped credential the owner supplied for that bot alone; `gh` ships in the default sandbox image alongside git.
- The container's `HOME` is `/home/bot`, backed by a separate persistent per-bot volume outside `/workspace`, so dotfiles such as `~/.gitconfig` and gh auth files survive idle reaping but never enter the git working tree.
- Browser-driven OAuth/device flow is unavailable: the owner supplies a credential directly through the app, and there is no interactive browser step for the agent.
- The app installs the credential by piping its value into `gh auth login` over stdin, selecting HTTPS, and configuring gh's git credential helper so plain `git push` works without an authenticated remote URL.
- Credential values never appear in tool input or output, run messages/events, container environment variables (`GH_TOKEN`, `GITHUB_TOKEN`, etc.), command arguments, `.git/config`, or process listings visible to the model.
- The agent is told git authentication is preconfigured and that it must not try to authenticate by placing a token in the environment or passing one as an argv secret.
- Owners scope credentials at issuance: one repository and push-only access, with no account-level or unrelated-repository read granted; the app does not invent broader fallback permissions.
- No egress filtering applies to agent commands; outbound network is open for git and curl, and containment remains the container boundary (`sandbox.md`).
- The bot's shell is trusted with the credential because any command can read it without approval; security relies on scope, expiry, and revocation rather than prompt discipline.
- Revoking or expiring the provider credential immediately ends push ability. Clearing the local credential removes gh auth state from `/home/bot`; deleting the bot removes that store while leaving `/workspace` intact.
