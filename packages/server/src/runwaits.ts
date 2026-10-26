// specs/runs/drill-down.md — per-run marks for provider retry waits ("where recorded").
// In-memory by design: unmerged runs after a restart simply show no wait marks.

interface WaitMark {
  at: number;
  ms: number;
}

const MAX_RUNS = 200;
const waitsByRun = new Map<string, WaitMark[]>();

export function recordRetryWait(runId: string, ms: number): void {
  let list = waitsByRun.get(runId);
  if (!list) {
    list = [];
    waitsByRun.set(runId, list);
    while (waitsByRun.size > MAX_RUNS) {
      const oldest = waitsByRun.keys().next().value as string;
      waitsByRun.delete(oldest);
    }
  }
  if (!Number.isFinite(ms)) return;
  list.push({ at: Date.now(), ms });
}

export function getRetryWaits(runId: string): WaitMark[] {
  return waitsByRun.get(runId) ?? [];
}
