import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: "http://localhost/bots",
});
const { window } = dom;

Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PopStateEvent: window.PopStateEvent,
  location: window.location,
  history: window.history,
  addEventListener: (...a: Parameters<typeof window.addEventListener>) =>
    window.addEventListener(...a),
  removeEventListener: (...a: Parameters<typeof window.removeEventListener>) =>
    window.removeEventListener(...a),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { TAB_PATHS, tabFromPath, useTabRoute } = await import(
  "../src/hooks/useTabRoute.ts"
);
const act = React.act;

const holder: { setTab?: (tab: "machines") => void } = {};

function Probe(): React.ReactNode {
  const [tab, setTab] = useTabRoute();
  holder.setTab = setTab as (tab: "machines") => void;
  return React.createElement("span", null, tab);
}

test("tabFromPath maps known paths and falls back to bots", () => {
  assert.equal(tabFromPath("/roles"), "roles");
  assert.equal(tabFromPath("/machines/"), "machines");
  assert.equal(tabFromPath("/"), "bots");
  assert.equal(tabFromPath("/wat"), "bots");
});

test("useTabRoute derives, pushes, and restores through the router", async () => {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Probe));
  });
  const text = () => container.textContent ?? "";

  assert.equal(text(), "bots");

  await act(async () => holder.setTab?.("machines"));
  assert.equal(window.location.pathname, TAB_PATHS.machines);
  assert.equal(text(), "machines");

  window.history.pushState({}, "", "/roles");
  await act(async () => {
    window.dispatchEvent(new window.PopStateEvent("popstate"));
  });
  assert.equal(text(), "roles");

  window.history.pushState({}, "", "/nowhere");
  await act(async () => {
    window.dispatchEvent(new window.PopStateEvent("popstate"));
  });
  assert.equal(text(), "bots");

  await act(async () => root.unmount());
});
