import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { it as test } from "vitest";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/settings",
});
const { window } = dom;

Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const calls: string[] = [];
let keys: unknown[] = [
  { id: "k-1", name: "ci", created_at: 0, last_used_at: null },
];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push(`${init?.method ?? "GET"} ${url}`);
  if (init?.method === "POST")
    return new Response(JSON.stringify({ value: "bots_secret_123" }), {
      status: 200,
    });
  keys = keys.filter(
    (k) => !calls.includes(`DELETE /api/api-keys/${(k as { id: string }).id}`),
  );
  return new Response(JSON.stringify(keys), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { ApiKeysSection } = await import(
  "../src/panels/settings/ApiKeysSection.tsx"
);
const act = React.act;

async function typeInto(element: Element | null, value: string) {
  assert.ok(element, "expected input");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

test("ApiKeysSection loads keys, reveals created key once, refreshes on revoke", async () => {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ApiKeysSection));
  });
  assert.ok(calls.includes("GET /api/api-keys"));
  assert.match(container.textContent ?? "", /ci/);

  await typeInto(
    container.querySelector('input[placeholder="Key name"]'),
    "deploy",
  );
  const add = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Add key",
  );
  await act(async () => {
    add?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.match(container.textContent ?? "", /shown once: bots_secret_123/);

  const revoke = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Revoke",
  );
  await act(async () => {
    revoke?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.ok(calls.some((c) => c.startsWith("DELETE /api/api-keys/k-1")));
  assert.ok(
    calls.filter((c) => c === "GET /api/api-keys").length >= 2,
    "expected key list refresh after revoke",
  );

  await act(async () => root.unmount());
});
