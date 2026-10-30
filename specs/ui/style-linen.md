# Style — Linen

Warm minimal system: paper-soft canvas, floating white cards, pill controls, indigo accent. Light mode ships first; dark derives from the same tokens per `theme.md`.

- Tokens (light): canvas `#f6f5f2`, surface pure white, text warm near-black `#23211d`, muted warm gray, hairline border `#e9e6e0`, accent indigo `#4f46e5`; status colors keep semantic hues tuned for the warm base. No raw hex outside tokens (`visual-style.md`).
- Cards float on shadow alone: borderless white surfaces with a two-layer soft shadow (1px contact + wide 28–38px ambient at ≤14% opacity); hover deepens the ambient shadow only. Card radius 16, dialog radius 20; controls use pill or 12px radii — exactly these two geometry scales.
- Sidebar sits directly on the canvas (no divider line); nav items are pills in muted text and the active item becomes a raised white card with accent label and its own soft shadow — selection reads as elevation, not fill.
- Buttons: solid indigo pill primary with a tinted drop shadow; secondary/ghost controls are white pills with hairline borders; danger is white with red text and a warm red border. Status-bar actions (Pause, Stop all, Search) are ghost pills; only the notification bell carries accent fill.
- Inputs sit on a faint warm well (`#fbfaf8`) with 12px radius; keyboard focus draws a 3px 25%-alpha indigo ring — never layout shift.
- Chat sidebar and dialogs lift with larger ambient shadows (48–64px) over a blurred, dimmed warm scrim; chat bubbles stay white/hairline on the canvas tone.
- Typography: system sans throughout; page titles ~1.45rem semibold with slight negative tracking; metadata in muted caption text — never italic; numerics tabular where counts appear.
