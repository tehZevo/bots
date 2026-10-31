// specs/audit/log.md — append-only global audit log entry helper.
import { getSetting, insertAuditRow, purgeAuditBefore } from "./db.ts";
import { redactText } from "./redact.ts";

export type AuditActor =
  | { kind: "user"; id?: string | null; name: string }
  | { kind: "bot"; id: string; name: string }
  | { kind: "trigger"; id: string; name?: string }
  | { kind: "system" };

export function logAudit(e: {
  actor: AuditActor;
  action: string;
  targetKind: string;
  targetId?: string | null;
  targetName?: string | null;
  summary?: string | null;
}): void {
  try {
    const botId = e.actor.kind === "bot" ? e.actor.id : "";
    insertAuditRow({
      created_at: Date.now(),
      actor_kind: e.actor.kind,
      actor_id: "id" in e.actor ? (e.actor.id ?? null) : null,
      actor_name:
        e.actor.kind === "system"
          ? "system"
          : ((e.actor as { name?: string }).name ??
            (e.actor as { id?: string | null }).id ??
            "unknown"),
      action: e.action,
      target_kind: e.targetKind,
      target_id: e.targetId ?? null,
      target_name: e.targetName ?? null,
      summary: redactText(botId, e.summary ?? ""),
    });
  } catch {
    // auditing must never break the action it records
  }
}

export const runAuditSweep = (): void => {
  try {
    const raw = getSetting("audit_retention_days");
    const days = raw ? Number.parseInt(raw, 10) : 0;
    if (!Number.isFinite(days) || days <= 0) return;
    const removed = purgeAuditBefore(Date.now() - days * 86_400_000);
    if (removed > 0)
      logAudit({
        actor: { kind: "system" },
        action: "audit.purge",
        targetKind: "audit",
        summary: `purged ${removed} entries older than ${days} day(s)`,
      });
  } catch {
    // retention sweep is best-effort
  }
};

export function startAuditRetention(): void {
  runAuditSweep();
  setInterval(runAuditSweep, 86_400_000).unref?.();
}
