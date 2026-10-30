import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/roles",
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
globalThis.alert = () => undefined;

const requested: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  requested.push(url);
  return new Response(
    JSON.stringify([
      { id: "r-1", name: "Ops", instructions: "watch the queue" },
      { id: "r-2", name: "Research", instructions: "read things" },
    ]),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as typeof fetch;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { RolesPanel } = await import("../src/panels/RolesPanel.tsx");
const act = React.act;

test("RolesPanel renders standalone against a stubbed fetch", async () => {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(RolesPanel, {}));
  });
  assert.deepEqual(requested, ["/api/roles"]);
  assert.match(container.textContent ?? "", /Ops/);
  assert.match(container.textContent ?? "", /Research/);
  const create = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Create role",
  );
  assert.ok(create, "expected create button");
  await act(async () => root.unmount());
});
