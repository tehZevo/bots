import { fnv } from "./hash.ts";

export const AVATAR_COLORS = [
  "#e5484d",
  "#e9762c",
  "#f0b13b",
  "#46a758",
  "#12a594",
  "#0091ff",
  "#3e63dd",
  "#8e4ec6",
  "#d6409f",
  "#ab441f",
  "#5f6b7c",
  "#0f7b6c",
];

export const SHAPE_PRESETS: {
  name: string;
  gen: (r: () => number) => [number, number, number][];
}[] = [
  // pebble — near-circle with a tiny two-harmonic ripple
  {
    name: "pebble",
    gen: (r) => [
      [3, 0.04 + r() * 0.02, r() * 6.28],
      [4, 0.03 + r() * 0.02, r() * 6.28],
    ],
  },
  // egg — vertical n=2 bulge
  { name: "egg", gen: () => [[2, 0.15, Math.PI / 2]] },
  // pear — stacked asymmetry, heavy bottom
  {
    name: "pear",
    gen: () => [
      [1, 0.07, Math.PI / 2],
      [2, 0.1, 0],
    ],
  },
  // bean — crescent indent plus mild n=1
  {
    name: "bean",
    gen: (r) => [
      [2, 0.16, r() < 0.5 ? 0.79 : 3.93],
      [1, 0.05, r() * 6.28],
    ],
  },
  // cushion — rounded square
  { name: "cushion", gen: (r) => [[4, 0.09 + r() * 0.02, r() * 6.28]] },
  // trilobe — soft rounded triangle
  { name: "trilobe", gen: (r) => [[3, 0.1 + r() * 0.02, r() * 6.28]] },
  // hexpebble — gentle hexagon
  { name: "hexpebble", gen: (r) => [[6, 0.07 + r() * 0.02, r() * 6.28]] },
  // clover — five soft lobes
  { name: "clover", gen: (r) => [[5, 0.13, r() * 6.28]] },
  // star5 / star6 — puffy rounded points
  { name: "star5", gen: (r) => [[5, 0.19, r() * 6.28]] },
  { name: "star6", gen: (r) => [[6, 0.17, r() * 6.28]] },
  // dimple — one flattened side at a seeded angle
  { name: "dimple", gen: () => [[1, -0.14, 0]] },
  // drop — teardrop leaning to a seeded direction
  {
    name: "drop",
    gen: (r) => {
      const dir = r() < 0.5 ? 0 : Math.PI;
      return [
        [1, 0.12, dir],
        [2, 0.06, dir],
      ];
    },
  },
];

export function shapeRadii(
  rand: () => number,
  preset: number | null = null,
): number[] {
  const terms =
    SHAPE_PRESETS[preset ?? Math.floor(rand() * SHAPE_PRESETS.length)].gen(
      rand,
    );
  rand();
  const n = 72;
  return Array.from({ length: n }, (_, i) => {
    const th = (i / n) * Math.PI * 2;
    return (
      1 + terms.reduce((r, [k, w, ph]) => r + w * Math.sin(k * th + ph), 0)
    );
  });
}

export function smoothClosedPath(
  radii: number[],
  cx: number,
  baseR: number,
): string {
  const n = radii.length;
  const pts = radii.map((r, i) => {
    const th = (i / n) * Math.PI * 2;
    return [cx + Math.cos(th) * r * baseR, cx + Math.sin(th) * r * baseR];
  });
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d} Z`;
}

export function avatarColor(id: string): string {
  return AVATAR_COLORS[fnv(id) % AVATAR_COLORS.length];
}
