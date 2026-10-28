import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

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
  HTMLButtonElement: window.HTMLButtonElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  CustomEvent: window.CustomEvent,
  localStorage: window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});

type Permission = "default" | "granted" | "denied";

interface SubscribeOptions {
  applicationServerKey?: ArrayBuffer | Uint8Array | null;
}

class FakeSubscription {
  endpoint: string;
  keys = { p256dh: "p256", auth: "auth" };
  options: { applicationServerKey: ArrayBuffer | Uint8Array | null };
  unsubscribed = false;

  constructor(endpoint: string, key: ArrayBuffer | Uint8Array | null) {
    this.endpoint = endpoint;
    this.options = { applicationServerKey: key };
  }

  toJSON() {
    return { endpoint: this.endpoint, keys: { ...this.keys } };
  }

  async unsubscribe(): Promise<boolean> {
    this.unsubscribed = true;
    return true;
  }
}

let permission: Permission = "default";
let currentKey = "QUJD";
let existing: FakeSubscription | null = null;
let subscribeCalls: SubscribeOptions[] = [];
let putBodies: Record<string, string>[] = [];
let deleteEndpoints: string[] = [];
let keyRequests = 0;
let failSubscribeTimes = 0;
let endpointCounter = 1;

const notificationMock = {
  get permission(): Permission {
    return permission;
  },
  async requestPermission(): Promise<Permission> {
    return permission;
  },
};
Object.defineProperty(window, "Notification", {
  configurable: true,
  value: notificationMock,
});
Object.defineProperty(globalThis, "Notification", {
  configurable: true,
  value: notificationMock,
});

const pushManagerClass = class {};
Object.defineProperty(window, "PushManager", {
  configurable: true,
  value: pushManagerClass,
});

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  if (url === "/api/push/key" && method === "GET") {
    keyRequests++;
    return new Response(JSON.stringify({ key: currentKey }), { status: 200 });
  }
  if (url === "/api/push/subscription" && method === "PUT") {
    putBodies.push(JSON.parse(String(init?.body)) as Record<string, string>);
    return new Response(JSON.stringify({ ok: true }), { status: 201 });
  }
  if (url === "/api/push/subscription" && method === "DELETE") {
    const body = JSON.parse(String(init?.body)) as { endpoint?: string };
    deleteEndpoints.push(body.endpoint ?? "");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
}) as typeof globalThis.fetch;

function configureServiceWorker(): void {
  const registration = {
    pushManager: {
      async getSubscription() {
        return existing;
      },
      async subscribe(options: SubscribeOptions) {
        subscribeCalls.push(options);
        if (failSubscribeTimes > 0) {
          failSubscribeTimes--;
          throw new Error("Registration failed - push service error");
        }
        if (permission === "denied") {
          throw new Error("NotAllowedError: permission denied");
        }
        if (permission === "default") permission = "granted";
        const endpoint = `https://push.example.com/s/${endpointCounter++}`;
        existing = new FakeSubscription(
          endpoint,
          options.applicationServerKey ?? null,
        );
        return existing;
      },
    },
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve(registration) },
  });
}

configureServiceWorker();

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { PushSection, resetPushStateForTests } = await import("../src/push.tsx");
const act = React.act;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flush(): Promise<void> {
  await act(async () => {
    await delay(0);
  });
}

async function waitFor(
  condition: () => boolean,
  label = "condition",
): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > 2_000)
      throw new Error(`timeout waiting for ${label}`);
    await act(async () => {
      await delay(10);
    });
  }
}

async function mount(
  element: React.ReactElement,
): Promise<ReturnType<typeof createRoot>> {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
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

function exactButton(text: string): Element | null {
  const found = [...window.document.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === text,
  );
  return found ?? null;
}

function bodyText(): string {
  return window.document.body.textContent ?? "";
}

async function setup(options: {
  permission?: Permission;
  marker?: boolean;
  existingKey?: string | null;
}): Promise<void> {
  permission = options.permission ?? "default";
  currentKey = "QUJD";
  localStorage.clear();
  if (options.marker) localStorage.setItem("bots-push-prompted", "1");
  subscribeCalls = [];
  putBodies = [];
  deleteEndpoints = [];
  keyRequests = 0;
  failSubscribeTimes = 0;
  endpointCounter = 1;
  existing =
    options.existingKey === undefined || options.existingKey === null
      ? null
      : new FakeSubscription(
          "https://push.example.com/s/old",
          new TextEncoder().encode(options.existingKey),
        );
  configureServiceWorker();
  resetPushStateForTests();
}

test("first authenticated Settings mount subscribes without a Subscribe button", async () => {
  await setup({ permission: "default" });
  const root = await mount(React.createElement(PushSection));
  try {
    await waitFor(() => putBodies.length === 1, "push subscription PUT");
    assert.equal(subscribeCalls.length, 1);
    assert.equal(permission, "granted");
    assert.equal(localStorage.getItem("bots-push-prompted"), "1");
    assert.deepEqual(putBodies[0], {
      endpoint: existing?.endpoint,
      p256dh: "p256",
      auth: "auth",
    });
    assert.equal(exactButton("Subscribe"), null);
    assert.ok(exactButton("Unsubscribe"));
    assert.match(bodyText(), /Subscribed/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("a dismissed prompt is not repeated on later loads", async () => {
  await setup({ permission: "denied", marker: true });
  const root = await mount(React.createElement(PushSection));
  try {
    await waitFor(() => bodyText().includes("Blocked in browser settings"));
    assert.equal(subscribeCalls.length, 0);
    assert.equal(keyRequests, 0);
    assert.equal(putBodies.length, 0);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("a transient push-service failure retries once before succeeding", async () => {
  await setup({ permission: "default" });
  failSubscribeTimes = 1;
  const root = await mount(React.createElement(PushSection));
  try {
    await waitFor(() => putBodies.length === 1, "push retry subscription PUT");
    assert.equal(subscribeCalls.length, 2);
    assert.equal(localStorage.getItem("bots-push-prompted"), "1");
    assert.match(bodyText(), /Subscribed/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("a subscription tied to an old VAPID key is replaced", async () => {
  await setup({ permission: "granted", existingKey: "old" });
  const old = existing;
  assert.ok(old);
  const root = await mount(React.createElement(PushSection));
  try {
    await waitFor(() => putBodies.length === 1, "replacement subscription PUT");
    assert.deepEqual(deleteEndpoints, [old.endpoint]);
    assert.equal(old.unsubscribed, true);
    assert.notEqual(existing?.endpoint, old.endpoint);
    assert.equal(putBodies[0]?.endpoint, existing?.endpoint);
    assert.match(bodyText(), /Subscribed/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("unsubscribe removes the server subscription and local registration", async () => {
  await setup({ permission: "granted", existingKey: "ABC" });
  const initial = existing;
  assert.ok(initial);
  const root = await mount(React.createElement(PushSection));
  try {
    await waitFor(() => putBodies.length === 1, "existing subscription PUT");
    await click(exactButton("Unsubscribe"));
    await waitFor(() => deleteEndpoints.includes(initial.endpoint));
    assert.equal(initial.unsubscribed, true);
    await waitFor(() => bodyText().includes("Off"));
    const button = exactButton("Unsubscribe") as HTMLButtonElement | null;
    assert.ok(button?.disabled);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
