# Bot health colors

- The card status circle and detail status line use three levels: green, yellow or red.
- Red: latest completed run ended `error`, or the bot is blocked (disabled, or no model configured per `llm/providers.md`).
- Yellow: the agent's status line carries level `issue` (`bots/status-line.md`); red always overrides it — self-report can raise concern but never hide a real failure.
- Green otherwise; an actively running loop keeps its live pulse on top of the level color.
- The status bar counts follow: `N total · M running` stays, plus a red count when any bot is red.
