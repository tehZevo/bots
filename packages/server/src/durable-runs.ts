import { randomUUID } from "node:crypto";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type {
  AgentEventStream,
  Conversation,
  ConversationId,
  EntryId,
  Extension,
  Harness,
  SettledSubmissionRecord,
  SubmissionRecord,
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
  listCurrentDurableRuns,
  listPendingInjections,
  loadMessages,
  pendingBotIds,
  recordRunUsage,
  setCurrentRunForBot,
  sharesTeamWith,
  sumUsage,
  supersedeInterruptedRuns,
  sweepUnresumableRuns,
  type TokenUsage,
  teammatesOf,
} from "./db.ts";
import {
  DurableMessageMirror,
  ensureBotConversation,
  lastAssistantTextFromMessages,
  scanConversationEntries,
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
import { BOTS_PROVIDER_ID } from "./pi-provider.ts";
import {
  getDurableRegistry,
  getDurableStorage,
  initDurableRuntime,
} from "./pi-runtime.ts";
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
  harness: Harness;
  conversation: Conversation;
  baseExtension: Extension<ToolRegistration>;
  mcpExtension?: Extension<ToolRegistration>;
  sessions: McpSession[];
  stream: AgentEventStream;
  mirror: DurableMessageMirror;
  currentUsage: UsageState;
  eventBaselineUsage: TokenUsage;
  budgetBaseline: number;
  stopped: boolean;
  budgetHit: boolean;
  retryStartedAt?: number;
  entryFloor?: EntryId;
}

interface PendingRecovery {
  runId: string;
  conversation: Conversation;
  interrupted: boolean;
}

const activeRuns = new Map<string, ActiveRun>();
const pendingRecoveries = new Map<string, PendingRecovery>();

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

async function assistantUsageAfter(
  conversation: Conversation,
  floor?: EntryId,
): Promise<TokenUsage> {
  const totals: TokenUsage = {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
  };
  if (floor === undefined) return totals;

  const floorNumber = Number(floor);
  for (const entry of await scanConversationEntries(conversation)) {
    if (!(Number(entry.id) > floorNumber)) continue;
    for (const message of entry.model ?? []) {
      if (message.role === "assistant") addJsonUsage(totals, message.usage);
    }
  }
  return totals;
}

function submissionFloor(
  record: Pick<SubmissionRecord, "status"> & { entry?: EntryId },
): EntryId | undefined {
  return record.status === "queued" ? undefined : record.entry;
}

async function findSubmissionByRequest(
  conversationId: ConversationId,
  requestId: string,
): Promise<SubmissionRecord | undefined> {
  const storage = getDurableStorage();
  if (!storage) return undefined;
  return await storage.submissionByRequest(
    conversationId,
    requestId,
    BACKGROUND_CONTEXT,
  );
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
  return isLive(activeRuns.get(botId)) || pendingRecoveries.has(botId);
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

function submissionError(record: SubmissionRecord): string | null {
  if (record.status === "done") return null;
  if (record.status !== "unanswered") return "not resumable";
  if (typeof record.detail === "string") return record.detail;
  try {
    const detail = JSON.stringify(record.detail);
    if (detail && detail !== "null") return detail;
  } catch {
    // fall back to the durable reason below
  }
  return record.reason;
}

async function prepareRuntime(
  harness: Harness,
  bot: BotRow,
  llm: ResolvedLlm,
  existingConversation?: Conversation,
): Promise<{
  conversation: Conversation;
  baseExtension: Extension<ToolRegistration>;
  mcpExtension?: Extension<ToolRegistration>;
  sessions: McpSession[];
}> {
  const registry = getDurableRegistry();
  let baseExtension: Extension<ToolRegistration> | undefined;
  let mcpExtension: Extension<ToolRegistration> | undefined;
  let sessions: McpSession[] = [];

  try {
    const conversation =
      existingConversation ??
      (await ensureBotConversation(harness, bot.id, llm.model.id, () =>
        legacyHistory(bot.id),
      ));

    const skills = grantedSkills(bot);
    if (skills.length || (await containerExists(bot.id))) {
      try {
        await syncSkillBundlesForBot(bot.id, skills);
      } catch (err) {
        console.warn(`skill bundle sync failed for bot ${bot.id}`, err);
      }
    }

    baseExtension = installBotExtension(
      registry,
      bot,
      teammatesOf(bot.id).length > 0
        ? (recipientId, text) => deliverDm(bot, recipientId, text)
        : undefined,
    );
    try {
      const mcp = await installMcpExtension(registry, bot);
      mcpExtension = mcp.extension;
      sessions = mcp.sessions;
    } catch (err) {
      console.warn(`mcp tool connection failed for bot ${bot.id}`, err);
    }

    await conversation.configure(
      {
        model: { provider: BOTS_PROVIDER_ID, modelId: llm.model.id },
        extensions: selectExtensions(baseExtension, mcpExtension),
      },
      BACKGROUND_CONTEXT,
    );
    return { conversation, baseExtension, mcpExtension, sessions };
  } catch (err) {
    for (const session of sessions) session.close();
    if (mcpExtension) uninstallExtension(registry, mcpExtensionName(bot.id));
    if (baseExtension) uninstallExtension(registry, botExtensionName(bot.id));
    throw err;
  }
}

function attachRunEvents(state: ActiveRun): void {
  const baselineUsage = state.eventBaselineUsage;
  state.stream.start(async (events) => {
    for (const event of events) {
      if (event.type === "entry_appended") {
        try {
          state.mirror.appendEntry(state.bot.id, state.runId, event.entry);
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
          recordRetryWait(state.runId, Date.now() - started);
      } else if (event.type === "usage_changed") {
        state.currentUsage = event.usage;
        if (!state.bot.token_budget || state.stopped) continue;
        const spent = totalTokens(
          subtractUsage(baselineUsage, usageTotals(event.usage)),
        );
        if (
          !state.budgetHit &&
          state.budgetBaseline + Math.max(0, spent) >= state.bot.token_budget
        ) {
          state.budgetHit = true;
          void state.conversation.abort(BACKGROUND_CONTEXT).catch(report);
        }
      }
    }
  });
}

async function startWatching(params: {
  harness: Harness;
  bot: BotRow;
  runId: string;
  conversation: Conversation;
  baseExtension: Extension<ToolRegistration>;
  mcpExtension?: Extension<ToolRegistration>;
  sessions: McpSession[];
  mirror: DurableMessageMirror;
  initialStopped?: boolean;
  entryFloor?: EntryId;
}): Promise<ActiveRun> {
  const stream = await watchEvents(
    params.harness,
    params.conversation.id,
    BACKGROUND_CONTEXT,
  );
  const current: ActiveRun = {
    bot: params.bot,
    runId: params.runId,
    harness: params.harness,
    conversation: params.conversation,
    baseExtension: params.baseExtension,
    mcpExtension: params.mcpExtension,
    sessions: params.sessions,
    stream,
    mirror: params.mirror,
    currentUsage: stream.snapshot.usage,
    eventBaselineUsage: usageTotals(stream.snapshot.usage),
    budgetBaseline: params.bot.token_budget
      ? sumUsage(params.bot.id, Date.now() - THIRTY_DAYS).total
      : 0,
    stopped: params.initialStopped ?? false,
    budgetHit: false,
    entryFloor: params.entryFloor,
  };

  const existing = activeRuns.get(params.bot.id);
  if (!isLive(existing)) activeRuns.set(params.bot.id, current);

  for (const entry of stream.snapshot.entries) {
    try {
      params.mirror.appendEntry(params.bot.id, params.runId, entry);
    } catch (err) {
      console.error(
        `durable transcript projection failed: ${errorMessage(err)}`,
      );
    }
  }

  attachRunEvents(current);
  return current;
}

async function projectAndOutput(active: ActiveRun): Promise<string | null> {
  try {
    active.mirror.appendNewMessages(active.bot.id, active.runId);
  } catch (err) {
    console.error(`durable transcript projection failed: ${errorMessage(err)}`);
  }

  const view = await active.conversation.context(BACKGROUND_CONTEXT);
  return lastAssistantTextFromMessages(view.messages);
}

async function settleRun(
  active: ActiveRun,
  settled: SettledSubmissionRecord,
): Promise<void> {
  const output = await projectAndOutput(active);
  if (active.stopped) finishRun(active.runId, "error", output, "interrupted");
  else if (settled.status === "unanswered") {
    finishRun(
      active.runId,
      "error",
      output,
      active.budgetHit ? "token budget exhausted" : settledMessage(settled),
    );
  } else if (active.budgetHit) {
    finishRun(active.runId, "error", output, "token budget exhausted");
  } else {
    finishRun(active.runId, "ok", output, null);
  }
}

async function failActiveRun(active: ActiveRun, err: unknown): Promise<void> {
  const output = await projectAndOutput(active);
  finishRun(
    active.runId,
    "error",
    output,
    active.budgetHit
      ? "token budget exhausted"
      : active.stopped
        ? "interrupted"
        : errorMessage(err),
  );
}

function clearPendingRecovery(botId: string, runId: string): void {
  const pending = pendingRecoveries.get(botId);
  if (pending?.runId === runId) pendingRecoveries.delete(botId);
}

async function committedUsage(active: ActiveRun): Promise<TokenUsage> {
  let floor = active.entryFloor;
  if (floor === undefined) {
    const record = await findSubmissionByRequest(
      active.conversation.id,
      active.runId,
    );
    floor = submissionFloor(record ?? { status: "queued" });
  }
  return assistantUsageAfter(active.conversation, floor);
}

async function cleanupActiveRun(
  bot: BotRow,
  runId: string,
  active?: ActiveRun,
): Promise<void> {
  if (active) {
    try {
      recordRunUsage(runId, bot.id, Date.now(), await committedUsage(active));
    } catch (err) {
      console.error(`usage recording failed for run ${runId}:`, err);
    }

    try {
      await active.stream.stop();
    } catch (err) {
      report(err);
    }
    for (const session of active.sessions) session.close();
  } else {
    recordRunUsage(runId, bot.id, Date.now(), {
      input: 0,
      output: 0,
      cache_read: 0,
      cache_write: 0,
    });
  }

  const current = activeRuns.get(bot.id);
  if (!current || current === active || !isLive(current)) {
    activeRuns.delete(bot.id);
    uninstallExtension(getDurableRegistry(), mcpExtensionName(bot.id));
    uninstallExtension(getDurableRegistry(), botExtensionName(bot.id));
  }

  if (getCurrentRunForBot(bot.id) === runId) setCurrentRunForBot(bot.id, null);
  try {
    checkSpendBreaker();
  } catch (err) {
    console.error("spend breaker check failed:", err);
  }
}

async function runDurableTurn(
  bot: BotRow,
  runId: string,
  content: string,
  llm: ResolvedLlm,
): Promise<void> {
  let active: ActiveRun | undefined;

  try {
    const harness = await initDurableRuntime();
    const prepared = await prepareRuntime(harness, bot, llm);
    const mirror = new DurableMessageMirror(prepared.conversation);
    await mirror.initialize(bot.id);
    active = await startWatching({
      harness,
      bot,
      runId,
      conversation: prepared.conversation,
      baseExtension: prepared.baseExtension,
      mcpExtension: prepared.mcpExtension,
      sessions: prepared.sessions,
      mirror,
    });

    const submission = await active.conversation.submit(
      { type: "input", content, whenBusy: "steer", requestId: runId },
      BACKGROUND_CONTEXT,
    );
    const settled = await submission.wait(BACKGROUND_CONTEXT);
    active.entryFloor = submissionFloor(settled);
    await waitForSettled(harness, prepared.conversation);
    await settleRun(active, settled);
  } catch (err) {
    if (active) await failActiveRun(active, err);
    else finishRun(runId, "error", null, errorMessage(err));
  } finally {
    await cleanupActiveRun(bot, runId, active);
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

  const pending = pendingRecoveries.get(bot.id);
  if (pending && !pending.interrupted) {
    submitInput(pending.conversation, content);
    return { runId: pending.runId, steered: true };
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
  if (isLive(active)) {
    active.stopped = true;
    void active.conversation.abort(BACKGROUND_CONTEXT).catch(report);
    activeRuns.delete(botId);
    return true;
  }

  const pending = pendingRecoveries.get(botId);
  if (!pending || pending.interrupted) return false;
  if (interrupted) pending.interrupted = true;
  void pending.conversation.abort(BACKGROUND_CONTEXT).catch(report);
  return true;
}

export function interruptBot(botId: string): boolean {
  return abortActive(botId, true);
}

export function stopAllLoops(): number {
  let stopped = 0;
  for (const botId of [
    ...new Set([...activeRuns.keys(), ...pendingRecoveries.keys()]),
  ]) {
    if (interruptBot(botId)) stopped++;
  }
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

async function finalizeRecoveredTerminal(
  bot: BotRow,
  runId: string,
  conversation: Conversation,
  record: SubmissionRecord,
): Promise<void> {
  try {
    new DurableMessageMirror(conversation).appendNewMessages(bot.id, runId);
  } catch (err) {
    console.error(`durable transcript projection failed: ${errorMessage(err)}`);
  }

  let output: string | null = null;
  try {
    const view = await conversation.context(BACKGROUND_CONTEXT);
    output = lastAssistantTextFromMessages(view.messages);
  } catch (err) {
    console.error(`durable recovery context failed: ${errorMessage(err)}`);
  }

  finishRun(
    runId,
    record.status === "done" ? "ok" : "error",
    output,
    submissionError(record),
  );

  try {
    recordRunUsage(
      runId,
      bot.id,
      Date.now(),
      await assistantUsageAfter(conversation, submissionFloor(record)),
    );
  } catch (err) {
    console.error(`usage recording failed for run ${runId}:`, err);
  }

  setCurrentRunForBot(bot.id, null);
  try {
    checkSpendBreaker();
  } catch (err) {
    console.error("spend breaker check failed:", err);
  }
}

async function resumeDurableSubmission(
  harness: Harness,
  bot: BotRow,
  runId: string,
  llm: ResolvedLlm,
  conversation: Conversation,
  record: SubmissionRecord,
): Promise<void> {
  let active: ActiveRun | undefined;

  try {
    const prepared = await prepareRuntime(harness, bot, llm, conversation);
    const pending = pendingRecoveries.get(bot.id);
    const mirror = new DurableMessageMirror(prepared.conversation);
    active = await startWatching({
      harness,
      bot,
      runId,
      conversation: prepared.conversation,
      baseExtension: prepared.baseExtension,
      mcpExtension: prepared.mcpExtension,
      sessions: prepared.sessions,
      mirror,
      initialStopped: pending?.interrupted ?? false,
      entryFloor: submissionFloor(record),
    });
    clearPendingRecovery(bot.id, runId);

    const submission = await harness.submission(record.id, BACKGROUND_CONTEXT);
    if (!submission) throw new Error("durable submission unavailable");

    const settled = await submission.wait(BACKGROUND_CONTEXT);
    active.entryFloor ??= submissionFloor(settled);
    await waitForSettled(harness, prepared.conversation);
    await settleRun(active, settled);
  } catch (err) {
    console.error(`durable recovery failed for run ${runId}:`, err);
    if (active) await failActiveRun(active, err);
    else finishRun(runId, "error", null, errorMessage(err));
  } finally {
    clearPendingRecovery(bot.id, runId);
    await cleanupActiveRun(bot, runId, active);
  }
}

export async function recoverDurableRuns(): Promise<{
  resumed: number;
  swept: number;
}> {
  const harness = await initDurableRuntime();
  let resumed = 0;
  const handledBots = new Set<string>();
  const terminalFinalizations: Promise<void>[] = [];
  const rows = listCurrentDurableRuns();

  for (const row of rows) {
    if (activeRuns.has(row.bot_id) || pendingRecoveries.has(row.bot_id))
      continue;

    const bot = getBot(row.bot_id);
    if (!bot) continue;
    try {
      const conversation = await harness.conversation(
        Number(row.conversation_id) as unknown as ConversationId,
        BACKGROUND_CONTEXT,
      );
      if (!conversation) continue;

      const record = await findSubmissionByRequest(conversation.id, row.run_id);
      if (!record) continue;

      if (record.status === "done" || record.status === "unanswered") {
        handledBots.add(row.bot_id);
        terminalFinalizations.push(
          finalizeRecoveredTerminal(bot, row.run_id, conversation, record)
            .catch(report)
            .finally(() => clearPendingRecovery(row.bot_id, row.run_id)),
        );
        continue;
      }

      const llm = resolveDefault(bot.model_id);
      if (!llm) continue;

      handledBots.add(row.bot_id);
      resumed++;
      pendingRecoveries.set(row.bot_id, {
        runId: row.run_id,
        conversation,
        interrupted: false,
      });
      void resumeDurableSubmission(
        harness,
        bot,
        row.run_id,
        llm,
        conversation,
        record,
      ).catch(report);
    } catch (err) {
      console.error(
        `durable recovery lookup failed for run ${row.run_id}`,
        err,
      );
    }
  }

  await Promise.allSettled(terminalFinalizations);
  const swept = sweepUnresumableRuns(handledBots);
  for (const row of rows) {
    if (activeRuns.has(row.bot_id) || pendingRecoveries.has(row.bot_id))
      continue;
    if (getCurrentRunForBot(row.bot_id) === row.run_id)
      setCurrentRunForBot(row.bot_id, null);
  }

  return { resumed, swept };
}
