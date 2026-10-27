# Bot health colors

- The card status circle and detail status line use four levels — Active (green), Idle (blue), Issues (yellow), Blocked (red) — plus Disabled (gray). These words are what users see everywhere (hover text, detail line, bar counts); internal color keys may stay `green`/`blue`/`yellow`/`red`/`gray`.
- Active: the bot's loop is currently running. Idle: enabled, not running, and no Issues or Blocked condition holds — ready and waiting. Issues: the agent's status line carries level `issue` while no Blocked condition holds — self-report can raise concern but never hide a real failure.
- Blocked: the latest completed run ended `error` (a newer run that finishes replaces that cue), the bot has no model configured (`../llm/providers.md`), or the agent's status line carries level `blocked` (`task-and-status.md`). Being switched off is not Blocked — it is Disabled, and gray outranks every other color.
- The status bar counts show `N total · M running`, plus a blocked count when any bot is red.
- A pulsing dot never moves, resizes or dims: a separate halo circle in the dot's status color starts on the dot's edge, grows outward to roughly twice the dot's diameter while fading to fully transparent, then restarts — cards do not reflow. The pulse signals live work only: it runs exactly while the bot's agent loop is running (`run_state: running`), so Idle and Disabled stay steady and Issues or Blocked pulse only mid-run.
- The pulse's start offset derives from the bot id so dots on different cards are never in sync; reduced-motion users get steady dots.
