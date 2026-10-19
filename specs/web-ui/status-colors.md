# Bot health colors

- The card status circle and detail status line use four levels — Active (green), Idle (blue), Issues (yellow), Blocked (red) — plus Disabled (gray). These words are what users see everywhere (hover text, detail line, bar counts); internal color keys may stay `green`/`blue`/`yellow`/`red`/`gray`.
- Active: the bot's loop is currently running.
- Idle: enabled, not running, and no Issues or Blocked condition holds — ready and waiting.
- Issues: the agent's status line carries level `issue` while no Blocked condition holds — self-report can raise concern but never hide a real failure.
- Blocked: latest completed run ended `error`, the bot has no model configured (`llm/providers.md`), or the agent's status line carries level `blocked` (`bots/status-line.md`). Being switched off is not Blocked — it is Disabled.
- Disabled: the bot's enabled flag is off; gray outranks every other color.
- The status bar counts show `N total · M running`, plus a blocked count when any bot is red.
- A pulsing dot never moves or resizes itself: it keeps its size, position and full color. The motion is a separate small circle in the dot's status color that starts on the dot's edge, grows outward to roughly twice the dot's diameter while fading to fully transparent, then restarts. The halo is decoration — it never covers the dot's center, and cards do not reflow while it animates.
- Pulse signals live work, not a health level or merely an enabled bot. A dot pulses only while its bot has an active agent loop (thinking/streaming an LLM response or executing tools); Idle and Disabled remain steady. Issues or Blocked conditions pulse only when that same bot's loop is currently running (`run_state: running`). The pulse's start offset is derived from the bot id so dots on different cards are never in sync. Reduced-motion users get steady dots.
