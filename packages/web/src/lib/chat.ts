import type { ChatTurn, OptimisticChatMessage } from "../types.ts";
export function mergeOptimisticChatTurns(
  history: ChatTurn[],
  pending: readonly OptimisticChatMessage[],
): ChatTurn[] {
  if (pending.length === 0) return history;
  const optimistic = pending.map((turn) => ({ role: "user", text: turn.text }));
  let insertAt = history.length;
  while (insertAt > 0 && history[insertAt - 1].role !== "user") insertAt--;
  return [
    ...history.slice(0, insertAt),
    ...optimistic,
    ...history.slice(insertAt),
  ];
}
