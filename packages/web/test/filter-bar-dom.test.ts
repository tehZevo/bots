import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { it as test } from "vitest";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/bots",
});
const { window } = dom;

Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { FilterBar } = await import("../src/components/FilterBar.tsx");
const act = React.act;

interface Captured {
  query?: string;
  statuses?: string[];
  roleIds?: string[];
}

function mount(
  captured: Captured,
  state: Partial<Record<string, unknown>> = {},
) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const props = {
    query: "",
    onQueryChange: (q: string) => {
      captured.query = q;
    },
    statuses: [] as string[],
    onStatusesChange: (v: string[]) => {
      captured.statuses = v;
    },
    roles: [
      { id: "r-1", name: "Alpha Ops", instructions: "" },
      { id: "r-2", name: "Beta Research", instructions: "" },
    ],
    roleIds: [] as string[],
    onRoleIdsChange: (v: string[]) => {
      captured.roleIds = v;
    },
    includeArchived: false,
    onIncludeArchivedChange: () => undefined,
    ...state,
  };
  return {
    container,
    render: async () => {
      await act(async () => {
        root.render(React.createElement(FilterBar, props));
      });
    },
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

async function typeInto(element: Element | null, value: string): Promise<void> {
  assert.ok(element, "expected input");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

test("query input is controlled through props", async () => {
  const captured: Captured = {};
  const probe = mount(captured);
  await probe.render();
  const search = probe.container.querySelector(
    'input[placeholder="Search bots by name"]',
  );
  await typeInto(search, "alpha");
  assert.equal(captured.query, "alpha");
  await probe.unmount();
});

test("role search filters options through state, not DOM walking", async () => {
  const captured: Captured = {};
  const probe = mount(captured);
  await probe.render();
  const rolePanel = [...probe.container.querySelectorAll(".filterdd")][1];
  assert.ok(rolePanel?.textContent?.includes("Alpha Ops"));
  assert.ok(rolePanel?.textContent?.includes("Beta Research"));

  const search = rolePanel?.querySelector('input[placeholder="Search roles"]');
  await typeInto(search, "beta");
  assert.ok(!rolePanel?.textContent?.includes("Alpha Ops"));
  assert.ok(rolePanel?.textContent?.includes("Beta Research"));
  assert.ok(!rolePanel?.textContent?.includes("(no role)"));

  await typeInto(search, "");
  assert.ok(rolePanel?.textContent?.includes("Alpha Ops"));
  assert.ok(rolePanel?.textContent?.includes("(no role)"));
  await probe.unmount();
});

test("checking a role reports the toggled selection", async () => {
  const captured: Captured = {};
  const probe = mount(captured);
  await probe.render();
  const rolePanel = [...probe.container.querySelectorAll(".filterdd")][1];
  const alphaCheck = [
    ...(rolePanel?.querySelectorAll('input[type="checkbox"]') ?? []),
  ][1];
  await act(async () => {
    alphaCheck?.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }),
    );
  });
  assert.deepEqual(captured.roleIds, ["r-1"]);
  await probe.unmount();
});
