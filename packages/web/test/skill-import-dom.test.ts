import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost/skills" },
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
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  history: window.history,
  location: window.location,
  localStorage: window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
window.HTMLElement.prototype.scrollIntoView = () => undefined;

const skillList = [
  {
    id: "s1",
    name: "Alpha Helper",
    description: "alpha things",
    instructions: "body",
    created_at: Date.now(),
    import_info: JSON.stringify({ origin: "git", source: "a/b" }),
  },
  {
    id: "s2",
    name: "Handmade",
    description: "",
    instructions: "body",
    created_at: Date.now(),
    import_info: null,
  },
];

const requests: string[] = [];
let lastImportBody: Record<string, unknown> | null = null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  requests.push(`${method} ${url}`);
  if (url.startsWith("/api/skills/search")) {
    return new Response(
      JSON.stringify({
        results: [
          {
            id: "acme/repo/pdf",
            source: "acme/repo",
            skill_id: "pdf",
            name: "pdf",
            installs: 9,
          },
        ],
      }),
      { status: 200 },
    );
  }
  if (url === "/api/skills/preview") {
    return new Response(
      JSON.stringify({
        source: "acme/repo@pdf",
        requested_ref: null,
        resolved_commit: "c".repeat(40),
        skills: [
          {
            folder: "skills/pdf",
            name: "pdf",
            description: "handles pdfs",
            license: null,
            file_count: 3,
            total_size: 2048,
            content_hash: "h",
          },
        ],
      }),
      { status: 200 },
    );
  }
  if (url === "/api/skills/import") {
    lastImportBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ skills: [] }), { status: 201 });
  }
  if (url === "/api/skills" && method === "GET") {
    return new Response(JSON.stringify(skillList), { status: 200 });
  }
  return new Response("{}", { status: 404 });
}) as typeof globalThis.fetch;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { SkillsPanel, ImportSkillModal } = await import("../src/App.tsx");
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
  return [...window.document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes(text),
  );
}

function setInput(el: Element | null, value: string): Promise<void> {
  const input = el as HTMLInputElement;
  assert.ok(input);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  return act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

test("skill cards badge imported skills only", async () => {
  const root = await mount(React.createElement(SkillsPanel));
  try {
    assert.match(window.document.body.textContent ?? "", /git skill/);
    const handmadeBadgeRow = [...window.document.querySelectorAll(".mcpsrv")];
    const alpha = handmadeBadgeRow.find((c) =>
      c.textContent?.includes("Alpha Helper"),
    );
    const handmade = handmadeBadgeRow.find((c) =>
      c.textContent?.includes("Handmade"),
    );
    assert.ok(alpha?.querySelector(".srcbadge"));
    assert.equal(handmade?.querySelector(".srcbadge"), null);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("import modal: search, use result, preview, pick and import", async () => {
  let imported = false;
  const root = await mount(
    React.createElement(ImportSkillModal, {
      onClose: () => undefined,
      onImported: () => {
        imported = true;
      },
    }),
  );
  try {
    await setInput(
      window.document.querySelector('.field input[placeholder^="pdf"]'),
      "pdf",
    );
    await click(button("Search"));
    assert.match(window.document.body.textContent ?? "", /acme\/repo/);
    await click(button("Use"));

    const source = window.document.querySelector(
      '.field input[placeholder^="owner/repo"]',
    ) as HTMLInputElement;
    assert.equal(source.value, "acme/repo@pdf");

    await click(button("Preview"));
    const checkbox = window.document.querySelector(
      ".srclist input[type=checkbox]",
    ) as HTMLInputElement;
    assert.ok(checkbox, "preview row expected");
    await act(async () => {
      checkbox.click();
    });
    await flush();

    await click(button("Import"));
    assert.equal(imported, true);
    assert.deepEqual(lastImportBody, {
      source: "acme/repo@pdf",
      folders: ["skills/pdf"],
    });
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
