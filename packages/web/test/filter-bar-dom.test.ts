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

async function click(element: Element | null | undefined): Promise<void> {
  assert.ok(element, "expected element");
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

test("query input is controlled through props", async () => {
  const captured: Captured = {};
  const probe = mount(captured);
  await probe.render();
  try {
    const search = probe.container.querySelector(
      'input[placeholder="Search bots by name"]',
    );
    await typeInto(search, "alpha");
    assert.equal(captured.query, "alpha");
  } finally {
    await probe.unmount();
  }
});

test("role search filters the open dropdown through state, not DOM walking", async () => {
  const captured: Captured = {};
  const probe = mount(captured);
  await probe.render();
  try {
    const roleDd = [...probe.container.querySelectorAll(".filterdd")][1];
    await click(roleDd.querySelector(".filtertrigger"));
    const panel = roleDd.querySelector(".filterpanel");
    assert.ok(panel?.textContent?.includes("Alpha Ops"));
    assert.ok(panel?.textContent?.includes("Beta Research"));
  
    const search = panel?.querySelector('input[placeholder="Search roles"]');
    await typeInto(search, "beta");
    assert.ok(!panel?.textContent?.includes("Alpha Ops"));
    assert.ok(panel?.textContent?.includes("Beta Research"));
    assert.ok(!panel?.textContent?.includes("(no role)"));
  
    await typeInto(search, "");
    assert.ok(panel?.textContent?.includes("Alpha Ops"));
    assert.ok(panel?.textContent?.includes("(no role)"));
    await click(roleDd.querySelector(".filtertrigger"));
  } finally {
    await probe.unmount();
  }
});

test("checking a role reports the toggled selection", async () => {
  const captured: Captured = {};
  const probe = mount(captured);
  await probe.render();
  try {
    const roleDd = [...probe.container.querySelectorAll(".filterdd")][1];
    await click(roleDd.querySelector(".filtertrigger"));
    const alphaCheck = [
      ...(roleDd.querySelectorAll('.filterpanel input[type="checkbox"]') ?? []),
    ][1];
    await act(async () => {
      alphaCheck?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }),
      );
    });
    assert.deepEqual(captured.roleIds, ["r-1"]);
    await click(roleDd.querySelector(".filtertrigger"));
  } finally {
    await probe.unmount();
  }
});

test("a closed dropdown shows no options until its trigger is clicked", async () => {
  const captured: Captured = {};
  const probe = mount(captured);
  await probe.render();
  try {
    const statusDd = probe.container.querySelector(".filterdd");
    assert.equal(statusDd?.querySelector(".filterpanel"), null);
    assert.equal(
      statusDd?.querySelector(".filtertrigger")?.textContent,
      "Status: All",
    );
    await click(statusDd?.querySelector(".filtertrigger"));
    assert.ok(statusDd?.querySelector(".filterpanel"));
    assert.equal(
      statusDd?.querySelector('.filterpanel input:not([type="checkbox"])'),
      null,
    );
    assert.equal(
      statusDd?.querySelectorAll('.filterpanel input[type="checkbox"]').length,
      5,
    );
    await click(statusDd?.querySelector(".filtertrigger"));
    assert.equal(statusDd?.querySelector(".filterpanel"), null);
  } finally {
    await probe.unmount();
  }
});
