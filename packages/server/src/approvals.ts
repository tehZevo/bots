// specs/tools/approvals.md — pause a tool call before its side effect until a
// user approves or denies it. Decisions arrive over the API; waiters live in
// this process, so restarts and interrupts resolve pendings as denied.
import { randomUUID } from "node:crypto";
import {
  createNotification,
  denyPendingApprovalsForBot,
  decideApproval,
  getApproval,
  insertApproval,
} from "./db.ts";

const waiting = new Map<string, (approved: boolean) => void>();

export function requestToolApproval(
  botId: string,
  toolName: string,
  argsSummary: string,
): Promise<boolean> {
  const id = randomUUID();
  insertApproval({
    id,
    bot_id: botId,
    created_at: Date.now(),
    tool_name: toolName,
    args_summary: argsSummary.slice(0, 200),
  });
  createNotification({
    kind: "approval",
    title: `Approve ${toolName}?`,
    body: `${toolName} ${argsSummary}`.slice(0, 1000),
    botId,
    dedupeKey: `approval:${id}`,
  });
  return new Promise<boolean>((resolve) => {
    waiting.set(id, resolve);
  });
}

export function resolveApproval(
  id: string,
  approve: boolean,
): "resolved" | "unknown" | "already-decided" {
  const row = getApproval(id);
  if (!row) return "unknown";
  if (row.status !== "pending") return "already-decided";
  decideApproval(id, approve);
  const resolve = waiting.get(id);
  waiting.delete(id);
  // With no in-process waiter the run is already gone; record the decision.
  resolve?.(approve);
  return "resolved";
}

/** Interrupting a bot or clearing its memory denies pending approvals. */
export function denyPendingForBot(botId: string): void {
  for (const id of denyPendingApprovalsForBot(botId)) {
    const resolve = waiting.get(id);
    waiting.delete(id);
    resolve?.(false);
  }
}
