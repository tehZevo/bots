/**
 * Shared browser-ish environment for the DOM test files. Each of them used to
 * paste its own copy of these globals, which meant a runaway animation loop in
 * any component kept re-rendering a tree that outlived its test — and took the
 * machine down with it. Mounts are tracked and torn down after each test, and
 * frames are counted so a runaway loop starves instead of exhausting RAM.
 *
 * Import this FIRST, then load React, React DOM and app modules with
 * `await import(...)` as the test files do. React decides at module-evaluation
 * time whether a DOM exists, so a static `import "react-dom/client"` sorted
 * above this file silently disables event handling and the tests fail oddly.
 */
import { JSDOM } from "jsdom";
import { afterEach, it } from "vitest";

// A fuse, not an assertion. Real components settle in a handful of frames; a
// self-rescheduling loop would otherwise keep the worker rendering until the OS
// kills it. Past this many frames in one file we stop scheduling, which starves
// the loop and leaves the machine alone.
const FRAME_FUSE = 50000;

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost/bots" },
);
export const { window } = dom;
export const { document } = window;

let framesTotal = 0;

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
  requestAnimationFrame: (cb: FrameRequestCallback) => {
    framesTotal += 1;
    // Refuse to schedule rather than throw: throwing lands in a timer callback
    // where it is swallowed, refusing starves the loop so it stops on its own.
    if (framesTotal > FRAME_FUSE) return 0;
    return setTimeout(cb, 0) as unknown as number;
  },
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  IS_REACT_ACT_ENVIRONMENT: true,
});
window.HTMLElement.prototype.scrollIntoView = () => undefined;
globalThis.alert = () => undefined;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
export const act = React.act;

type Root = ReturnType<typeof createRoot>;
const mounted: Root[] = [];

/** Register a root created outside `mount` so it is torn down after the test. */
export function track(root: Root): Root {
  mounted.push(root);
  return root;
}

export async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Render `element` into a fresh container that is unmounted after the test. */
export async function mount(
  element: React.ReactElement,
): Promise<ReturnType<typeof createRoot>> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  await flush();
  return root;
}

export async function click(
  element: Element | null | undefined,
): Promise<void> {
  if (!element) throw new Error("missing element to click");
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

afterEach(async () => {
  while (mounted.length > 0) {
    const root = mounted.pop();
    if (!root) continue;
    try {
      await act(async () => root.unmount());
    } catch {
      /* already torn down by the test itself */
    }
  }
  document.body.innerHTML = "";
  if (process.env.DOMENV_DEBUG) {
    console.log(`[dom-env] frames so far: ${framesTotal}`);
  }
});

export const test = it;
