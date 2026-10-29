# Docs writing rules

`docs/**` (the VitePress site) teaches a human to accomplish tasks; specs remain the behavior contract that owns exact wording.

- Every page reads task-first: what you want to do, where you do it, what happens — in those terms a user would use.
- Each fact has one owning page; other pages reach it with a link sentence.
- Behavior over time is phrased as impact the user can observe: "sign-in lasts a week", "a lost key can't be recovered".
- Controls are named so they can be found (**Settings → Providers**, **Run now**); their visual treatment belongs to specs.
- Reference tables (API routes, env vars, exit codes, event payloads) carry full detail and remain the site's precision surface.
- Enumerations of app behavior point at the owning spec; enumerations a user consults live in tables.
- Pages stay short (~60 lines); one that outgrows that without reference tables splits into task pages.
- Safety notes (e.g. Docker-socket exposure) keep their full strength wherever they appear.
- Prose states how things work, positively and in present tense; links carry context so each one reads as a complete thought.
