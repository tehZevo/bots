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
const played: string[] = [];
globalThis.Audio = class {
  constructor(src: string) {
    this.src = src;
  }
  src: string;
  play() {
    played.push(this.src);
    return Promise.resolve();
  }
} as unknown as typeof Audio;
const store = new Map<string, string>([["bots-sounds", "on"]]);
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
} as unknown as Storage;

let feed: { items: unknown[]; unread_count: number } = {
  items: [],
  unread_count: 0,
};
globalThis.fetch = (async () =>
  new Response(JSON.stringify(feed), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { useNotifications } = await import("../src/hooks/useNotifications.ts");
const act = React.act;

interface Handle {
  notifications: { id: string; read: number }[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markOne: (id: string) => Promise<void>;
  markAll: () => Promise<void>;
}

const holder: { api?: Handle } = {};

function Probe(): null {
  const handle = useNotifications({
    getSound: (botId) => (botId === "b-1" ? "chime" : "default"),
  });
  holder.api = handle as unknown as Handle;
  return null;
}

const note = (id: string, botId: string | null = "b-1") => ({
  id,
  kind: "run_error",
  title: `t-${id}`,
  body: "b",
  bot_id: botId,
  read: 0,
  created_at: Date.UTC(2026, 9, 30),
});

test("first load is silent; later unseen ids chime with the owner sound", async () => {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  feed = { items: [note("n-1")], unread_count: 1 };
  await act(async () => {
    root.render(React.createElement(Probe));
  });
  assert.deepEqual(played, []);
  assert.equal(holder.api?.unreadCount, 1);

  feed = { items: [note("n-2"), note("n-1")], unread_count: 2 };
  await act(async () => holder.api?.refresh());
  assert.deepEqual(played, ["/sounds/chime.wav"]);
  assert.equal(holder.api?.unreadCount, 2);

  await act(async () => holder.api?.markOne("n-2"));
  assert.equal(holder.api?.unreadCount, 1);
  assert.equal(holder.api?.notifications.find((n) => n.id === "n-2")?.read, 1);

  feed = { items: [note("n-2"), note("n-1")], unread_count: 1 };
  await act(async () => holder.api?.refresh());
  assert.deepEqual(played, ["/sounds/chime.wav"]);

  await act(async () => root.unmount());
});
