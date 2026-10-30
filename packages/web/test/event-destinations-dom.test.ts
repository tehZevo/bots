import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { it as test } from "vitest";

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost/settings" },
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
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  history: window.history,
  location: window.location,
  localStorage: window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
window.HTMLElement.prototype.scrollIntoView = () => undefined;
globalThis.alert = (message?: unknown) => {
  assert.fail(`unexpected alert: ${String(message)}`);
};

interface Destination {
  id: string;
  name: string;
  url: string;
  event_types: string[];
  enabled: number;
  created_at: number;
  has_secret: boolean;
}

let destinations: Destination[] = [
  {
    id: "h1",
    name: "Ops hook",
    url: "https://example.test/hook",
    event_types: ["run.finished"],
    enabled: 1,
    created_at: Date.now(),
    has_secret: true,
  },
];

const requests: string[] = [];
let lastPostBody: Record<string, unknown> | null = null;
let lastPutBody: Record<string, unknown> | null = null;
let testCalls = 0;

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function publicDestination(destination: Destination): Destination {
  return {
    ...destination,
    event_types: [...destination.event_types],
  };
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  requests.push(`${method} ${url}`);
  if (url === "/api/hooks" && method === "GET") {
    return json(destinations.map(publicDestination));
  }
  if (url === "/api/hooks" && method === "POST") {
    lastPostBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const created: Destination = {
      id: "h2",
      name: String(lastPostBody.name),
      url: String(lastPostBody.url),
      event_types: (lastPostBody.event_types as string[]) ?? [],
      enabled: lastPostBody.enabled === false ? 0 : 1,
      created_at: Date.now(),
      has_secret: Boolean(lastPostBody.secret),
    };
    destinations.push(created);
    return json(publicDestination(created));
  }

  const putMatch = url.match(/^\/api\/hooks\/([^/?]+)$/);
  if (putMatch && method === "PUT") {
    lastPutBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    destinations = destinations.map((destination) =>
      destination.id === putMatch[1]
        ? {
            ...destination,
            name: String(lastPutBody?.name ?? destination.name),
            url: String(lastPutBody?.url ?? destination.url),
            event_types:
              (lastPutBody?.event_types as string[]) ?? destination.event_types,
            enabled:
              lastPutBody?.enabled === undefined
                ? destination.enabled
                : lastPutBody.enabled
                  ? 1
                  : 0,
            has_secret:
              typeof lastPutBody?.secret === "string" && lastPutBody.secret
                ? true
                : destination.has_secret,
          }
        : destination,
    );
    const updated = destinations.find((x) => x.id === putMatch[1]);
    return json(publicDestination(updated as Destination));
  }

  if (url.endsWith("/test") && method === "POST") {
    testCalls++;
    return json({ ok: true, status: 201, duration_ms: 43, error: null });
  }
  return json([]);
}) as typeof fetch;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { EventDestinationsSection } = await import(
  "../src/panels/settings/EventDestinationsSection.tsx"
);
const act = React.act;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonIn(root: ParentNode, text: string): Element | null {
  return (
    [...root.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === text,
    ) ?? null
  );
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

async function typeInto(selector: string, value: string): Promise<void> {
  const input = window.document.querySelector(selector);
  assert.ok(input, `expected input ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(input as HTMLInputElement, value);
    (input as HTMLInputElement).dispatchEvent(
      new window.Event("input", { bubbles: true }),
    );
  });
}

async function check(label: string): Promise<void> {
  const input = window.document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  assert.ok(input, `expected checkbox ${label}`);
  if (!input.checked) await act(async () => input.click());
  await flush();
}

function rows(): Element[] {
  return [...window.document.querySelectorAll(".plist li")];
}

function rowFor(name: string): Element {
  const row = rows().find((item) => item.textContent?.includes(name));
  assert.ok(row, `expected row for ${name}`);
  return row;
}

test("event destinations support CRUD and inline send-test status", async () => {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(EventDestinationsSection));
  });
  await flush();

  try {
    assert.ok(requests.includes("GET /api/hooks"));
    assert.equal(rows().length, 1);
    const firstText = rowFor("Ops hook").textContent ?? "";
    assert.match(firstText, /https:\/\/example\.test\/hook/);
    assert.match(firstText, /Run finished/);
    assert.match(firstText, /Secret: ••••/);

    await click(buttonIn(rowFor("Ops hook"), "Send test"));
    const status = rowFor("Ops hook").querySelector(".state");
    assert.equal(status?.textContent?.trim(), "201 · 43 ms");
    assert.equal(testCalls, 1);

    await click(buttonIn(window.document.body, "Add destination"));
    assert.ok(
      window.document.querySelector('.dialog [aria-label="Destination name"]'),
    );
    await typeInto('[aria-label="Destination name"]', "Audit");
    await typeInto(
      '[aria-label="Destination URL"]',
      "https://example.test/new",
    );
    await typeInto('[aria-label="Destination secret"]', "shh");
    await check("Bot blocked");

    const dialog = window.document.querySelector(".dialog");
    assert.ok(dialog);
    await click(buttonIn(dialog, "Add destination"));
    assert.deepEqual(lastPostBody, {
      name: "Audit",
      url: "https://example.test/new",
      event_types: ["bot.blocked"],
      secret: "shh",
    });
    assert.equal(rows().length, 2);

    await click(buttonIn(rowFor("Ops hook"), "Edit"));
    const modal = window.document.querySelector(".dialog");
    assert.ok(modal);
    const nameInput = modal.querySelector<HTMLInputElement>(
      '[aria-label="Destination name"]',
    );
    const secretInput = modal.querySelector<HTMLInputElement>(
      '[aria-label="Destination secret"]',
    );
    assert.equal(nameInput?.value, "Ops hook");
    assert.equal(secretInput?.value, "");
    assert.match(
      secretInput?.getAttribute("placeholder") ?? "",
      /leave empty to keep/,
    );
    await check("Bot recovered");
    await click(buttonIn(modal, "Save destination"));

    assert.ok(lastPutBody);
    assert.equal("secret" in lastPutBody, false);
    assert.deepEqual(lastPutBody.event_types, [
      "run.finished",
      "bot.recovered",
    ]);
    assert.match(rowFor("Ops hook").textContent ?? "", /Bot recovered/);

    await click(buttonIn(rowFor("Ops hook"), "Disable"));
    assert.equal(lastPutBody?.enabled, false);
    const toggle = buttonIn(rowFor("Ops hook"), "Enable");
    assert.ok(toggle);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
