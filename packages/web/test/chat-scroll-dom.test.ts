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
const { Chat } = await import("../src/components/Chat.tsx");
const act = React.act;

let turns: { role: string; text: string }[] = [];
window.fetch = (async () => ({
  ok: true,
  status: 200,
  json: async () => turns,
})) as unknown as typeof window.fetch;
globalThis.fetch = window.fetch;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function logEl(): HTMLElement {
  const el = window.document.querySelector<HTMLElement>(".chat-log");
  assert.ok(el);
  return el;
}

function makeScrollable(
  el: HTMLElement,
  scrollHeight: number,
  clientHeight: number,
) {
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
  return {
    get top() {
      return top;
    },
    set top(value: number) {
      top = value;
    },
  };
}

test("chat opens on the newest turn and only follows from the bottom", async () => {
  turns = [];
  const root = createRoot(window.document.body);
  // working=true keeps the poll interval short enough for a test.
  await act(async () => {
    root.render(
      React.createElement(Chat, {
        botId: "b1",
        botName: "Sable",
        enabled: true,
        working: true,
      }),
    );
  });

  const el = logEl();
  const scroll = makeScrollable(el, 1200, 300);

  turns = [...turns, { role: "assistant", text: "first" }];
  await act(async () => {
    await sleep(900);
  });
  assert.equal(scroll.top, 1200, "opening lands on the newest turn");

  turns = [...turns, { role: "assistant", text: "second" }];
  await act(async () => {
    await sleep(900);
  });
  assert.equal(scroll.top, 1200, "keeps following while at the bottom");

  scroll.top = 120;
  await act(async () => {
    el.dispatchEvent(new window.Event("scroll"));
  });
  turns = [...turns, { role: "assistant", text: "third" }];
  await act(async () => {
    await sleep(900);
  });
  assert.equal(scroll.top, 120, "reading history is not yanked to the bottom");

  scroll.top = 950;
  await act(async () => {
    el.dispatchEvent(new window.Event("scroll"));
  });
  turns = [...turns, { role: "assistant", text: "fourth" }];
  await act(async () => {
    await sleep(900);
  });
  assert.equal(scroll.top, 1200, "returning to the bottom resumes following");

  root.unmount();
});
