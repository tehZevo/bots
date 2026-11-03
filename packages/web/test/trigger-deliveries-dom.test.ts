import assert from "node:assert/strict";
import { act, click, document, flush, mount, test, window } from "./dom-env.ts";

const React = await import("react");
const { TriggerDeliveries } = await import(
  "../src/components/TriggerDeliveries.tsx"
);

let payload: unknown = [];
window.fetch = (async () => ({
  ok: true,
  status: 200,
  json: async () => payload,
})) as unknown as typeof window.fetch;
globalThis.fetch = window.fetch;

const rows = [
  {
    id: 2,
    created_at: 1700000002000,
    status: 200,
    outcome: "accepted",
    duration_ms: 12,
    preview: "payload body",
  },
  {
    id: 1,
    created_at: 1700000001000,
    status: 401,
    outcome: "unauthorized",
    duration_ms: 3,
    preview: "",
  },
];

test("deliveries render newest first with status and duration", async () => {
  payload = rows;
  const root = await mount(
    React.createElement(TriggerDeliveries, { triggerId: "t1" }),
  );
  try {
    await flush();
    const heads = document.querySelectorAll(".deliveryhead");
    assert.equal(heads.length, 2);
    assert.match(heads[0].textContent ?? "", /accepted/);
    assert.match(heads[0].textContent ?? "", /12ms/);
    assert.match(heads[1].textContent ?? "", /unauthorized/);
    assert.equal(document.querySelectorAll(".deliverypreview").length, 0);

    await click(heads[0] as HTMLElement);
    const previews = document.querySelectorAll(".deliverypreview");
    assert.equal(previews.length, 1);
    assert.equal(previews[0].textContent, "payload body");
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("an empty delivery list says so", async () => {
  payload = [];
  const root = await mount(
    React.createElement(TriggerDeliveries, { triggerId: "t2" }),
  );
  try {
    await flush();
    assert.match(document.body.textContent ?? "", /No webhook calls yet/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
