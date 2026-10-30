import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

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
globalThis.alert = () => undefined;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { AvatarPicker } = await import("../src/components/AvatarPicker.tsx");
const act = React.act;

function bot(
  overrides: Partial<{
    avatar_shape: number | null;
    avatar_color: number | null;
  }>,
) {
  return {
    id: "b-1",
    name: "Scout",
    ...overrides,
  } as never;
}

async function mount(element: React.ReactElement) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return { root, container };
}

test("avatar picker disables reset when both avatar fields are null", async () => {
  const { root, container } = await mount(
    React.createElement(AvatarPicker, {
      bot: bot({ avatar_shape: null, avatar_color: null }),
      onPick: async () => ({}),
      onClose: () => undefined,
    }),
  );
  const reset = container.querySelector(".resetauto");
  assert.ok(reset);
  assert.equal((reset as HTMLButtonElement).disabled, true);
  await act(async () => root.unmount());

  const { root: root2, container: container2 } = await mount(
    React.createElement(AvatarPicker, {
      bot: bot({ avatar_shape: 2, avatar_color: null }),
      onPick: async () => ({}),
      onClose: () => undefined,
    }),
  );
  assert.equal(
    (container2.querySelector(".resetauto") as HTMLButtonElement).disabled,
    false,
  );
  await act(async () => root2.unmount());
});

test("avatar picker escape closes and shape pick sends body", async () => {
  const closed: number[] = [];
  const picked: Record<string, unknown>[] = [];
  const { root, container } = await mount(
    React.createElement(AvatarPicker, {
      bot: bot({ avatar_shape: null, avatar_color: null }),
      onPick: async (body) => {
        picked.push(body);
        return {};
      },
      onClose: () => closed.push(1),
    }),
  );
  const shapes = container.querySelectorAll(".shapeprev");
  assert.ok(shapes.length > 2, "expected shape buttons");
  await act(async () => {
    (shapes[2] as HTMLElement).click();
  });
  assert.deepEqual(picked[picked.length - 1], { avatar_shape: 2 });
  await act(async () => {
    document.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape" }),
    );
  });
  assert.equal(closed.length, 1);
  await act(async () => root.unmount());
});
