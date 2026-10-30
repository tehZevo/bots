import type { CSSProperties } from "react";
import {
  AVATAR_COLORS,
  avatarColor,
  shapeRadii,
  smoothClosedPath,
} from "../lib/avatar.ts";
import { fnv, mulberry32 } from "../lib/hash.ts";
import type { Bot } from "../types.ts";

export function StatusDot({
  id,
  health,
  label,
  active,
}: {
  id: string;
  health: Bot["health"];
  label?: string;
  active: boolean;
}) {
  const delay = -(fnv(id) % 1200) / 1000;
  return (
    <span
      className={`dot ${health}${active ? " pulse" : ""}`}
      style={{ "--dot-delay": `${delay}s` } as CSSProperties}
      {...(label ? { title: label } : {})}
    />
  );
}

export function Avatar({
  id,
  shape = null,
  color = null,
  health = null,
}: {
  name: string;
  id: string;
  shape?: number | null;
  color?: number | null;
  health?: Bot["health"] | null;
}) {
  const rand = mulberry32(fnv(id));
  const radii = shapeRadii(rand, shape);
  const maxR = Math.max(...radii);
  const base = 46 / maxR;
  const eyeGap = 7 + rand() * 5;
  const eyeRx = 2.6 + rand() * 1.4;
  const eyeRy = eyeRx * (1.8 + rand() * 0.5);
  const gaze = (rand() - 0.5) * 3;
  const droop = rand() < 0.3;
  const baseCol = color == null ? avatarColor(id) : AVATAR_COLORS[color];
  const col = health === "gray" ? "#6b7280" : baseCol;
  const glow =
    health === "red" || health === "gray" ? "transparent" : `${baseCol}59`;
  const blinkPeriod = 3 + rand() * 5;
  const animClass = health === null ? "" : ` anim-${health}`;
  return (
    <span
      className={`avatar${animClass}`}
      style={{
        color: col,
        ["--avatar-glow" as string]: glow,
        ["--avatar-glow-strong" as string]: `${baseCol}a6`,
        ["--blink-period" as string]: `${blinkPeriod.toFixed(2)}s`,
        ["--blink-delay" as string]: `${(-rand() * blinkPeriod).toFixed(2)}s`,
      }}
      aria-hidden
    >
      <svg
        className="avatar-svg"
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
      >
        <path d={smoothClosedPath(radii, 50, base)} fill="currentColor" />
        {[-1, 1].map((side) => (
          <ellipse
            key={side}
            className="eye"
            cx={(50 + side * eyeGap + gaze).toFixed(2)}
            cy={45 - (rand() - 0.5) * 3}
            rx={eyeRx.toFixed(2)}
            ry={droop ? (eyeRy * 0.45).toFixed(2) : eyeRy.toFixed(2)}
          />
        ))}
      </svg>
    </span>
  );
}

export function ShapePreview({ preset }: { preset: number }) {
  const radii = shapeRadii(mulberry32(1000 + preset * 7919), preset);
  const base = 46 / Math.max(...radii);
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <path d={smoothClosedPath(radii, 50, base)} fill="currentColor" />
    </svg>
  );
}
