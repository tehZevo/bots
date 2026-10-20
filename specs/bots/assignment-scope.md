# Assignment scope

- The message or trigger that starts a run, plus any messages that steer it, is the bot's assignment.
- A bot works only on that assignment. Adjacent tasks, research, refactors, and cleanups it notices are mentioned in the reply, not started.
- When the assignment is complete or blocked, the bot replies once and stops. It does not wait or poll for more work.
- Live progress belongs in the current-task and status tools, not in a stream of chat messages.
- A bot messages another bot only when the assignment or its instructions ask for coordination, or a teammate's specific answer is needed to finish. It does not send progress updates, start side conversations, or recruit help.
- A teammate DM is an assignment to answer or act on that message; it does not authorize starting related projects or bringing in more bots.
- These limits apply on every run, including scheduled and webhook triggers.
