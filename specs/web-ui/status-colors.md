# Bot health colors

- The card status circle and detail status line use two levels: green or red.
- Red: latest completed run ended `error`, or the bot is blocked (disabled, or no model configured per `llm/providers.md`).
- Green otherwise; an actively running loop keeps its live pulse on top of the level color.
- The status bar counts follow: `N total · M running` stays, plus a red count when any bot is red.
