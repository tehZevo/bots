export const BOT_NAMES = [
  "Atlas",
  "Juno",
  "Marlow",
  "Sable",
  "Wren",
  "Nova",
  "Kestrel",
  "Orbit",
  "Tundra",
  "Quill",
  "Vesper",
  "Bramble",
  "Cinder",
  "Dune",
  "Ember",
  "Flint",
  "Gale",
  "Harbor",
  "Iris",
  "Juniper",
  "Kelp",
  "Lyra",
  "Onyx",
  "Rowan",
  "Sage",
  "Cobalt",
  "Indigo",
  "Zenith",
  "Zephyr",
  "Lark",
];

export function pickBotName(used: string[]): string {
  const taken = new Set(used.map((n) => n.toLowerCase()));
  const free = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
  const pool = free.length > 0 ? free : BOT_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
