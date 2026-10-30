# Style — Drift

This spec is the presentation authority: where it differs from `visual-style.md`, this wins; shared rules (icon set, focus-visible rings, one primary per action row) stay inherited.

Cool airy system: soft blue-gray canvas, borderless white cards floating on layered shadows, pill controls, blue accent; selection reads as elevation. Light mode ships first; dark derives from the same tokens per `theme.md`.

- Tokens (light): canvas `#eef1f5`, surface pure white, text slate near-black `#17212e`, muted steel gray, cool hairline border `#dfe6ee`, input well `#f8fafc`, accent blue `#2563eb`; semantic status hues tuned for light. No raw hex outside tokens (`visual-style.md`).
- Cards float on shadow alone: no visible border — a two-layer soft shadow (1px contact + wide 28–40px ambient at ≤14% opacity, neutral slate tint); hover deepens the ambient shadow only. Card radius 16, dialog radius 20; controls are pills or 12px radii — exactly these two geometry scales.
- Sidebar sits directly on the canvas (no divider line); nav items are pills in muted text and the active item becomes a raised white card with accent label and its own soft shadow — selection expressed as elevation, never fill.
- Buttons: solid blue pill primary with a tinted drop shadow; secondary/ghost controls are white pills with hairline borders; danger is white with red text on a pale-red border. Status-bar actions (Pause, Stop all, Search) are ghost pills; only the notification bell carries accent fill.
- Inputs sit in a faint cool well (`#f8fafc`) at 12px radius; keyboard focus draws a 3px 25%-alpha blue ring — never layout shift.
- Chat sidebar and dialogs lift with larger ambient shadows (48–64px) over a blurred, dimmed scrim; chat bubbles stay white/hairline on the canvas tone.
- Typography: system sans throughout; page titles ~1.45rem semibold with slight negative tracking; metadata in muted caption text — never italic; numerics tabular where counts appear.
