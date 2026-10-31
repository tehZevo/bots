import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { it as test } from "vitest";

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost/bots" },
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
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLSelectElement: window.HTMLSelectElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PopStateEvent: window.PopStateEvent,
  PointerEvent: window.MouseEvent,
  history: window.history,
  location: window.location,
  localStorage: window.localStorage,
  addEventListener: window.addEventListener.bind(window),
  removeEventListener: window.removeEventListener.bind(window),
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  IS_REACT_ACT_ENVIRONMENT: true,
});
window.HTMLElement.prototype.scrollIntoView = () => undefined;
globalThis.alert = () => undefined;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { App } = await import("../src/App.tsx");
const act = React.act;

const now = Date.now();
const bot = {
  id: "b1",
  name: "Sable",
  instructions: "",
  model_id: null,
  role_id: null,
  machine_id: null,
  avatar_shape: null,
  avatar_color: null,
  sound: null,
  enabled: 1,
  archived: 0,
  created_at: now,
  run_state: "enabled",
  health: "blue",
  status: null,
  status_level: null,
};

const requests: string[] = [];
let currentRunId = "run-target";
let notificationItems: Record<string, unknown>[] = [];

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : String(input);
  const method = init?.method ?? "GET";
  requests.push(`${method} ${url}`);
  if (url === "/api/bots" || url === "/api/bots?archived=1") return json([bot]);
  if (url === "/api/notifications") {
    return json({
      items: notificationItems,
      unread_count: notificationItems.filter((item) => item.read === 0).length,
    });
  }
  if (url === "/api/inbox") {
    return json(
      notificationItems.map((item) => ({
        id: `notification:${String(item.id)}`,
        kind: String(item.kind),
        bot_id: item.bot_id,
        bot_name: "Sable",
        title: item.title,
        detail: item.body,
        target_path: item.target_path,
        created_at: item.created_at,
        notification_id: item.id,
        read: item.read,
      })),
    );
  }
  const readMatch = /^\/api\/notifications\/([^/]+)\/read$/.exec(url);
  if (readMatch && method === "POST") {
    notificationItems = notificationItems.map((item) =>
      item.id === readMatch[1] ? { ...item, read: 1 } : item,
    );
    return json({ ok: true });
  }
  if (/^\/api\/bots\/[^/]+\/messages$/.test(url)) {
    return json([
      { role: "user", text: "hello" },
      { role: "assistant", text: "all good" },
    ]);
  }
  if (/^\/api\/bots\/[^/]+\/runs$/.test(url)) {
    return json([
      {
        id: currentRunId,
        status: "error",
        trigger: "manual",
        started_at: now,
        finished_at: now + 1000,
        output: null,
        error: "boom",
      },
    ]);
  }
  const transcriptMatch =
    /^\/api\/bots\/[^/]+\/runs\/([^/]+)\/transcript$/.exec(url);
  if (transcriptMatch) {
    return json({
      run: { id: transcriptMatch[1], status: "error", trigger: "manual" },
      usage: { total: 3200 },
      steps: [
        { kind: "user", text: `${transcriptMatch[1]} transcript`, at: now },
      ],
    });
  }
  if (url === "/api/pause") return json({ paused: false });
  if (url === "/api/breaker") return json(null);
  return json([]);
}) as typeof fetch;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountApp(url: string): Promise<ReturnType<typeof createRoot>> {
  window.history.replaceState({}, "", url);
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(App));
  });
  for (let i = 0; i < 4; i++) await flush();
  return root;
}

async function click(element: Element | null | undefined): Promise<void> {
  assert.ok(element, "expected element to click");
  await act(async () => {
    element.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  for (let i = 0; i < 4; i++) await flush();
}

function byLabel(label: string): Element | null {
  return window.document.querySelector(`[aria-label="${label}"]`);
}

test("notification deep links open chat and expand the run in Logs", async () => {
  notificationItems = [];
  currentRunId = "run-target";
  const root = await mountApp("/bots?bot=b1&run=run-target");
  try {
    assert.ok(byLabel("Sable chat"));
    assert.match(window.document.body.textContent ?? "", /all good/);
    assert.equal(
      window.document.querySelector(".mtabs button.sel")?.textContent,
      "Logs",
    );
    assert.match(
      requests.join("\n"),
      /GET \/api\/bots\/b1\/runs\/run-target\/transcript/,
    );
    assert.match(
      window.document.body.textContent ?? "",
      /run-target transcript/,
    );
  } finally {
    await act(async () => root.unmount());
  }
});

test("clicking a notification routes to its source and Back returns home", async () => {
  notificationItems = [
    {
      id: "n1",
      kind: "run_error",
      title: "Sable: run failed",
      body: "boom",
      bot_id: "b1",
      run_id: "run-target2",
      target_path: "/bots?bot=b1&run=run-target2",
      read: 0,
      created_at: now,
    },
  ];
  currentRunId = "run-target2";
  const root = await mountApp("/bots");
  try {
    await click(byLabel("Inbox, 1 item"));
    const row = window.document.querySelector(".inboxrow");
    assert.ok(row);
    assert.match(row.textContent ?? "", /Sable: run failed/);
    await click(row);

    assert.equal(window.location.pathname, "/bots");
    assert.ok(
      new URLSearchParams(window.location.search).get("run") === "run-target2",
    );
    assert.ok(requests.includes("POST /api/notifications/n1/read"));
    assert.ok(byLabel("Sable chat"));
    assert.match(
      window.document.body.textContent ?? "",
      /run-target2 transcript/,
    );

    await act(async () => {
      window.history.back();
      for (
        let i = 0;
        i < 30 && new URLSearchParams(window.location.search).get("run");
        i++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });
    assert.equal(new URLSearchParams(window.location.search).get("run"), null);
    assert.equal(byLabel("Sable chat"), null);
  } finally {
    await act(async () => root.unmount());
  }
});
