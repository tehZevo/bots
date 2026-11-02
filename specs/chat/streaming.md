# Chat streaming smoothness

- A streamed reply is written out progressively rather than appearing in provider-sized chunks: the visible text advances toward the latest text the server has sent, at least one character per animation frame.
- The reveal catches up when the backlog grows — a large jump reveals proportionally more characters per frame rather than lagging behind the run — and stops as soon as it is level with the server, so a finished reply is never still animating.
- Only the trailing assistant turn animates, its `thinking` alongside its answer. Stored history and user turns render exactly as stored.
- A turn that is not an extension of what is already shown (a switch to another bot, a replaced reply) snaps to the final text instead of glitching through a rewrite.
- The log keeps following the bottom while text grows, subject to the reader having scrolled up (`messages.md`).
- With reduced motion preferred, streamed text appears immediately with no animation.
- The server keeps pushing accumulated snapshots; smoothing is presentation only and never changes what is stored or replayed.
