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
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  history: window.history,
  location: window.location,
  localStorage: window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
window.HTMLElement.prototype.scrollIntoView = () => undefined;

interface UpdateState {
  status: "up_to_date" | "update_available" | "source_unavailable" | null;
  checked_at: number | null;
  modified: boolean;
  pinned: boolean;
}

interface TestSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  created_at: number;
  import_info: string | null;
  update_state?: UpdateState | null;
}

let skills: TestSkill[] = [];
const calls: Array<{ method: string; url: string }> = [];

function resetSkills(): void {
  calls.length = 0;
  skills = [
    {
      id: "s1",
      name: "Alpha Helper",
      description: "alpha things",
      instructions: "body",
      created_at: Date.now(),
      import_info: JSON.stringify({
        origin: "git",
        source: "example.com/repo",
      }),
      update_state: {
        status: "update_available",
        checked_at: 1000,
        modified: true,
        pinned: false,
      },
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
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function latest(id: string): TestSkill {
  const found = skills.find((skill) => skill.id === id);
  assert.ok(found, `expected skill ${id}`);
  return found;
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  calls.push({ method, url });

  if (url === "/api/skills" && method === "GET") {
    return new Response(JSON.stringify(clone(skills)), { status: 200 });
  }
  if (url === "/api/skills/check" && method === "POST") {
    skills = skills.map((skill) =>
      skill.import_info
        ? {
            ...skill,
            update_state: {
              ...(skill.update_state ?? {
                status: null,
                checked_at: null,
                modified: false,
                pinned: false,
              }),
              status: "up_to_date",
              checked_at: 2000,
            },
          }
        : skill,
    );
    return new Response(
      JSON.stringify({
        results: skills.map((skill) => ({
          id: skill.id,
          status: "up_to_date",
        })),
        skills: clone(skills),
      }),
      { status: 200 },
    );
  }

  const action = /^\/api\/skills\/([^/]+)\/(check|update|detach)$/.exec(url);
  if (action && method === "POST") {
    const id = action[1];
    const kind = action[2];
    const skill = skills.find((candidate) => candidate.id === id);
    if (!skill) return new Response("{}", { status: 404 });

    if (kind === "detach") {
      skills = skills.map((candidate) =>
        candidate.id === id
          ? { ...candidate, import_info: null, update_state: null }
          : candidate,
      );
      return new Response(JSON.stringify(clone(latest(id))), {
        status: 200,
      });
    }

    skills = skills.map((candidate) =>
      candidate.id === id
        ? kind === "update"
          ? {
              ...candidate,
              name: `${candidate.name} v2`,
              description: `Updated ${candidate.description}`,
              instructions: "updated body",
              update_state: {
                ...(candidate.update_state ?? {
                  status: null,
                  checked_at: null,
                  modified: false,
                  pinned: false,
                }),
                status: "up_to_date",
                checked_at: 3000,
                modified: false,
              },
            }
          : {
              ...candidate,
              update_state: {
                ...(candidate.update_state ?? {
                  status: null,
                  checked_at: null,
                  modified: false,
                  pinned: false,
                }),
                status: "up_to_date",
                checked_at: 3000,
              },
            }
        : candidate,
    );
    return new Response(
      JSON.stringify({
        id,
        status: kind === "update" ? "updated" : "up_to_date",
        error: null,
        skill: clone(latest(id)),
      }),
      { status: 200 },
    );
  }

  if (/^\/api\/skills\/[^/]+$/.test(url) && method === "DELETE") {
    skills = skills.filter((skill) => skill.id !== url.split("/").pop());
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response("{}", { status: 404 });
}) as typeof globalThis.fetch;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { SkillsPanel } = await import("../src/panels/SkillsPanel.tsx");
const act = React.act;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function settle(): Promise<void> {
  await flush();
  await flush();
  await flush();
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
  await settle();
  return root;
}

async function click(element: Element | null | undefined): Promise<void> {
  assert.ok(element, "expected element to click");
  await act(async () => {
    element.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  await settle();
}

function exactButton(text: string): Element | null {
  return [...window.document.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === text,
  );
}

function actionButton(text: string): Element | null {
  return [...window.document.querySelectorAll(".dialog .actions button")].find(
    (b) => (b.textContent ?? "").includes(text),
  );
}

function card(name: string): Element {
  const found = [...window.document.querySelectorAll(".mcpsrv")].find((c) =>
    c.textContent?.includes(name),
  );
  assert.ok(found, `expected skill card for ${name}`);
  return found;
}

function cardButton(root: Element, text: string): Element | null {
  return [...root.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === text,
  );
}

test("imported cards show update status, pinned state, and actions", async () => {
  resetSkills();
  skills[0].update_state = {
    status: "source_unavailable",
    checked_at: 1000,
    modified: false,
    pinned: true,
  };
  const root = await mount(React.createElement(SkillsPanel));
  try {
    const alpha = card("Alpha Helper");
    assert.match(alpha.textContent ?? "", /Source unavailable/);
    assert.ok(
      [...alpha.querySelectorAll(".srcbadge")].some(
        (b) => b.textContent === "pinned",
      ),
    );
    assert.ok(cardButton(alpha, "Check"));
    assert.ok(!cardButton(alpha, "Update"));
    assert.ok(cardButton(alpha, "Detach"));

    const handmade = card("Handmade");
    assert.equal(handmade.querySelector(".skillstatus"), null);
    assert.equal(handmade.querySelector(".skillactions"), null);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("Check all refreshes every imported skill", async () => {
  resetSkills();
  const root = await mount(React.createElement(SkillsPanel));
  try {
    assert.match(card("Alpha Helper").textContent ?? "", /Update available/);
    await click(exactButton("Check all"));

    assert.deepEqual(
      calls.filter((call) => call.url === "/api/skills/check"),
      [{ method: "POST", url: "/api/skills/check" }],
    );
    const alpha = card("Alpha Helper");
    assert.match(alpha.textContent ?? "", /Up to date/);
    assert.ok(!cardButton(alpha, "Update"));
    assert.ok(
      [...alpha.querySelectorAll(".srcbadge")].some(
        (b) => b.textContent === "local changes",
      ),
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("per-skill check posts to its update endpoint", async () => {
  resetSkills();
  const root = await mount(React.createElement(SkillsPanel));
  try {
    await click(cardButton(card("Alpha Helper"), "Check"));

    assert.deepEqual(
      calls.filter((call) => call.url === "/api/skills/s1/check"),
      [{ method: "POST", url: "/api/skills/s1/check" }],
    );
    assert.match(card("Alpha Helper").textContent ?? "", /Up to date/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("update confirmation warns about local changes and applies upstream content", async () => {
  resetSkills();
  const root = await mount(React.createElement(SkillsPanel));
  try {
    await click(cardButton(card("Alpha Helper"), "Update"));
    assert.match(
      window.document.body.textContent ?? "",
      /Replace local changes to Alpha Helper with the upstream bundle/,
    );

    await click(actionButton("Update skill"));
    assert.deepEqual(
      calls.filter((call) => call.url === "/api/skills/s1/update"),
      [{ method: "POST", url: "/api/skills/s1/update" }],
    );

    const alpha = card("Alpha Helper v2");
    assert.match(alpha.textContent ?? "", /Up to date/);
    assert.ok(
      ![...alpha.querySelectorAll(".srcbadge")].some(
        (b) => b.textContent === "local changes",
      ),
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("detach confirmation clears update tracking while keeping the skill", async () => {
  resetSkills();
  const root = await mount(React.createElement(SkillsPanel));
  try {
    await click(cardButton(card("Alpha Helper"), "Detach"));
    assert.match(
      window.document.body.textContent ?? "",
      /Stop tracking updates for Alpha Helper/,
    );

    await click(actionButton("Detach skill"));
    assert.deepEqual(
      calls.filter((call) => call.url === "/api/skills/s1/detach"),
      [{ method: "POST", url: "/api/skills/s1/detach" }],
    );

    const alpha = card("Alpha Helper");
    assert.equal(alpha.querySelector(".srcbadge"), null);
    assert.equal(alpha.querySelector(".skillactions"), null);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("delete confirmation uses DELETE", async () => {
  resetSkills();
  const root = await mount(React.createElement(SkillsPanel));
  try {
    await click(cardButton(card("Alpha Helper"), "Delete"));
    assert.match(
      window.document.body.textContent ?? "",
      /Delete skill Alpha Helper/,
    );

    await click(actionButton("Delete skill"));
    assert.deepEqual(
      calls.filter((call) => call.url === "/api/skills/s1"),
      [{ method: "DELETE", url: "/api/skills/s1" }],
    );
    assert.doesNotMatch(window.document.body.textContent ?? "", /Alpha Helper/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
