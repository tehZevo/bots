import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { it as test } from "vitest";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
const { window } = dom;
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { InboxPanel } = await import("../src/panels/InboxPanel.tsx");
const act = React.act;

function questionItem(over: Record<string, unknown> = {}) {
  return {
    id: "q1",
    kind: "question",
    bot_id: "b1",
    bot_name: "Sable",
    title: "Sable: Which env?",
    detail: "dev / prod",
    target_path: "/bots?bot=b1",
    created_at: Date.now(),
    question_id: "q1",
    question_options: ["dev", "prod"],
    question_allow_other: true,
    ...over,
  };
}

async function render(
  item: Record<string, unknown>,
  props: Partial<Parameters<typeof InboxPanel>[0]> = {},
) {
  window.document.body.innerHTML = "";
  const root = createRoot(window.document.body);
  await act(async () =>
    root.render(
      React.createElement(InboxPanel, {
        items: [item],
        unreadCount: 0,
        lastResolvedAt: null,
        onOpenItem: () => undefined,
        onMarkRead: () => undefined,
        onMarkAllRead: () => undefined,
        onDecideApproval: () => undefined,
        onAnswerQuestion: () => undefined,
        onOpenChat: () => undefined,
        ...props,
      }),
    ),
  );
  return root;
}

function click(el: Element | null): void {
  (el as HTMLElement).dispatchEvent(
    new window.MouseEvent("click", { bubbles: true }),
  );
}

test("question row answers inline via option buttons", async () => {
  const answers: [string, string][] = [];
  const root = await render(questionItem(), {
    onAnswerQuestion: (id, answer) => answers.push([id, answer]),
  });
  const actions = window.document.querySelector(".questionactions");
  assert.ok(actions);
  const buttons = [...actions.querySelectorAll("button")];
  click(buttons.find((b) => b.textContent === "dev") ?? null);
  click(buttons.find((b) => b.textContent === "prod") ?? null);
  assert.deepEqual(answers, [
    ["q1", "dev"],
    ["q1", "prod"],
  ]);
  await act(async () => root.unmount());
});

test("Other reveals a free-text answer field", async () => {
  const answers: string[] = [];
  const root = await render(questionItem(), {
    onAnswerQuestion: (_id, answer) => answers.push(answer),
  });
  const actions = window.document.querySelector(".questionactions");
  const other = [...(actions?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === "Other…",
  );
  await act(async () => {
    click(other ?? null);
  });
  const input = window.document.querySelector<HTMLInputElement>(
    ".questionother input",
  );
  assert.ok(input);
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setValue?.call(input, "staging");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  const form = window.document.querySelector(".questionother");
  await act(async () => {
    form?.dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  assert.deepEqual(answers, ["staging"]);
  await act(async () => root.unmount());
});

test("question row carries a chat button", async () => {
  const opened: string[] = [];
  const root = await render(questionItem(), {
    onOpenChat: (botId) => opened.push(botId),
  });
  click(window.document.querySelector(".questionchat"));
  assert.deepEqual(opened, ["b1"]);
  await act(async () => root.unmount());
});
