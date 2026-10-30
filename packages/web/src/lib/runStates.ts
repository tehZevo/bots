import type { Bot, OptimisticRunState, OptimisticRunStates } from "../types.ts";
export const OPTIMISTIC_RUN_GRACE_MS = 2000;

export const OPTIMISTIC_RUN_MAX_MS = 60000;

export function optimisticRunUpdate(
  run_state: "running" | "enabled",
): OptimisticRunState {
  const at = Date.now();
  return {
    run_state,
    health: run_state === "running" ? "green" : "blue",
    authoritativeAt: at + OPTIMISTIC_RUN_GRACE_MS,
    expiresAt: at + OPTIMISTIC_RUN_MAX_MS,
  };
}

export function applyOptimisticRunStates(
  rows: Bot[],
  overrides: OptimisticRunStates,
  now = Date.now(),
): { rows: Bot[]; overrides: OptimisticRunStates } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const kept: OptimisticRunStates = {};
  for (const [id, override] of Object.entries(overrides)) {
    if (now >= override.expiresAt) continue;
    const current = byId.get(id);
    if (!current || current.run_state === override.run_state) continue;
    if (now >= override.authoritativeAt) continue;
    kept[id] = override;
  }
  return {
    rows: rows.map((row) =>
      kept[row.id]
        ? {
            ...row,
            run_state: kept[row.id].run_state,
            health: kept[row.id].health,
          }
        : row,
    ),
    overrides: kept,
  };
}
