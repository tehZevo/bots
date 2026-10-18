# Bot health colors

- The card status circle and detail status line use four levels — Active (green), Idle (blue), Issues (yellow), Blocked (red) — plus Disabled (gray). These words are what users see everywhere (hover text, detail line, bar counts); internal color keys may stay `green`/`blue`/`yellow`/`red`/`gray`.
- Active: the bot's loop is currently running.
- Idle: enabled, not running, and no Issues or Blocked condition holds — ready and waiting.
- Issues: the agent's status line carries level `issue` while no Blocked condition holds — self-report can raise concern but never hide a real failure.
- Blocked: latest completed run ended `error`, the bot has no model configured (`llm/providers.md`), or the agent's status line carries level `blocked` (`bots/status-line.md`). Being switched off is not Blocked — it is Disabled.
- Disabled: the bot's enabled flag is off; gray outranks every other color.
- The status bar counts show `N total · M running`, plus a blocked count when any bot is red.
- Only the Active status dot pulses gently (opacity/scale breathing) while its bot loop is actually running; Idle, Issues, Blocked, and Disabled stay steady. The pulse's start offset is derived from the bot id so dots on different cards are never in sync. Reduced-motion users get steady dots.
