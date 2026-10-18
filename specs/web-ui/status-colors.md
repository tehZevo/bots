# Bot health colors

- The card status circle and detail status line use three levels, named Active (green), Issues (yellow) and Blocked (red). These words are what users see everywhere — hover text, detail line and bar counts; the internal color keys may stay `green`/`yellow`/`red`.
- Blocked: latest completed run ended `error`, the bot is blocked operationally (disabled, or no model configured per `llm/providers.md`), or the agent's status line carries level `blocked` (`bots/status-line.md`) — the agent declaring it cannot proceed shows as Blocked too.
- Issues: the agent's status line carries level `issue` while no Blocked condition holds — self-report can raise concern but never hide a real failure.
- Active otherwise; an actively running loop keeps its live pulse on top of the level color.
- The status bar counts follow: `N total · M running` stays, plus a blocked count when any bot is red.

This also restores the three-level rules lost when #68's merge re-applied a pre-#89 snapshot of this file.
