import { randomUUID } from "node:crypto";
import { logAudit } from "./audit.ts";
import {
  cancelPendingQuestions,
  getBot,
  getQuestion,
  insertQuestion,
  listPendingQuestions,
  answerQuestion as markAnswered,
  type QuestionRow,
} from "./db.ts";
import { injectMessage } from "./durable-runs.ts";

export interface QuestionActor {
  kind: "user" | "bot";
  id?: string | null;
  name?: string | null;
}

function audit(
  actor: QuestionActor,
  action: string,
  row: QuestionRow,
  summary: string,
): void {
  logAudit({
    actor:
      actor.kind === "bot"
        ? {
            kind: "bot" as const,
            id: actor.id ?? row.bot_id,
            name: actor.name ?? "bot",
          }
        : {
            kind: "user" as const,
            id: actor.id ?? null,
            name: actor.name ?? "user",
          },
    action,
    targetKind: "question",
    targetId: row.id,
    targetName: row.question.slice(0, 120),
    summary,
  });
}

export function validateQuestion(input: {
  question?: string;
  options?: string[];
}): string | null {
  if (!input.question?.trim()) return "question is required";
  const options = (input.options ?? []).map((o) => o.trim()).filter(Boolean);
  if (options.length < 2 || options.length > 6)
    return "options must contain between 2 and 6 entries";
  if (new Set(options).size !== options.length)
    return "options must be distinct";
  return null;
}

export function postQuestion(
  botId: string,
  input: { question: string; options: string[]; allowOther?: boolean },
  actor: QuestionActor = { kind: "bot", id: botId },
): QuestionRow {
  const row: QuestionRow = {
    id: randomUUID(),
    bot_id: botId,
    question: input.question.trim(),
    options: input.options.map((o) => o.trim()).filter(Boolean),
    allow_other: input.allowOther === true,
    status: "pending",
    answer: null,
    created_at: Date.now(),
    answered_at: null,
  };
  insertQuestion({
    id: row.id,
    bot_id: botId,
    question: row.question,
    options: row.options,
    allow_other: row.allow_other,
  });
  audit(actor, "question.post", row, `asked: ${row.question.slice(0, 120)}`);
  return row;
}

// specs/tools/questions.md — the answer is an ordinary user turn through the
// steering path: a live loop is steered, an idle bot starts a run.
export function answerQuestion(
  id: string,
  answer: string,
  actor: QuestionActor,
): { ok: boolean; error?: string; row?: QuestionRow } {
  const existing = getQuestion(id);
  if (!existing) return { ok: false, error: "not found" };
  if (existing.status !== "pending")
    return { ok: false, error: `question is ${existing.status}` };
  const bot = getBot(existing.bot_id);
  if (!bot) return { ok: false, error: "bot is gone" };
  if (!markAnswered(id, answer))
    return { ok: false, error: "question is no longer pending" };
  const row = getQuestion(id) ?? existing;
  audit(actor, "question.answer", row, `answered: ${answer.slice(0, 120)}`);
  injectMessage(bot, answer, "question");
  return { ok: true, row };
}

// A direct chat message supersedes queued choices; cancelling never wakes a bot.
export function cancelPending(
  botId: string,
  actor: QuestionActor,
): QuestionRow[] {
  const cancelled = cancelPendingQuestions(botId);
  for (const row of cancelled)
    audit(actor, "question.cancel", row, "cancelled by a direct chat message");
  return cancelled;
}

export function pendingNote(botId: string): string | undefined {
  const pending = listPendingQuestions(botId);
  if (pending.length === 0) return undefined;
  return [
    "## Pending questions",
    "You asked a human these questions and are waiting on answers. Hold the related blocker until an answer arrives; unrelated work continues normally.",
    ...pending.map((row) => `- id: ${row.id} — ${row.question}`),
  ].join("\n");
}
