import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { it as test } from "vitest";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/activity",
});
const { window } = dom;

Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  InputEvent: window.InputEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
globalThis.alert = () => undefined;

const requested: string[] = [];
let rows: unknown[] = [
  {
    id: 1,
    created_at: Date.now(),
    actor_kind: "user",
    actor_id: null,
    actor_name: "ops@example.com",
    action: "bot.create",
    target_kind: "bot",
    target_id: "b-1",
    target_name: "Atlas",
    summary: "created bot Atlas",
  },
];

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  requested.push(url);
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { ActivityPanel } = await import("../src/panels/ActivityPanel.tsx");
const act = React.act;

test("ActivityPanel lists audit entries newest first", async () => {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ActivityPanel, {}));
  });
  assert.ok(requested.some((u) => u.startsWith("/api/audit?")));
  const html = container.innerHTML;
  assert.match(html, /bot\.create/);
  assert.match(html, /ops@example\.com/);

  rows = [];
  const search = window.document.querySelector(
    'input[aria-label="Filter activity"]',
  ) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(search, "Atlas");
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  assert.ok(
    requested.some((u) => u.includes("q=Atlas")),
    JSON.stringify(requested),
  );

  await act(async () => {
    root.unmount();
  });
});
