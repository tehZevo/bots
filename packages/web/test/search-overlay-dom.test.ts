import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

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
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  history: window.history,
  location: window.location,
  localStorage: window.localStorage,
  addEventListener: window.addEventListener.bind(window),
  removeEventListener: window.removeEventListener.bind(window),
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const now = Date.now();
function sampleBot(
  id: string,
  name: string,
  runState: "running" | "enabled",
): Record<string, unknown> {
  return {
    id,
    name,
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
    run_state: runState,
    health: runState === "running" ? "green" : "blue",
    status: null,
    status_level: null,
    current_task: null,
    current_task_updated_at: null,
  };
}

const bots = [
  sampleBot("a1", "Atlas", "enabled"),
  sampleBot("b1", "Broken", "enabled"),
  sampleBot("s1", "Sable", "running"),
];

let requests: string[] = [];
let pausedFlag = false;
const calls = {
  openEntity: [] as Record<string, unknown>[],
  navigate: [] as string[],
  newBot: 0,
  changed: 0,
  closed: 0,
};

function resetState(): void {
  requests = [];
  pausedFlag = false;
  calls.openEntity = [];
  calls.navigate = [];
  calls.newBot = 0;
  calls.changed = 0;
  calls.closed = 0;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  requests.push(`${method} ${url}`);
  if (url.startsWith("/api/search?q=alpha")) {
    return json({
      groups: [
        {
          type: "bots",
          total: 2,
          matches: [
            {
              type: "bots",
              id: "a1",
              name: "Atlas alpha",
              subtitle: "Ops role",
            },
            {
              type: "bots",
              id: "b1",
              name: "Broken alpha",
              subtitle: null,
            },
          ],
        },
        {
          type: "roles",
          total: 3,
          matches: [
            {
              type: "roles",
              id: "r1",
              name: "Role alpha",
              subtitle: "instructions",
            },
          ],
        },
      ],
    });
  }
  if (url === "/api/bots/a1/run" && method === "POST")
    return json({ runId: "run-a", steered: false });
  if (url === "/api/bots/s1/interrupt" && method === "POST")
    return json({ ok: true });
  if (url === "/api/bots/b1/run" && method === "POST")
    return json({ error: "boom" }, 500);
  if (url === "/api/pause" && method === "POST") {
    const body = JSON.parse(String(init?.body)) as { paused?: boolean };
    pausedFlag = Boolean(body.paused);
    return json({ paused: pausedFlag });
  }
  if (url === "/api/stop-all" && method === "POST") return json({ stopped: 1 });
  if (url.startsWith("/api/search?q=archived")) {
    return json({
      groups: [
        {
          type: "bots",
          total: 0,
          matches: [],
        },
        {
          type: "archived_bots",
          total: 1,
          matches: [
            {
              type: "archived_bots",
              id: "old",
              name: "Old archived bot",
              subtitle: "No role",
            },
          ],
        },
      ],
    });
  }
  return json([]);
}) as typeof globalThis.fetch;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { SearchOverlay } = await import("../src/App.tsx");
const act = React.act;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountOverlay(): Promise<ReturnType<typeof createRoot>> {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(SearchOverlay, {
        bots,
        paused: false,
        onClose: () => calls.closed++,
        onOpenEntity: (match: Record<string, unknown>) =>
          calls.openEntity.push(match),
        onNavigate: (tab: string) => calls.navigate.push(tab),
        onNewBot: () => calls.newBot++,
        onChanged: () => calls.changed++,
      }),
    );
  });
  return root;
}

async function waitFor(
  condition: () => boolean,
  label = "condition",
): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > 1500)
      throw new Error(`timed out waiting for ${label}`);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
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

function input(): Element | null {
  return window.document.querySelector(
    '[aria-label="Search or enter a command"]',
  );
}

async function setQuery(value: string): Promise<void> {
  const control = input();
  assert.ok(control, "expected search input");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(control, value);
    control.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function pressPanel(key: string): Promise<void> {
  const panel = window.document.querySelector(".searchpanel");
  assert.ok(panel, "expected search panel");
  await act(async () => {
    panel.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await flush();
}

async function pressWindow(key: string): Promise<void> {
  await act(async () => {
    window.dispatchEvent(
      new window.KeyboardEvent("keydown", { key, bubbles: true }),
    );
  });
  await flush();
}

function row(text: string): Element | null {
  return [...window.document.querySelectorAll(".searchrow")].find((item) =>
    (item.textContent ?? "").includes(text),
  );
}

test("search results highlight, group-cycle with Tab, and open records", async () => {
  resetState();
  const root = await mountOverlay();
  try {
    await setQuery("alpha");
    await waitFor(
      () => Boolean(window.document.querySelector(".searchrow")),
      "search rows",
    );

    assert.match(window.document.body.textContent ?? "", /Atlas alpha/);
    assert.match(window.document.body.textContent ?? "", /\+2 more/);
    assert.ok(window.document.querySelector("mark"), "expected highlight mark");
    assert.equal(
      window.document
        .querySelector('[aria-selected="true"]')
        ?.textContent?.includes("Atlas alpha"),
      true,
    );

    await pressPanel("Tab");
    assert.equal(
      window.document
        .querySelector('[aria-selected="true"]')
        ?.textContent?.includes("Role alpha"),
      true,
    );

    await pressPanel("ArrowUp");
    await pressPanel("ArrowUp");
    await pressPanel("Enter");
    assert.deepEqual(calls.openEntity[0], {
      type: "bots",
      id: "a1",
      name: "Atlas alpha",
      subtitle: "Ops role",
    });
  } finally {
    await act(async () => root.unmount());
  }
});

test("command palette skips disabled actions and executes the first enabled match", async () => {
  resetState();
  const root = await mountOverlay();
  try {
    await setQuery("> stop");
    await waitFor(() => Boolean(row("Stop Sable")), "stop command rows");
    assert.match(window.document.body.textContent ?? "", /Not running/);

    await pressPanel("Enter");
    await waitFor(
      () => requests.includes("POST /api/bots/s1/interrupt"),
      "interrupt request",
    );
    assert.equal(calls.changed, 1);
    assert.equal(calls.closed, 1);
  } finally {
    await act(async () => root.unmount());
  }
});

test("destructive palette commands confirm before running", async () => {
  resetState();
  const root = await mountOverlay();
  try {
    await setQuery("> pause");
    await waitFor(() => Boolean(row("Pause all")), "pause command");
    await pressPanel("Enter");
    assert.ok(
      window.document.querySelector('[role="alertdialog"]'),
      "expected confirmation dialog",
    );
    assert.equal(requests.includes("POST /api/pause"), false);

    const confirm = [
      ...window.document.querySelectorAll(".confirm button"),
    ].find((item) => item.textContent?.trim() === "Pause all");
    await click(confirm);
    await waitFor(() => pausedFlag, "pause request");
    assert.equal(calls.closed, 1);
  } finally {
    await act(async () => root.unmount());
  }
});

test("failed commands remain open and surface inline errors", async () => {
  resetState();
  const root = await mountOverlay();
  try {
    await setQuery("> run broken");
    await waitFor(() => Boolean(row("Run Broken")), "broken run command");
    await pressPanel("Enter");
    await waitFor(
      () => (window.document.body.textContent ?? "").includes("boom"),
      "inline command error",
    );
    assert.equal(calls.closed, 0);
  } finally {
    await act(async () => root.unmount());
  }
});

test("Escape leaves command mode before closing the overlay", async () => {
  resetState();
  const root = await mountOverlay();
  try {
    await setQuery("> new");
    await waitFor(() => Boolean(row("New bot")), "new bot command");

    await pressWindow("Escape");
    assert.equal(
      window.document.querySelector(".searchoverlay") !== null,
      true,
    );
    assert.equal((input() as window.HTMLInputElement).value, "");
    assert.match(
      window.document.body.textContent ?? "",
      /Type at least two characters/,
    );
    assert.equal(calls.closed, 0);

    await pressWindow("Escape");
    assert.equal(calls.closed, 1);
  } finally {
    await act(async () => root.unmount());
  }
});

test("archived search results are grouped separately", async () => {
  resetState();
  const root = await mountOverlay();
  try {
    await setQuery("archived");
    await waitFor(
      () => Boolean(row("Old archived bot")),
      "archived search result",
    );
    assert.match(window.document.body.textContent ?? "", /Archived bots/);

    await click(row("Old archived bot"));
    assert.deepEqual(calls.openEntity[0], {
      type: "archived_bots",
      id: "old",
      name: "Old archived bot",
      subtitle: "No role",
    });
  } finally {
    await act(async () => root.unmount());
  }
});
