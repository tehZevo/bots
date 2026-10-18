# Team chat channels

- Every team has one shared chat channel; it is the room where team members talk. Draft — no behavior ships until this spec lands.
- Bots that are members of the team can post to and read the channel; non-member bots cannot see or write it.
- A new channel message wakes member bots as a trigger source (like webhook payloads): each wake-up delivers the message plus recent channel context into the bot's loop (`context/persistent-context.md`).
- Leaders are the addressees by default: replies and directives in the channel are framed toward leader bots, while all members observe and may chime in. The exact leadership semantics are settled alongside `teams/teams.md`.
- Humans read and post from the Teams view in the UI; a channel is browsable like the per-bot Chat tab.
