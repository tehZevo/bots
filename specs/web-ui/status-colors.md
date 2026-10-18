# Bot health colors

- The card status circle and detail status line use three levels: green, yellow, red — replacing the current running/idle pair.
- Red: latest completed run ended `error`, or the bot is blocked (disabled, or no model configured per `llm/providers.md`).
- Yellow: enabled with a failed run among the five most recent completed runs while the latest succeeded.
- Green otherwise; an actively running loop keeps its live pulse on top of the level color.
- The status bar counts follow: `N total · M running` stays, plus a red count when any bot is red.
