import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost/roles" },
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
  HTMLSelectElement: window.HTMLSelectElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  history: window.history,
  location: window.location,
  localStorage: window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
window.HTMLElement.prototype.scrollIntoView = () => undefined;
globalThis.alert = () => undefined;

const role = {
  id: "r1",
  name: "Ops",
  instructions: "do things",
  created_at: Date.now(),
  mcp_server_ids: ["mcp-1"],
  skill_ids: [],
};

const requests: string[] = [];
let lastPatchBody: Record<string, unknown> | null = null;

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  requests.push(`${method} ${url}`);
  if (url === "/api/mcp-servers") {
    return json([{ id: "mcp-1", name: "Filesystem" }]);
  }
  if (url === "/api/skills") {
    return json([
      { id: "skill-1", name: "PDF" },
      { id: "skill-2", name: "Deploy" },
    ]);
  }
  if (url === "/api/roles/r1" && method === "PATCH") {
    lastPatchBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return json({ ...role, ...(lastPatchBody ?? {}) });
  }
  return json([]);
}) as typeof fetch;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { RoleFormModal } = await import("../src/App.tsx");
const act = React.act;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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

function button(text: string): Element | null {
  return (
    [...window.document.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === text,
    ) ?? null
  );
}

async function typeInto(element: Element | null, value: string): Promise<void> {
  assert.ok(element, "expected input");
  const input = element as HTMLInputElement | HTMLTextAreaElement;
  const proto =
    input instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await flush();
}

function tab(label: string): Element | null {
  return (
    [...window.document.querySelectorAll(".mtabs button")].find(
      (item) => item.textContent?.trim() === label,
    ) ?? null
  );
}

function grantRows(): HTMLInputElement[] {
  return [...window.document.querySelectorAll(".grantrow input")];
}

test("role edit modal separates general settings from MCP and skills grants", async () => {
  let saved = false;
  const root = await mount(
    React.createElement(RoleFormModal, {
      role,
      onClose: () => undefined,
      onSaved: () => {
        saved = true;
      },
    }),
  );

  try {
    await typeInto(
      window.document.querySelector('input[placeholder="role name"]'),
      "Edited Ops",
    );
    await typeInto(
      window.document.querySelector("textarea"),
      "updated instructions",
    );

    const tabs = [...window.document.querySelectorAll(".mtabs button")];
    assert.deepEqual(
      tabs.map((item) => item.textContent?.trim()),
      ["General", "MCP", "Skills"],
    );
    assert.equal(tabs[0].className, "sel");
    assert.equal(grantRows().length, 0);

    await click(tab("MCP"));
    assert.deepEqual(
      grantRows().map((input) => input.parentElement?.textContent?.trim()),
      ["Filesystem"],
    );
    const mcpCheckbox = grantRows()[0];
    assert.equal(mcpCheckbox.checked, true);
    await act(async () => {
      mcpCheckbox.click();
    });
    await flush();

    await click(tab("Skills"));
    assert.deepEqual(
      grantRows().map((input) => input.parentElement?.textContent?.trim()),
      ["PDF", "Deploy"],
    );
    const deploy = grantRows()[1];
    await act(async () => {
      deploy.click();
    });
    await flush();

    await click(tab("General"));
    assert.equal(
      (
        window.document.querySelector(
          'input[placeholder="role name"]',
        ) as HTMLInputElement
      ).value,
      "Edited Ops",
    );
    assert.equal(
      (window.document.querySelector("textarea") as HTMLTextAreaElement).value,
      "updated instructions",
    );

    requests.length = 0;
    await click(button("Save role"));
    assert.equal(saved, true);
    assert.deepEqual(requests, ["PATCH /api/roles/r1"]);
    assert.deepEqual(lastPatchBody, {
      name: "Edited Ops",
      instructions: "updated instructions",
      mcp_server_ids: [],
      skill_ids: ["skill-2"],
    });
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
