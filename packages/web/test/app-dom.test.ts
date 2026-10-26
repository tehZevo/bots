import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost/bots" },
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
  PointerEvent: window.MouseEvent,
  history: window.history,
  location: window.location,
  localStorage: window.localStorage,
  addEventListener: window.addEventListener.bind(window),
  removeEventListener: window.removeEventListener.bind(window),
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  IS_REACT_ACT_ENVIRONMENT: true,
});
window.HTMLElement.prototype.scrollIntoView = () => undefined;
globalThis.alert = () => undefined;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { App, BotCard, BotGeneral, BotTags, ProviderFormModal, Triggers } =
  await import("../src/App.tsx");
const act = React.act;

const now = Date.now();
const bot = {
  id: "b1",
  name: "Sable",
  instructions: "",
  model_id: null,
  role_id: null,
  machine_id: null,
  avatar_shape: null,
  avatar_color: null,
  sound: null,
  enabled: 1,
  created_at: now,
  run_state: "enabled",
  health: "blue",
  status: null,
  status_level: null,
  current_task: "Watch deploys",
  current_task_updated_at: now,
};

const trigger = {
  id: "t1",
  kind: "schedule",
  name: "sweep",
  message: "check the deploy",
  schedule: "@every 1h",
  next_run_at: now + 3_600_000,
  enabled: 1,
};

const requests: string[] = [];
let pausedFlag = false;

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = init?.method ?? "GET";
  requests.push(`${method} ${url}`);
  if (url === "/api/bots" && method === "GET") return json([bot]);
  if (url === "/api/notifications") {
    return json({
      items: [
        {
          id: "n1",
          kind: "run_error",
          title: "Sable: run failed",
          body: "no model configured",
          bot_id: "b1",
          read: 0,
          created_at: now,
        },
      ],
      unread_count: 1,
    });
  }
  if (url === "/api/roles") {
    return json([
      {
        id: "r1",
        name: "Ops",
        instructions: "",
        created_at: now,
        mcp_server_ids: [],
        skill_ids: [],
      },
    ]);
  }
  if (url === "/api/bots/b1/messages" && method === "GET") {
    return json([
      { role: "user", text: "hello" },
      { role: "assistant", text: "all good" },
    ]);
  }
  if (url === "/api/bots/b1/messages" && method === "POST") return json({});
  if (url === "/api/bots/b1/context-usage") {
    return json({
      context_window: 32000,
      categories: { system_prompt: 4000, tools: 2000, conversation: 800 },
      used: 6800,
      free: 25200,
    });
  }
  if (url === "/api/bots/b1/usage") {
    return json({
      budget: 20000,
      lifetime: {
        input: 1200,
        output: 340,
        cache_read: 8100,
        cache_write: 90,
        total: 9730,
      },
      last30d: {
        input: 400,
        output: 90,
        cache_read: 2000,
        cache_write: 10,
        total: 2500,
      },
    });
  }
  if (url === "/api/bots/b1/runs") {
    return json([
      {
        id: "run1",
        status: "ok",
        trigger: "manual",
        started_at: now,
        finished_at: now + 1000,
        output: "done",
        error: null,
      },
    ]);
  }
  if (url === "/api/bots/b1/triggers" && method === "GET") {
    return json([trigger]);
  }
  if (url === "/api/bots/b1/triggers" && method === "POST") {
    return json({ ...trigger, id: "t2", secret: "s3cret" });
  }
  if (url === "/api/teams") {
    return json([
      {
        id: "team1",
        name: "ops",
        created_at: now,
        members: [{ bot_id: "b1", name: "Sable", leader: true }],
        project_ids: [],
      },
    ]);
  }
  if (url === "/api/projects") {
    return json([
      {
        id: "p1",
        name: "site",
        description: "",
        body: "",
        created_at: now,
      },
    ]);
  }
  if (url === "/api/machines") {
    return json([
      {
        id: "m1",
        name: "local",
        description: "",
        dockerfile: "",
        image: null,
        build_error: null,
        builtin: true,
      },
    ]);
  }
  if (url === "/api/settings") {
    return json({
      sandbox_idle_minutes: 5,
      default_provider_id: null,
      default_model: null,
      control_mcp_enabled: true,
    });
  }
  if (url === "/api/tags" && method === "POST") {
    const name = String(JSON.parse(String(init?.body)).name);
    if (name.startsWith("fail"))
      return new Response(JSON.stringify({ error: "name already exists" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    return json({ id: "g3", name, created_at: now, bot_count: 0 });
  }
  if (url === "/api/tags" && method === "GET") {
    return json([
      { id: "g1", name: "prod", created_at: now, bot_count: 2 },
      { id: "g2", name: "experiments", created_at: now, bot_count: 0 },
    ]);
  }
  if (url === "/api/api-keys") return json([]);
  if (url === "/api/providers") return json([]);
  if (url === "/api/pause" && method === "GET")
    return json({ paused: pausedFlag });
  if (url === "/api/pause" && method === "POST") {
    pausedFlag = Boolean(JSON.parse(String(init?.body)).paused);
    return json({ paused: pausedFlag });
  }
  if (url === "/api/stop-all" && method === "POST") {
    pausedFlag = true;
    return json({ stopped: 0 });
  }
  if (url === "/api/triggers/t1" && method === "PATCH") return json(trigger);
  if (url.startsWith("/api/triggers/") && method === "DELETE") return json({});
  return json([]);
}) as typeof fetch;

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

function byLabel(label: string): Element | null {
  return window.document.querySelector(`[aria-label="${label}"]`);
}

async function typeInto(
  element: Element | null | undefined,
  value: string,
): Promise<void> {
  assert.ok(element, "expected input");
  const input = element as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement;
  const proto =
    input instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : input instanceof window.HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await flush();
}

test("app navigation, chat, and bot detail flows", async () => {
  const root = await mount(React.createElement(App));
  assert.match(window.document.body.textContent ?? "", /Sable/);

  await click(byLabel("Sable (null)"));
  assert.match(window.document.body.textContent ?? "", /all good/);
  await click(byLabel("Sable settings"));
  assert.match(window.document.body.textContent ?? "", /General/);

  await click(button("Triggers"));
  assert.match(window.document.body.textContent ?? "", /sweep/);
  await click(button("Logs"));
  assert.match(window.document.body.textContent ?? "", /done/);
  await click(button("General"));
  await click(byLabel("Instructions"));
  await typeInto(byLabel("Instructions"), "updated instructions");
  await click(button("Save"));
  assert.ok(requests.includes("PATCH /api/bots/b1"));

  await click(window.document.querySelector(".dialog.tabs button.close"));
  await click(window.document.querySelector(".sidepanel button.close"));

  await click(button("Add bot"));
  assert.match(window.document.body.textContent ?? "", /Add bot/);
  await click(button("Cancel"));

  for (const label of [
    "Teams",
    "Roles",
    "Machines",
    "Integrations",
    "Skills",
    "Templates",
    "Projects",
    "Settings",
    "Bots",
  ]) {
    const nav = [...window.document.querySelectorAll(".sidetabs button")].find(
      (item) => item.textContent?.trim() === label,
    );
    await click(nav);
  }

  await click(byLabel("Notifications, 1 unread"));
  await click(button("Mark all read"));
  await click(
    window.document.querySelector(
      ".notifpanel button[aria-label='Close notifications']",
    ),
  );
  await click(window.document.querySelector(".railtoggle"));
  await click(window.document.querySelector(".hamburger"));
  await click(window.document.querySelector(".drawer .scrim"));

  const search = window.document.querySelector(
    'input[placeholder="Search bots by name"]',
  );
  await typeInto(search, "sable");

  await act(async () => {
    root.unmount();
  });
});

test("bot general actions update the bot", async () => {
  const root = await mount(
    React.createElement(BotGeneral, {
      bot,
      onChanged: () => undefined,
    }),
  );

  await typeInto(byLabel("Bot name"), "Sable 2");
  await click(button("Save"));
  assert.ok(requests.includes("PATCH /api/bots/b1"));

  const enabled = byLabel("Bot enabled") as HTMLInputElement;
  await act(async () => {
    enabled.click();
  });
  await flush();

  await click(button("Restart machine"));
  await click(button("Restart machine"));
  await click(button("Clear memory"));
  await click(button("Clear memory"));
  await click(button("Delete"));
  await click(button("Delete bot"));
  await click(button("Save as template…"));
  assert.match(window.document.body.textContent ?? "", /New template/);
  await click(button("Cancel"));

  await act(async () => {
    root.unmount();
  });
});

test("trigger editor creates and edits triggers", async () => {
  const root = await mount(React.createElement(Triggers, { botId: "b1" }));

  await click(button("+ Add trigger"));
  const draftFields = [
    ...window.document.querySelectorAll(".teditor form .field"),
  ];
  assert.deepEqual(
    draftFields.map((field) => field.firstChild?.textContent?.trim()),
    ["Type", "Name (optional)", "Message"],
  );
  await typeInto(
    window.document.querySelector(
      'textarea[placeholder="message to inject on trigger"]',
    ),
    "new trigger",
  );
  await click(button("Create trigger"));
  assert.ok(
    requests.some((request) => request === "POST /api/bots/b1/triggers"),
  );

  await click(
    [...window.document.querySelectorAll(".tlist button")].find((item) =>
      item.textContent?.includes("sweep"),
    ),
  );
  await typeInto(
    window.document.querySelector(".teditor textarea"),
    "edited trigger",
  );
  await click(button("Save"));
  assert.ok(requests.includes("PATCH /api/triggers/t1"));

  await click(button("Remove"));
  await click(button("Remove trigger"));

  await act(async () => {
    root.unmount();
  });
});

test("bot cards show the assigned role under the name, hidden when unset", async () => {
  const withRole = { ...bot, role_id: "r1", role_name: "developer" };
  const rootA = await mount(
    React.createElement(BotCard, {
      bot: withRole,
      poking: false,
      onChat: () => undefined,
      onRun: () => undefined,
      onStop: () => undefined,
      onSettings: () => undefined,
      onClearMemory: () => undefined,
      onDelete: () => undefined,
    }),
  );
  const roleLine = window.document.querySelector(".cardrole");
  assert.ok(roleLine, "expected a role line for a bot with a role");
  assert.equal(roleLine.textContent, "(developer)");
  assert.equal(roleLine.getAttribute("title"), "developer");
  await act(async () => {
    rootA.unmount();
  });

  const rootB = await mount(
    React.createElement(BotCard, {
      bot: { ...bot, role_id: null },
      poking: false,
      onChat: () => undefined,
      onRun: () => undefined,
      onStop: () => undefined,
      onSettings: () => undefined,
      onClearMemory: () => undefined,
      onDelete: () => undefined,
    }),
  );
  assert.equal(window.document.querySelector(".cardrole"), null);
  await act(async () => {
    rootB.unmount();
  });
});

test("pulsing status dots carry a per-bot halo delay without animating the dot", async () => {
  const root = await mount(
    React.createElement(BotCard, {
      bot: { ...bot, run_state: "running", health: "green" },
      poking: false,
      onChat: () => undefined,
      onRun: () => undefined,
      onStop: () => undefined,
      onSettings: () => undefined,
      onClearMemory: () => undefined,
      onDelete: () => undefined,
    }),
  );
  const dots = [...window.document.querySelectorAll(".dot.pulse")];
  assert.equal(dots.length, 1);
  const delay = (dots[0] as HTMLElement).style.getPropertyValue("--dot-delay");
  assert.ok(
    /^-?\d+(\.\d+)?s$/.test(delay),
    `expected a seconds value, got ${delay}`,
  );
  await act(async () => {
    root.unmount();
  });
});

test("quick menu trigger sits in the card header left of the status circle", async () => {
  const root = await mount(
    React.createElement(BotCard, {
      bot,
      poking: false,
      onChat: () => undefined,
      onRun: () => undefined,
      onStop: () => undefined,
      onSettings: () => undefined,
      onClearMemory: () => undefined,
      onDelete: () => undefined,
    }),
  );
  const head = window.document.querySelector(".quickhead");
  const trigger = window.document.querySelector(".quickbtn");
  const dot = window.document.querySelector(".cardwrap .dot");
  assert.ok(head && trigger && dot);
  assert.ok(head.contains(dot), "status circle shares the header controls");
  assert.ok(
    Boolean(
      trigger.compareDocumentPosition(dot) &
        window.Node.DOCUMENT_POSITION_FOLLOWING,
    ),
    "the trigger sits immediately left of the status circle",
  );
  await act(async () => {
    root.unmount();
  });
});

test("quick menu opens anchored to the trigger and closes on Escape", async () => {
  const root = await mount(
    React.createElement(BotCard, {
      bot,
      poking: false,
      onChat: () => undefined,
      onRun: () => undefined,
      onStop: () => undefined,
      onSettings: () => undefined,
      onClearMemory: () => undefined,
      onDelete: () => undefined,
    }),
  );
  await click(window.document.querySelector(".quickbtn"));
  const panel = window.document.querySelector(".quickpanel");
  assert.ok(panel, "expected the menu panel to open");
  const items = [...panel.querySelectorAll("[role=menuitem]")];
  assert.deepEqual(
    items.map((item) => item.textContent?.trim()),
    ["Open chat", "Run now", "Settings", "Clear memory", "Delete"],
  );
  await act(async () => {
    items[0].dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await flush();
  assert.equal(window.document.querySelector(".quickpanel"), null);
  await act(async () => {
    root.unmount();
  });
  window.document
    .querySelectorAll(".quickpanel, .quickhead")
    .forEach((node) => {
      node.remove();
    });
});

test("status bar pause toggle flips the global pause state", async () => {
  pausedFlag = false;
  const root = await mount(React.createElement(App));
  await click(byLabel("Pause all bots"));
  assert.ok(requests.includes("POST /api/pause"));
  await flush();
  assert.ok(byLabel("Resume all bots"), "expected the toggle to flip");
  assert.match(window.document.body.textContent ?? "", /paused/);

  await click(byLabel("Resume all bots"));
  await flush();
  assert.ok(byLabel("Pause all bots"));
  await act(async () => {
    root.unmount();
  });
});

test("stop-all panic button confirms then interrupts and arms the pause", async () => {
  pausedFlag = false;
  const root = await mount(React.createElement(App));
  await flush();
  assert.ok(byLabel("Stop all bots"), "panic button beside the pause toggle");
  requests.length = 0;
  await click(byLabel("Stop all bots"));
  assert.ok(
    window.document.querySelector(".confirm"),
    "confirm dialog required before executing",
  );
  assert.equal(requests.length, 0);
  await click(window.document.querySelector(".confirm button.danger"));
  assert.ok(requests.includes("POST /api/stop-all"));
  await flush();
  assert.match(window.document.body.textContent ?? "", /paused/);
  assert.ok(byLabel("Resume all bots"), "pause armed after stop-all");
  await act(async () => {
    root.unmount();
  });
});

test("quick menu destructive actions ask for confirmation first", async () => {
  window.history.pushState({}, "", "/bots");
  const delReqs = () =>
    requests.filter((r) => r.startsWith("DELETE /api/bots/")).length;
  const baseDel = delReqs();
  const root = await mount(React.createElement(App));
  try {
    await click(window.document.querySelector(".quickbtn"));
    const item = (label: string) =>
      [...window.document.querySelectorAll(".quickpanel [role=menuitem]")].find(
        (n) => n.textContent?.trim() === label,
      );
    await click(item("Delete") as HTMLElement);
    await flush();
    assert.match(window.document.body.textContent ?? "", /Delete bot Sable\?/);
    assert.equal(delReqs(), baseDel, "nothing sent before confirm");

    const danger = window.document.querySelector(".confirm button.danger");
    await click(danger as HTMLElement);
    assert.equal(delReqs(), baseDel + 1, "DELETE sent after confirm");

    await click(window.document.querySelector(".quickbtn"));
    await click(item("Clear memory") as HTMLElement);
    await flush();
    assert.match(
      window.document.body.textContent ?? "",
      /Clear the stored context of Sable\?/,
    );
    const clearBase = delReqs();

    const scrim = window.document.querySelector(".confirm .mscrim");
    await click(scrim as HTMLElement);
    await flush();
    assert.equal(delReqs(), clearBase, "outside tap cancels without sending");
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("tag picker offers + Create when nothing matches and attaches on click", async () => {
  const root = await mount(React.createElement(BotTags, { botId: "b1" }));
  try {
    await typeInto(window.document.querySelector(".tagadd"), "stage");
    assert.ok(button('+ Create "stage"'));
    const postsBefore = requests.filter((r) => r === "POST /api/tags").length;
    await click(button('+ Create "stage"'));
    assert.equal(
      requests.filter((r) => r === "POST /api/tags").length,
      postsBefore + 1,
    );
    assert.ok(requests.includes("PATCH /api/bots/b1"), "attach PATCH expected");
    const chips = [...window.document.querySelectorAll(".chip")].map(
      (c) => c.textContent ?? "",
    );
    assert.ok(chips.some((c) => c.includes("stage")));
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("stats tab shows budget progress and editing controls", async () => {
  const root = await mount(React.createElement(App));
  try {
    await click(byLabel("Sable (null)"));
    await click(byLabel("Sable settings"));
    await click(button("Stats"));
    assert.match(window.document.body.textContent ?? "", /of 20,000 tokens/);
    assert.match(window.document.body.textContent ?? "", /30-day token budget/);
    assert.ok(button("Save budget"));
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("tag picker Enter attaches an exact existing tag without creating", async () => {
  const root = await mount(React.createElement(BotTags, { botId: "b1" }));
  try {
    await typeInto(window.document.querySelector(".tagadd"), "PROD");
    const postsBefore = requests.filter((r) => r === "POST /api/tags").length;
    await act(async () => {
      window.document.querySelector(".tagadd")?.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();
    assert.equal(
      requests.filter((r) => r === "POST /api/tags").length,
      postsBefore,
    );
    assert.ok(requests.includes("PATCH /api/bots/b1"), "attach PATCH expected");
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("stats tab shows lifetime and trailing-30-day token totals", async () => {
  const root = await mount(React.createElement(App));
  try {
    await click(byLabel("Sable (null)"));
    await click(byLabel("Sable settings"));
    await click(button("Stats"));
    assert.match(window.document.body.textContent ?? "", /Lifetime/);
    assert.match(window.document.body.textContent ?? "", /Last 30 days/);
    assert.match(window.document.body.textContent ?? "", /Cache read/);
    assert.match(window.document.body.textContent ?? "", /9[,.]?730/);
    assert.match(window.document.body.textContent ?? "", /Current context/);
    assert.match(window.document.body.textContent ?? "", /System prompt/);
    assert.match(window.document.body.textContent ?? "", /Free space/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("a failed tag create keeps the typed text", async () => {
  const alerts: string[] = [];
  const prevAlert = globalThis.alert;
  globalThis.alert = (message?: unknown) => {
    alerts.push(String(message));
  };
  const root = await mount(React.createElement(BotTags, { botId: "b1" }));
  try {
    await typeInto(window.document.querySelector(".tagadd"), "fail-tag");
    await click(button('+ Create "fail-tag"'));
    assert.equal(
      (window.document.querySelector(".tagadd") as HTMLInputElement).value,
      "fail-tag",
    );
    assert.ok(alerts.length > 0, "expected an alert on failure");
  } finally {
    globalThis.alert = prevAlert as typeof globalThis.alert;
    await act(async () => {
      root.unmount();
    });
  }
});

test("tags panel lists tags with bot counts", async () => {
  const { TagsPanel } = await import("../src/App.tsx");
  const root = await mount(React.createElement(TagsPanel));
  await flush();
  const cards = [...window.document.querySelectorAll(".cards .card")];
  assert.ok(cards.length >= 2, "expected tag cards to render");
  const prod = cards.find((c) => c.textContent?.includes("prod"));
  assert.ok(prod?.textContent?.includes("2 bots"));
  await act(async () => {
    root.unmount();
  });
});

test("provider API key rotation confirms before saving", async () => {
  requests.length = 0;
  const providerRequests = () =>
    requests.filter((request) => request.startsWith("PUT /api/providers/p1"));
  const root = await mount(
    React.createElement(ProviderFormModal, {
      provider: {
        id: "p1",
        name: "Ops",
        base_url: "https://example.com/v1",
        models: ["m"],
        has_key: true,
      },
      onClose: () => undefined,
      onSaved: () => undefined,
    }),
  );
  try {
    await typeInto(
      window.document.querySelector('input[type="password"]'),
      "sk-new",
    );
    await click(button("Save provider"));

    assert.match(
      window.document.body.textContent ?? "",
      /Rotate the API key for Ops\?/,
    );
    assert.equal(providerRequests().length, 0);

    await click(window.document.querySelector(".confirm .mscrim"));
    assert.equal(
      window.document.querySelector(".confirm"),
      null,
      "outside tap cancels rotation",
    );
    assert.equal(providerRequests().length, 0);

    await click(button("Save provider"));
    await click(window.document.querySelector(".confirm button.danger"));
    assert.ok(requests.includes("PUT /api/providers/p1"));
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
