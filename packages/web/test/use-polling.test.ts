import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { usePolling } = await import("../src/hooks/usePolling.ts");
const act = React.act;

afterEach(() => mock.timers.reset());

interface ProbeProps {
  fn: () => Promise<unknown> | unknown;
  ms: number;
  enabled?: boolean;
  immediate?: boolean;
  onError?: (err: unknown) => void;
}

function Probe(props: ProbeProps): null {
  usePolling(props.fn, props.ms, {
    enabled: props.enabled,
    immediate: props.immediate,
    onError: props.onError,
  });
  return null;
}

async function mountProbe(props: ProbeProps) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Probe, props));
  });
  return {
    rerender: async (next: ProbeProps) => {
      await act(async () => {
        root.render(React.createElement(Probe, next));
      });
    },
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

test("runs immediately, then every interval, and stops on unmount", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let calls = 0;
  const fn = () => {
    ++calls;
  };
  const probe = await mountProbe({ fn, ms: 3000 });
  assert.equal(calls, 1);
  await act(async () => mock.timers.tick(3000));
  assert.equal(calls, 2);
  await act(async () => mock.timers.tick(6000));
  assert.equal(calls, 4);
  await probe.unmount();
  await act(async () => mock.timers.tick(9000));
  assert.equal(calls, 4);
});

test("rejections go to onError and never escape", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const errors: unknown[] = [];
  const boom = new Error("poll failed");
  const fn = async () => {
    throw boom;
  };
  const probe = await mountProbe({
    fn,
    ms: 1000,
    onError: (e) => errors.push(e),
  });
  await act(async () => mock.timers.tick(2500));
  assert.equal(errors.length, 3);
  for (const e of errors) {
    assert.ok(e instanceof Error);
    assert.equal(e.message, "poll failed");
  }
  await probe.unmount();
});

test("enabled=false pauses polling and re-arms when enabled again", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let calls = 0;
  const fn = () => {
    ++calls;
  };
  const onError = () => undefined;
  const probe = await mountProbe({ fn, ms: 1000, enabled: false });
  assert.equal(calls, 0);
  await act(async () => mock.timers.tick(5000));
  assert.equal(calls, 0);
  await probe.rerender({ fn, ms: 1000, enabled: true, onError });
  assert.equal(calls, 1);
  await act(async () => mock.timers.tick(2000));
  assert.equal(calls, 3);
  await probe.unmount();
});

test("immediate=false waits for the first interval", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let calls = 0;
  const fn = () => {
    ++calls;
  };
  const probe = await mountProbe({ fn, ms: 2000, immediate: false });
  assert.equal(calls, 0);
  await act(async () => mock.timers.tick(2000));
  assert.equal(calls, 1);
  await probe.unmount();
});
