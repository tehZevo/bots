import assert from "node:assert/strict";
import { act, document, flush, mount, test, window } from "./dom-env.ts";

const React = await import("react");
const { QueuedNotifications } = await import("../src/components/Chat.tsx");

let payload: unknown = { notifications: [] };
window.fetch = (async () => ({
  ok: true,
  status: 200,
  json: async () => payload,
})) as unknown as typeof window.fetch;
globalThis.fetch = window.fetch;

test("queued environment changes render as full-width queued bars", async () => {
  payload = {
    notifications: [
      {
        id: 1,
        source: "project:p1",
        detail: 'project "website" was updated',
        created_at: 1,
        status: "queued",
      },
      {
        id: 2,
        source: "secret:s1",
        detail: 'secret "api-key" was detached from this bot',
        created_at: 2,
        status: "queued",
      },
    ],
  };
  const root = await mount(
    React.createElement(QueuedNotifications, { botId: "b1" }),
  );
  try {
    const bars = document.querySelectorAll(".chat-bar.notify.queued");
    assert.equal(bars.length, 2);
    assert.match(bars[0].textContent ?? "", /environment/);
    assert.match(bars[0].textContent ?? "", /queued/);
    assert.match(bars[0].textContent ?? "", /website/);
    assert.match(bars[1].textContent ?? "", /api-key/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("an empty queue renders nothing", async () => {
  payload = { notifications: [] };
  const root = await mount(
    React.createElement(QueuedNotifications, { botId: "b2" }),
  );
  try {
    await flush();
    assert.equal(document.querySelectorAll(".chat-bar.notify").length, 0);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
