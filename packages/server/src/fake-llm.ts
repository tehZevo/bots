import { randomUUID } from "node:crypto";
import type {
  AssistantMessage,
  Model,
  StopReason,
  TranscriptContext,
  Usage,
} from "@earendil-works/pi-ai";
import type { MutableModels, Provider } from "@earendil-works/pi-ai/models";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { devFakeLlm } from "./config.ts";

export const FAKE_PROVIDER_ID = "fake-provider";
export const FAKE_MODEL_ID = "fake";

export interface FakeToolCallDirective {
  name: string;
  output: string;
  delay_ms?: number;
}

export interface FakeDirective {
  reply?: string;
  delay_ms?: number;
  thinking?: boolean | string;
  tool_calls?: FakeToolCallDirective[];
  fail_http?: 429 | 500;
  fail_times?: number;
  hang?: boolean;
  tokens_in?: number;
  tokens_out?: number;
}

interface FakePlan {
  id: string;
  botId: string;
  botName: string;
  anchor: string;
  directive: FakeDirective;
  failedRequests: number;
  toolsEmitted: number;
  outputsConsumed: number;
  completed: boolean;
}

const DIRECTIVE_RE = /\[\[fake\]\]([\s\S]*?)\[\[\/fake\]\]/g;
const plansByAnchor = new Map<string, FakePlan[]>();
const latestPlansByBot = new Map<string, FakePlan>();

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function thinkingText(value: boolean | string | undefined): string | null {
  if (value === true) return "Thinking about this fake request…";
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

export function parseFakeDirective(text: string): FakeDirective | null {
  DIRECTIVE_RE.lastIndex = 0;
  const match = DIRECTIVE_RE.exec(text);
  if (!match?.[1]) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;
  const value = parsed as Record<string, unknown>;
  const directive: FakeDirective = {};

  if (typeof value.reply === "string") directive.reply = value.reply;
  const delay = nonNegativeNumber(value.delay_ms);
  if (delay !== undefined) directive.delay_ms = delay;
  if (value.thinking === true || typeof value.thinking === "string") {
    directive.thinking = value.thinking;
  } else if (value.thinking === false) {
    directive.thinking = false;
  }

  if (Array.isArray(value.tool_calls)) {
    const tools: FakeToolCallDirective[] = [];
    for (const item of value.tool_calls) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const tool = item as Record<string, unknown>;
      if (typeof tool.name !== "string" || !tool.name.trim()) continue;
      const output =
        typeof tool.output === "string"
          ? tool.output
          : JSON.stringify(tool.output ?? "");
      const entry: FakeToolCallDirective = { name: tool.name, output };
      const toolDelay = nonNegativeNumber(tool.delay_ms);
      if (toolDelay !== undefined) entry.delay_ms = toolDelay;
      tools.push(entry);
    }
    directive.tool_calls = tools;
  }

  if (value.fail_http === 429 || value.fail_http === 500) {
    directive.fail_http = value.fail_http;
  }
  const failTimes = nonNegativeNumber(value.fail_times);
  if (failTimes !== undefined) directive.fail_times = failTimes;
  if (value.hang === true) directive.hang = true;

  const inputTokens = nonNegativeNumber(value.tokens_in);
  if (inputTokens !== undefined) directive.tokens_in = inputTokens;
  const outputTokens = nonNegativeNumber(value.tokens_out);
  if (outputTokens !== undefined) directive.tokens_out = outputTokens;

  return directive;
}

export function stripFakeDirective(text: string): string {
  return text
    .replace(DIRECTIVE_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function applyFakeDirective(text: string): {
  text: string;
  directive: FakeDirective | null;
} {
  const directive = parseFakeDirective(text);
  return {
    text: directive ? stripFakeDirective(text) : text,
    directive,
  };
}

export function isFakeModel(modelId?: string | null): boolean {
  return devFakeLlm && modelId === FAKE_MODEL_ID;
}

export function fakeProviderRow() {
  return {
    id: FAKE_PROVIDER_ID,
    name: "Fake",
    base_url: "dev://fake",
    api_key: "",
    models: [FAKE_MODEL_ID],
    created_at: 0,
    builtin: true,
  };
}

export function fakeProviderResponse() {
  return { ...fakeProviderRow(), has_key: false };
}

export function fakeOpenAiModel(
  modelId = FAKE_MODEL_ID,
): Model<"openai-completions"> {
  return {
    id: modelId,
    name: "Fake",
    api: "openai-completions",
    provider: FAKE_PROVIDER_ID,
    baseUrl: "dev://fake",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: Number(process.env.LLM_CONTEXT_WINDOW ?? 64000),
    maxTokens: Number(process.env.LLM_MAX_TOKENS ?? 4096),
  };
}

export function queueFakeInput(input: {
  botId: string;
  botName: string;
  content: string;
  directive?: FakeDirective | null;
}): void {
  if (!devFakeLlm) return;
  const plan: FakePlan = {
    id: randomUUID(),
    botId: input.botId,
    botName: input.botName,
    anchor: input.content,
    directive: input.directive ?? {},
    failedRequests: 0,
    toolsEmitted: 0,
    outputsConsumed: 0,
    completed: false,
  };
  const existing = plansByAnchor.get(plan.anchor) ?? [];
  existing.push(plan);
  if (existing.length > 50) {
    const firstOpen = existing.findIndex((entry) => !entry.completed);
    existing.splice(0, firstOpen < 0 ? existing.length - 1 : firstOpen + 1);
  }
  plansByAnchor.set(plan.anchor, existing);
  latestPlansByBot.set(plan.botId, plan);
}

export function clearFakePlansForBot(botId: string): void {
  for (const [anchor, entries] of plansByAnchor) {
    const kept = entries.filter((entry) => entry.botId !== botId);
    if (kept.length === 0) plansByAnchor.delete(anchor);
    else if (kept.length !== entries.length) plansByAnchor.set(anchor, kept);
  }
  if (latestPlansByBot.get(botId)?.botId === botId) {
    latestPlansByBot.delete(botId);
  }
}

export function fakeToolResultOverride<T extends { output?: unknown }>(
  botId: string,
  call: { name?: unknown },
  result: T,
): T | undefined {
  const plan = latestPlansByBot.get(botId);
  if (!plan || plan.completed) return undefined;
  const tools = plan.directive.tool_calls ?? [];
  let index = -1;
  for (let i = plan.outputsConsumed; i < tools.length; i++) {
    if (tools[i].name === call.name) {
      index = i;
      break;
    }
  }
  if (index < 0 && plan.outputsConsumed < tools.length) {
    index = plan.outputsConsumed;
  }
  if (index < 0) return undefined;

  const output = tools[index].output;
  plan.outputsConsumed = index + 1;
  const details = (result as { details?: unknown }).details ?? {};
  return {
    ...result,
    details,
    output: [{ type: "text", text: output }] as never,
  } as T;
}

function messageText(message: unknown): string {
  const msg = message as { content?: unknown };
  if (typeof msg.content === "string") return msg.content;
  if (!Array.isArray(msg.content)) return "";
  return msg.content
    .map((block) => {
      const item = block as { type?: unknown; text?: unknown };
      return item.type === "text" && typeof item.text === "string"
        ? item.text
        : "";
    })
    .join("");
}

function latestUserText(context: TranscriptContext): string {
  for (let i = context.messages.length - 1; i >= 0; i--) {
    if ((context.messages[i] as { role?: unknown }).role === "user") {
      return messageText(context.messages[i]);
    }
  }
  return "";
}

function latestSystemText(context: TranscriptContext): string {
  for (let i = context.messages.length - 1; i >= 0; i--) {
    if ((context.messages[i] as { role?: unknown }).role === "system") {
      return messageText(context.messages[i]);
    }
  }
  return "";
}

function botNameFromContext(context: TranscriptContext): string {
  const match = latestSystemText(context).match(/You are "([^"]+)"\./);
  return match?.[1] ?? "bot";
}

function assistantAfterLatestUser(context: TranscriptContext): boolean {
  for (let i = context.messages.length - 1; i >= 0; i--) {
    const role = (context.messages[i] as { role?: unknown }).role;
    if (role === "assistant" || role === "toolResult") return true;
    if (role === "user") return false;
  }
  return false;
}

function findCurrentPlan(context: TranscriptContext): FakePlan | undefined {
  const anchor = latestUserText(context);
  if (!anchor) return undefined;
  const entries = plansByAnchor.get(anchor);
  if (!entries?.length) return undefined;
  for (const entry of entries) if (!entry.completed) return entry;
  return entries[entries.length - 1];
}

function emptyUsage(input = 0, output = 0): Usage {
  const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { ...cost, total: 0 },
  };
}

function baseMessage(
  model: Model<string>,
  content: AssistantMessage["content"] = [],
  stopReason: StopReason = "pending",
  usage = emptyUsage(),
  errorMessage?: string,
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage,
    stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }),
    timestamp: Date.now(),
  };
}

function snapshot(message: AssistantMessage): AssistantMessage {
  return structuredClone(message);
}

class FakeAbortedError extends Error {}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new FakeAbortedError();
  if (ms <= 0) {
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new FakeAbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitUntilAborted(signal?: AbortSignal): Promise<never> {
  if (!signal) return new Promise<never>(() => undefined);
  if (signal.aborted) throw new FakeAbortedError();
  await new Promise<void>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new FakeAbortedError()), {
      once: true,
    });
    void resolve;
  });
  throw new FakeAbortedError();
}

function chunks(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? [""];
}

async function streamThinking(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  partial: AssistantMessage,
  thinking: string,
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const index = partial.content.length;
  partial.content.push({ type: "thinking", thinking: "" });
  stream.push({
    type: "thinking_start",
    contentIndex: index,
    partial: snapshot(partial),
  });
  for (const chunk of chunks(thinking)) {
    await sleep(delayMs, signal);
    const block = partial.content[index];
    if (block?.type === "thinking") block.thinking += chunk;
    stream.push({
      type: "thinking_delta",
      contentIndex: index,
      delta: chunk,
      partial: snapshot(partial),
    });
  }
  const block = partial.content[index];
  if (block?.type === "thinking") block.thinking = thinking;
  stream.push({
    type: "thinking_end",
    contentIndex: index,
    content: thinking,
    partial: snapshot(partial),
  });
}

async function streamText(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  partial: AssistantMessage,
  text: string,
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const index = partial.content.length;
  partial.content.push({ type: "text", text: "" });
  stream.push({
    type: "text_start",
    contentIndex: index,
    partial: snapshot(partial),
  });
  await sleep(delayMs, signal);
  let first = true;
  for (const chunk of chunks(text)) {
    if (!first) await sleep(30, signal);
    first = false;
    const block = partial.content[index];
    if (block?.type === "text") block.text += chunk;
    stream.push({
      type: "text_delta",
      contentIndex: index,
      delta: chunk,
      partial: snapshot(partial),
    });
  }
  const block = partial.content[index];
  if (block?.type === "text") block.text = text;
  stream.push({
    type: "text_end",
    contentIndex: index,
    content: text,
    partial: snapshot(partial),
  });
}

async function streamToolCall(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  partial: AssistantMessage,
  toolName: string,
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const index = partial.content.length;
  const callId = `tool:${randomUUID()}`;
  partial.content.push({
    type: "toolCall",
    id: callId,
    name: toolName,
    arguments: {},
  });
  stream.push({
    type: "toolcall_start",
    contentIndex: index,
    partial: snapshot(partial),
  });
  await sleep(delayMs, signal);
  const block = partial.content[index];
  if (block?.type === "toolCall") block.arguments = {};
  stream.push({
    type: "toolcall_delta",
    contentIndex: index,
    delta: "{}",
    partial: snapshot(partial),
  });
  stream.push({
    type: "toolcall_end",
    contentIndex: index,
    toolCall: { type: "toolCall", id: callId, name: toolName, arguments: {} },
    partial: snapshot(partial),
  });
}

async function failStream(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  model: Model<string>,
  status: 429 | 500,
): Promise<void> {
  const message = baseMessage(
    model,
    [],
    "error",
    emptyUsage(),
    `HTTP ${status} fake provider failure`,
  );
  stream.push({ type: "start", partial: snapshot(message) });
  stream.push({ type: "error", reason: "error", error: snapshot(message) });
  stream.end(snapshot(message));
}

function usageFor(directive: FakeDirective): Usage {
  return emptyUsage(directive.tokens_in ?? 50, directive.tokens_out ?? 50);
}

async function writeStream(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  model: Model<string>,
  context: TranscriptContext,
  options?: unknown,
): Promise<void> {
  const typed = options as
    | {
        signal?: AbortSignal;
        onResponse?: (res: unknown, model: unknown) => Promise<void>;
      }
    | undefined;
  const found = findCurrentPlan(context);
  const plan = found && !found.completed ? found : undefined;
  const directive = plan?.directive ?? {};
  try {
    if (plan) {
      if (directive.fail_http && (directive.fail_times ?? 0) > 0) {
        if (plan.failedRequests < (directive.fail_times ?? 0)) {
          plan.failedRequests++;
          await typed?.onResponse?.(
            { status: directive.fail_http, headers: {} },
            model,
          );
          await failStream(stream, model, directive.fail_http);
          return;
        }
      }

      const message = baseMessage(model, [], "pending", usageFor(directive));
      stream.push({ type: "start", partial: snapshot(message) });
      await typed?.onResponse?.({ status: 200, headers: {} }, model);

      if (directive.hang) {
        await waitUntilAborted(typed?.signal);
      }

      const first = !assistantAfterLatestUser(context);
      let stopReason: Extract<StopReason, "stop" | "toolUse">;
      const tool = directive.tool_calls?.[plan.toolsEmitted];

      if (first) {
        const thinking = thinkingText(directive.thinking);
        if (thinking) {
          await streamThinking(stream, message, thinking, 30, typed?.signal);
        }
      }

      if (tool) {
        await streamToolCall(
          stream,
          message,
          tool.name,
          tool.delay_ms ?? directive.delay_ms ?? 0,
          typed?.signal,
        );
        stopReason = "toolUse";
        plan.toolsEmitted++;
      } else {
        const reply = directive.reply ?? `FAKE OK (${plan.botName})`;
        await streamText(
          stream,
          message,
          reply,
          directive.delay_ms ?? 1000,
          typed?.signal,
        );
        stopReason = "stop";
        plan.completed = true;
      }

      const finalMessage: AssistantMessage = {
        ...snapshot(message),
        usage: usageFor(directive),
        stopReason,
      };
      stream.push({
        type: "done",
        reason: stopReason,
        message: snapshot(finalMessage),
      });
      stream.end(snapshot(finalMessage));
      return;
    }

    const message = baseMessage(model, [], "pending", usageFor(directive));
    stream.push({ type: "start", partial: snapshot(message) });
    await typed?.onResponse?.({ status: 200, headers: {} }, model);
    await streamText(
      stream,
      message,
      `FAKE OK (${botNameFromContext(context)})`,
      1000,
      typed?.signal,
    );
    const finalMessage: AssistantMessage = {
      ...snapshot(message),
      usage: usageFor(directive),
      stopReason: "stop",
    };
    stream.push({
      type: "done",
      reason: "stop",
      message: snapshot(finalMessage),
    });
    stream.end(snapshot(finalMessage));
  } catch (err) {
    const aborted = err instanceof FakeAbortedError;
    const finalMessage = baseMessage(
      model,
      [],
      aborted ? "aborted" : "error",
      usageFor(directive),
      aborted
        ? "Request was aborted"
        : err instanceof Error
          ? err.message
          : String(err),
    );
    stream.push({
      type: "error",
      reason: aborted ? "aborted" : "error",
      error: snapshot(finalMessage),
    });
    stream.end(snapshot(finalMessage));
  }
}

function createFakeStream(
  model: Model<string>,
  context: TranscriptContext,
  options?: unknown,
): ReturnType<typeof createAssistantMessageEventStream> {
  const outer = createAssistantMessageEventStream();
  queueMicrotask(() => {
    void writeStream(outer, model, context, options);
  });
  return outer;
}

export function registerFakeProvider(models: MutableModels): void {
  if (!devFakeLlm) return;
  const provider = {
    id: FAKE_PROVIDER_ID,
    name: "Fake",
    auth: {
      apiKey: {
        name: "Built-in fake provider",
        check: async () => ({ type: "api_key" }),
        resolve: async () => ({
          auth: { apiKey: "" },
          source: "dev:fake",
        }),
      },
    },
    getModels() {
      return [fakeOpenAiModel()];
    },
    stream(
      model: Model<string>,
      context: TranscriptContext,
      options?: unknown,
    ) {
      return createFakeStream(model, context, options);
    },
    streamSimple(
      model: Model<string>,
      context: TranscriptContext,
      options?: unknown,
    ) {
      return createFakeStream(model, context, options);
    },
  };
  models.setProvider(provider as unknown as Provider);
}
