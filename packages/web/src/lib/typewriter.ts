/** Characters revealed per frame for a given backlog of unrevealed characters. */
export function revealStep(backlog: number): number {
  if (backlog <= 0) return 0;
  return Math.max(1, Math.ceil(backlog / 12));
}

/**
 * Next string to show while a streamed reply catches up with its target.
 * Reveals at least one character per step so text always moves; a target that
 * is not an extension of what is already shown snaps instead of glitching.
 */
export function nextReveal(
  target: string,
  shown: string,
  perTick: number,
): string {
  if (target === shown) return shown;
  if (!target.startsWith(shown)) return target;
  if (perTick <= 0) return target;
  return target.slice(0, Math.min(target.length, shown.length + perTick));
}
