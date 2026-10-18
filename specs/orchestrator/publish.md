# Publishing the orchestrator image

- Every merge to `master` builds the single orchestrator image (see `docker.md`) in CI and pushes it to a public container registry.
- Tags pushed: immutable `sha-<git-sha>` on every build; `latest` moves only when a master build succeeds; pushing a `v*` git tag also publishes that version tag.
- A failed build or push publishes nothing and leaves `latest` pointing at the last good image.
- The image carries OCI labels recording git sha, branch and build time.
- CI runs without paid services: free-tier GitHub Actions with registry credentials from repo secrets.
- README documents running the published image (pull + compose snippet) as the alternative to building locally.
