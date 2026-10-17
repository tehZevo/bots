# Specs

Behavior specs for this platform. One directory per feature, each containing a `spec.md`.

- Specs describe **what** the system does, not how it is implemented. Plain markdown, present tense ("the system ...").
- A spec is the contract: code PRs cite the spec they implement; behavior changes require a spec update first (separate spec-only PR).
- Keep specs concise (< ~60 lines). Acceptance scenarios use Given/When/Then.
- `Status:` in each spec header is one of `draft` | `implemented` | `superseded`.

## Index

| Feature | Spec | Status |
| --- | --- | --- |
| Bots | [bots/spec.md](bots/spec.md) | implemented |
| Scheduling | [scheduling/spec.md](scheduling/spec.md) | implemented |
| Runs | [runs/spec.md](runs/spec.md) | implemented |
| Agent loop | [agent-loop/spec.md](agent-loop/spec.md) | implemented |
| Memory | [memory/spec.md](memory/spec.md) | implemented |
| Tools | [tools/spec.md](tools/spec.md) | implemented |
| Web UI | [web-ui/spec.md](web-ui/spec.md) | implemented |

Planned, not yet specced: see [roadmap.md](roadmap.md).
