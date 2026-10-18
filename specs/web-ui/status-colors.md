# Bot health colors

- The card status circle and detail status line use three levels: green, yellow or red.
- Red: latest completed run ended `error`, the bot is blocked operationally (disabled, or no model configured per `llm/providers.md`), or the agent's status line carries level `blocked` (`bots/status-line.md`) — the agent declaring it cannot proceed shows as red too.
- Yellow: the agent's status line carries level `issue` (`bots/status-line.md`) while no red condition holds — self-report can raise concern but never hide a real failure.
- Green otherwise; an actively running loop keeps its live pulse on top of the level color.
- The status bar counts follow: `N total · M running` stays, plus a red count when any bot is red.
