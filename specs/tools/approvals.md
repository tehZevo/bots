# Tool approvals

- A tool call can be flagged as requiring approval; execution pauses before the side effect happens and the run stays `running`.
- Pending approvals appear in an `Approvals` area of the bot detail modal: tool name, argument summary, Approve and Deny.
- Approve executes that single call; Deny returns a "denied by user" tool result to the model so it can continue without the effect.
- Interrupting or clearing memory resolves pending approvals as denied (see `bots/interrupt.md`).
- Which tools require approval is declared per role capability grant, default: none. The first flagged capability wins regardless of later grants.
