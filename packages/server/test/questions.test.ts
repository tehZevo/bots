import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-questions-")),
  "t.db",
);

const dbm = await import("../src/db.ts");
const questions = await import("../src/questions.ts");

for (const id of ["q-bot", "q-other"]) {
  dbm.insertBot({
    id,
    name: id,
    instructions: "",
    model: "test/model",
    role_id: null,
    machine_id: null,
    enabled: 1,
    archived: 0,
    created_at: Date.now(),
  } as never);
}

test("postQuestion stores options and allow_other", () => {
  const row = questions.postQuestion("q-bot", {
    question: "Which env?",
    options: ["dev", "prod"],
    allowOther: true,
  });
  assert.equal(row.status, "pending");
  assert.deepEqual(row.options, ["dev", "prod"]);
  assert.equal(row.allow_other, true);
  assert.equal(dbm.listPendingQuestions("q-bot").length, 1);
});

test("validateQuestion enforces 2-6 distinct options", () => {
  assert.equal(
    questions.validateQuestion({ question: "x", options: ["a"] }),
    "options must contain between 2 and 6 entries",
  );
  assert.equal(
    questions.validateQuestion({ question: "x", options: ["a", "a"] }),
    "options must be distinct",
  );
  assert.equal(
    questions.validateQuestion({ question: " ", options: ["a", "b"] }),
    "question is required",
  );
  assert.equal(
    questions.validateQuestion({ question: "x", options: ["a", "b"] }),
    null,
  );
});

test("pendingNote lists open questions", () => {
  const note = questions.pendingNote("q-bot");
  assert.ok(note?.includes("Which env?"));
  assert.ok(questions.pendingNote("q-other") === undefined);
});

test("answerQuestion marks answered and audits", () => {
  const row = dbm.listPendingQuestions("q-bot")[0];
  const res = questions.answerQuestion(row.id, "prod", {
    kind: "user",
    name: "tester",
  });
  assert.equal(res.ok, true);
  assert.equal(res.row?.status, "answered");
  assert.equal(res.row?.answer, "prod");
  assert.equal(dbm.listPendingQuestions("q-bot").length, 0);
  const again = questions.answerQuestion(row.id, "dev", { kind: "user" });
  assert.equal(again.ok, false);
  assert.equal(again.error, "question is answered");
});

test("cancelPending marks cancelled without answering", () => {
  questions.postQuestion("q-bot", { question: "Retry?", options: ["y", "n"] });
  const cancelled = questions.cancelPending("q-bot", { kind: "user" });
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].status, "cancelled");
  assert.equal(dbm.getQuestion(cancelled[0].id)?.status, "cancelled");
  assert.equal(questions.cancelPending("q-other", { kind: "user" }).length, 0);
});

test("inbox surfaces pending questions with options", () => {
  questions.postQuestion("q-other", {
    question: "Pick a color",
    options: ["red", "blue"],
    allowOther: true,
  });
  const item = dbm
    .listInboxItems()
    .find((i) => i.kind === "question" && i.bot_id === "q-other");
  assert.ok(item);
  assert.deepEqual(item?.question_options, ["red", "blue"]);
  assert.equal(item?.question_allow_other, true);
  assert.ok(item?.title.includes("Pick a color"));
});
