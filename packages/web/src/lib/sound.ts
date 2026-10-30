export const SOUND_LIBRARY: [string, string][] = [
  ["default", "Default chime"],
  ["ping", "Ping"],
  ["chirp", "Chirp"],
  ["bell", "Bell"],
  ["blip", "Blip"],
  ["warp", "Warp"],
  ["thunk", "Thunk"],
];

export function playSound(id: string): void {
  if (!id || id === "none") return;
  const a = new Audio(`/sounds/${id}.wav`);
  a.volume = 0.35;
  void a.play().catch(() => undefined);
}
