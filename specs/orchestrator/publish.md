# Publishing container images

- Every merge to `master` builds the single orchestrator image (see `docker.md`) in CI and pushes it to `ghcr.io/<owner>/bots` as a public package.
- Tags pushed: immutable `sha-<git-sha>` on every build; `latest` moves only when a master build succeeds; pushing a semver git tag (`vMAJOR.MINOR.PATCH`) publishes that version tag — release line stays `v0.x.y` until the first beta release.
- A failed build or push publishes nothing and leaves `latest` pointing at the last good image.
- The image carries OCI labels recording git sha, branch and build time.
- CI runs on free-tier GitHub Actions authenticating to GHCR with the built-in `GITHUB_TOKEN` — no extra secrets required.
- README documents running the published image (pull + compose snippet) as the alternative to building locally.
- The bot sandbox image is published in the same CI run to `ghcr.io/<owner>/bots-sandbox` with identical tag rules (immutable `sha-<git-sha>`, `latest` only on successful master builds, semver tags from git).
- Both images are public packages; a sandbox-only Dockerfile change triggers only the sandbox build.
