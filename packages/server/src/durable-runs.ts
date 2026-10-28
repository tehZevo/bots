import { randomUUID } from "node:crypto";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type {
  AgentEventStream,
  Conversation,
  Extension,
  Harness,
  SettledSubmissionRecord,
  ToolRegistration,
  UsageState,
} from "@earendil-works/pi-durable";
import { watchEvents } from "@earendil-works/pi-durable";
import {
  type BotRow,
  checkSpendBreaker,
  createNotification,
  deletePendingInjections,
  finishRun,
  getBot,
  getCurrentRunForBot,
  insertPendingInjection,
  insertRun,
  isPaused,
  listPendingInjections,
  loadMessages,
  pendingBotIds,
  recordRunUsage,
  setCurrentRunForBot,
  sharesTeamWith,
  sumUsage,
  supersedeInterruptedRuns,
  type TokenUsage,
  teammatesOf,
} from "./db.ts";
import {
  DurableMessageMirror,
  ensureBotConversation,
  lastAssistantTextFromMessages,
} from "./durable-conversations.ts";
import {
  botExtensionName,
  installBotExtension,
  installMcpExtension,
  mcpExtensionName,
  selectExtensions,
  uninstallExtension,
} from "./durable-extensions.ts";
import { type ResolvedLlm, resolveDefault } from "./llm.ts";
import type { McpSession } from "./mcp.ts";
import { getDurableRegistry, initDurableRuntime } from "./pi-runtime.ts";
import { recordRetryWait } from "./runwaits.ts";
import { containerExists, syncSkillBundlesForBot } from "./sandbox.ts";
import { grantedSkills } from "./skillfiles.ts";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const LLM_ROLES = new Set(["user", "assistant", "toolResult"]);

export interface InjectResult {
  runId: string | null;
  steered: boolean;
  held?: boolean;
}

interface ActiveRun {
  bot: BotRow;
  runId: string;
  conversation: Conversation;
  baseExtension: Extension<ToolRegistration>;
  mcpExtension?: Extension<ToolRegistration>;
  sessions: McpSession[];
  stream: AgentEventStream;
  mirror: DurableMessageMirror;
  currentUsage: UsageState;
  baselineUsage: TokenUsage;
  budgetBaseline: number;
  stopped: boolean;
  budgetHit: boolean;
  retryStartedAt?: number;
}

const activeRuns = new Map<string, ActiveRun>();

function report(err: unknown): void {
  console.error("durable run:", err);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function addJsonUsage(total: TokenUsage, value: unknown): void {
  const usage = value as Record<string, unknown>;
  total.input += numeric(usage.input);
  total.output += numeric(usage.output);
  total.cache_read += numeric(usage.cacheRead ?? usage.cache_read);
  total.cache_write += numeric(usage.cacheWrite ?? usage.cache_write);
}

function usageTotals(state: UsageState): TokenUsage {
  const totals: TokenUsage = {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
  };
  for (const value of Object.values(state.models)) addJsonUsage(totals, value);
  for (const value of Object.values(state.tools)) addJsonUsage(totals, value);
  return totals;
}

function subtractUsage(before: TokenUsage, after: TokenUsage): TokenUsage {
  const diff = (a: number, b: number) => Math.max(0, b - a);
  return {
    input: diff(before.input, after.input),
    output: diff(before.output, after.output),
    cache_read: diff(before.cache_read, after.cache_read),
    cache_write: diff(before.cache_write, after.cache_write),
  };
}

function totalTokens(usage: TokenUsage): number {
  return usage.input + usage.output + usage.cache_read + usage.cache_write;
}

function legacyHistory(botId: string) {
  return loadMessages(botId)
    .map((row) => JSON.parse(row.payload))
    .filter((message) => LLM_ROLES.has(message.role));
}

function isLive(active: ActiveRun | undefined): active is ActiveRun {
  return !!active && !active.stopped;
}

export function deliverDm(
  sender: BotRow,
  recipientId: string,
  text: string,
): string {
  const recipient = getBot(recipientId);
  if (!recipient) return "not delivered: no bot with that id";
  if (recipient.id === sender.id) return "not delivered: cannot DM yourself";
  if (!sharesTeamWith(sender.id, recipient.id))
    return `not delivered: ${recipient.name} shares no team with you`;
  injectMessage(
    recipient,
    `${text}\n\n— from ${sender.name} (bot id: ${sender.id}); reply with send_message only if the sender asked for a response`,
    "dm",
  );
  return `delivered to ${recipient.name}`;
}

export function isLoopActive(botId: string): boolean {
  return isLive(activeRuns.get(botId));
}

function submitInput(
  conversation: Conversation,
  content: string,
  requestId = randomUUID(),
): void {
  void conversation
    .submit(
      { type: "input", content, whenBusy: "steer", requestId },
      BACKGROUND_CONTEXT,
    )
    .catch(report);
}

async function waitForSettled(harness: Harness, conversation: Conversation) {
  for (let pass = 0; pass < 10; pass++) {
    const inspection = await harness.inspect(BACKGROUND_CONTEXT);
    const pending = inspection.submissions.some(
      (submission) =>
        submission.conversationId === conversation.id &&
        (submission.status === "queued" || submission.status === "placed"),
    );
    if (!pending) return;
    await conversation.waitForIdle(BACKGROUND_CONTEXT);
  }
}

function settledMessage(settled: SettledSubmissionRecord): string {
  if (settled.status !== "unanswered") return "submission did not answer";
  if (typeof settled.detail === "string") return settled.detail;
  try {
    const detail = JSON.stringify(settled.detail);
    if (detail && detail !== "null") return detail;
  } catch {
    // fall back to the durable reason below
  }
  return settled.reason;
}

async function runDurableTurn(
  bot: BotRow,
  runId: string,
  content: string,
  llm: ResolvedLlm,
): Promise<void> {
  const registry = getDurableRegistry();
  let active: ActiveRun | undefined;
  let sessions: McpSession[] = [];

  try {
    const harness = await initDurableRuntime();
    const conversation = await ensureBotConversation(
      harness,
      bot.id,
      llm.model.id,
      () => legacyHistory(bot.id),
    );

    const skills = grantedSkills(bot);
    if (skills.length || (await containerExists(bot.id))) {
      try {
        await syncSkillBundlesForBot(bot.id, skills);
      } catch (err) {
        console.warn(`skill bundle sync failed for bot ${bot.id}`, err);
      }
    }

    const baseExtension = installBotExtension(
      registry,
      bot,
      teammatesOf(bot.id).length > 0
        ? (recipientId, text) => deliverDm(bot, recipientId, text)
        : undefined,
    );
    let mcp:
      | { extension: Extension<ToolRegistration>; sessions: McpSession[] }
      | undefined;
    try {
      mcp = await installMcpExtension(registry, bot);
      sessions = mcp.sessions;
    } catch (err) {
      console.warn(`mcp tool connection failed for bot ${bot.id}`, err);
    }

    await conversation.configure(
      {
        model: { provider: "bots", modelId: llm.model.id },
        extensions: selectExtensions(baseExtension, mcp?.extension),
      },
      BACKGROUND_CONTEXT,
    );

    const mirror = new DurableMessageMirror(conversation);
    await mirror.initialize();
    const stream = await watchEvents(
      harness,
      conversation.id,
      BACKGROUND_CONTEXT,
    );
    const baselineUsage = usageTotals(stream.snapshot.usage);
    for (const entry of stream.snapshot.entries) {
      try {
        mirror.appendEntry(bot.id, runId, entry);
      } catch (err) {
        console.error(
          `durable transcript projection failed: ${errorMessage(err)}`,
        );
      }
    }

    const state: ActiveRun = {
      bot,
      runId,
      conversation,
      baseExtension,
      mcpExtension: mcp?.extension,
      sessions,
      stream,
      mirror,
      currentUsage: stream.snapshot.usage,
      baselineUsage,
      budgetBaseline: bot.token_budget
        ? sumUsage(bot.id, Date.now() - THIRTY_DAYS).total
        : 0,
      stopped: false,
      budgetHit: false,
    };
    active = state;
    activeRuns.set(bot.id, state);

    stream.start(async (events) => {
      for (const event of events) {
        if (event.type === "entry_appended") {
          try {
            mirror.appendEntry(bot.id, runId, event.entry);
          } catch (err) {
            console.error(
              `durable transcript projection failed: ${errorMessage(err)}`,
            );
          }
        } else if (event.type === "auto_retry_start") {
          state.retryStartedAt = Date.now();
        } else if (event.type === "auto_retry_end") {
          const started = state.retryStartedAt;
          delete state.retryStartedAt;
          if (started !== undefined)
            recordRetryWait(runId, Date.now() - started);
        } else if (event.type === "usage_changed") {
          state.currentUsage = event.usage;
          if (!bot.token_budget) continue;
          const spent = totalTokens(
            subtractUsage(baselineUsage, usageTotals(event.usage)),
          );
          if (
            !state.budgetHit &&
            state.budgetBaseline + Math.max(0, spent) >= bot.token_budget
          ) {
            state.budgetHit = true;
            void conversation.abort(BACKGROUND_CONTEXT).catch(report);
          }
        }
      }
    });

    const submission = await conversation.submit(
      { type: "input", content, whenBusy: "steer", requestId: runId },
      BACKGROUND_CONTEXT,
    );
    const settled = await submission.wait(BACKGROUND_CONTEXT);
    await waitForSettled(harness, conversation);

    try {
      mirror.appendNewMessages(bot.id, runId);
    } catch (err) {
      console.error(
        `durable transcript projection failed: ${errorMessage(err)}`,
      );
    }

    const view = await conversation.context(BACKGROUND_CONTEXT);
    const output = lastAssistantTextFromMessages(view.messages);

    if (active.stopped) finishRun(runId, "error", output, "interrupted");
    else if (settled.status === "unanswered") {
      finishRun(
        runId,
        "error",
        output,
        active.budgetHit ? "token budget exhausted" : settledMessage(settled),
      );
    } else if (active.budgetHit) {
      finishRun(runId, "error", output, "token budget exhausted");
    } else {
      finishRun(runId, "ok", output, null);
    }
  } catch (err) {
    try {
      active?.mirror.appendNewMessages(bot.id, runId);
    } catch {
      // projection is best-effort; still settle the run below
    }

    let output: string | null = null;
    if (active) {
      try {
        const view = await active.conversation.context(BACKGROUND_CONTEXT);
        output = lastAssistantTextFromMessages(view.messages);
      } catch {
        // state unreadable; report without partial output
      }
    }

    finishRun(
      runId,
      "error",
      output,
      active?.budgetHit
        ? "token budget exhausted"
        : active?.stopped
          ? "interrupted"
          : errorMessage(err),
    );
  } finally {
    if (active) {
      try {
        recordRunUsage(
          runId,
          bot.id,
          Date.now(),
          subtractUsage(active.baselineUsage, usageTotals(active.currentUsage)),
        );
      } catch (err) {
        console.error(`usage recording failed for run ${runId}:`, err);
      }

      try {
        await active.stream.stop();
      } catch (err) {
        report(err);
      }
    } else {
      recordRunUsage(runId, bot.id, Date.now(), {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
      });
    }

    for (const session of sessions) session.close();

    if (!isLive(activeRuns.get(bot.id))) {
      uninstallExtension(registry, mcpExtensionName(bot.id));
      uninstallExtension(registry, botExtensionName(bot.id));
    }
    activeRuns.delete(bot.id);
    if (getCurrentRunForBot(bot.id) === runId)
      setCurrentRunForBot(bot.id, null);

    try {
      checkSpendBreaker();
    } catch (err) {
      console.error("spend breaker check failed:", err);
    }
  }
}

function errorWithoutModel(
  bot: BotRow,
  runId: string,
  kind: "schedule" | "manual" | "chat" | "webhook" | "dm" | "continuous",
  error: string,
): void {
  insertRun({
    id: runId,
    bot_id: bot.id,
    status: "error",
    trigger: kind,
    started_at: Date.now(),
    finished_at: Date.now(),
    output: null,
    error,
  });
  createNotification({
    kind: "run_error",
    title: `${bot.name}: run failed`,
    body: `Run ${kind} ended in error: ${error}.`,
    botId: bot.id,
    dedupeKey: `run-error:${runId}`,
  });
}

export function injectMessage(
  bot: BotRow,
  text: string,
  kind: "schedule" | "manual" | "chat" | "webhook" | "dm" | "continuous",
): InjectResult {
  if (isPaused()) {
    insertPendingInjection(bot.id, kind, text);
    return { runId: null, steered: false, held: true };
  }

  supersedeInterruptedRuns(bot.id);
  const content = `[${kind} ${new Date().toISOString()}]\n${text}`;
  const live = activeRuns.get(bot.id);
  if (isLive(live)) {
    submitInput(live.conversation, content);
    return { runId: live.runId, steered: true };
  }

  const runId = randomUUID();
  if (bot.token_budget && bot.token_budget > 0) {
    const used = sumUsage(bot.id, Date.now() - THIRTY_DAYS).total;
    if (used >= bot.token_budget) {
      errorWithoutModel(bot, runId, kind, "token budget exhausted");
      return { runId, steered: false };
    }
  }

  const llm = resolveDefault(bot.model_id);
  if (!llm) {
    errorWithoutModel(bot, runId, kind, "no model configured");
    return { runId, steered: false };
  }

  insertRun({
    id: runId,
    bot_id: bot.id,
    status: "running",
    trigger: kind,
    started_at: Date.now(),
    finished_at: null,
    output: null,
    error: null,
  });
  setCurrentRunForBot(bot.id, runId);
  void runDurableTurn(bot, runId, content, llm).catch((err) => {
    console.error(`durable run startup failed for ${runId}:`, err);
    finishRun(runId, "error", null, errorMessage(err));
    if (getCurrentRunForBot(bot.id) === runId)
      setCurrentRunForBot(bot.id, null);
  });
  return { runId, steered: false };
}

function abortActive(botId: string, interrupted: boolean): boolean {
  const active = activeRuns.get(botId);
  if (!active || !isLive(active)) return false;
  if (interrupted) active.stopped = true;
  void active.conversation.abort(BACKGROUND_CONTEXT).catch(report);
  activeRuns.delete(botId);
  return true;
}

export function interruptBot(botId: string): boolean {
  return abortActive(botId, true);
}

export function stopAllLoops(): number {
  let stopped = 0;
  for (const botId of [...activeRuns.keys()])
    if (interruptBot(botId)) stopped++;
  return stopped;
}

export function resumePendingInjections(): void {
  if (isPaused()) return;
  for (const botId of pendingBotIds()) {
    const bot = getBot(botId);
    if (!bot?.enabled) continue;
    const pending = listPendingInjections(botId);
    deletePendingInjections(pending.map((row) => row.id));
    for (const row of pending)
      injectMessage(
        bot,
        row.text,
        row.kind as "schedule" | "manual" | "chat" | "webhook" | "dm",
      );
  }
}

export function resetBotRuntime(botId: string): void {
  abortActive(botId, false);
}
