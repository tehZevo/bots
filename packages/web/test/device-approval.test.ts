import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost/device?user_code=abcd-efgh" },
);
const { window } = dom;

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: window.navigator,
});
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  history: window.history,
  location: window.location,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const requests: string[] = [];
let pendingStatus = 200;
let lastApproveBody: Record<string, unknown> | null = null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  requests.push(`${method} ${url}`);
  if (method === "POST" && url.includes("/api/auth/device/approve")) {
    lastApproveBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (url.startsWith("/api/auth/device/pending")) {
    if (pendingStatus !== 200)
      return new Response("{}", { status: pendingStatus });
    return new Response(
      JSON.stringify({
        client_name: "workstation",
        key_name: null,
        expires_at: Date.now() + 300_000,
      }),
      { status: 200 },
    );
  }
  return new Response("{}", { status: 404 });
}) as typeof globalThis.fetch;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { DeviceApproval, normalizeCode } = await import(
  "../src/device-approval.tsx"
);
const act = React.act;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(): Promise<ReturnType<typeof createRoot>> {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(DeviceApproval));
  });
  await flush();
  return root;
}

async function click(element: Element | null | undefined): Promise<void> {
  assert.ok(element, "expected element to click");
  await act(async () => {
    element.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  await flush();
}

function button(text: string): Element | null {
  return [...window.document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes(text),
  );
}

test("approval page resolves the code from the URL and approves", async () => {
  const root = await mount();
  try {
    assert.match(window.document.body.textContent ?? "", /workstation/);
    await click(button("Approve"));
    assert.ok(
      requests.some((r) => r === "POST /api/auth/device/approve"),
      "approve POST expected",
    );
    assert.equal(lastApproveBody?.decision, "approve");
    assert.equal(lastApproveBody?.user_code, "abcd-efgh");
    assert.match(window.document.body.textContent ?? "", /Approved/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("unknown codes show a dead-code message", async () => {
  pendingStatus = 404;
  const root = await mount();
  try {
    assert.match(
      window.document.body.textContent ?? "",
      /unknown, expired or used/,
    );
  } finally {
    pendingStatus = 200;
    await act(async () => {
      root.unmount();
    });
  }
});

test("a custom key name rides along on approval", async () => {
  const root = await mount();
  try {
    const input = window.document.querySelector(
      '.field input[placeholder^="bots-cli"]',
    ) as HTMLInputElement;
    assert.ok(input, "key name field expected");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setter?.call(input, "desk key");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await click(button("Approve"));
    assert.equal(lastApproveBody?.key_name, "desk key");
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("normalizeCode ignores case, spaces and hyphens", () => {
  assert.equal(normalizeCode(" ab-cd ef12 "), "ABCDEF12");
});
