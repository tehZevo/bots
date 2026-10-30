import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { ScheduleMode } from "../src/schedule.tsx";

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

const clipboardWrites: string[] = [];
Object.defineProperty(window.navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (text: string) => {
      clipboardWrites.push(text);
    },
  },
});

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const {
  applyOptimisticRunStates,
  App,
  BotCard,
  BotGeneral,
  ConfigBackupSection,
  BotTags,
  findDuplicateEnvKey,
  mcpEnvMapFromRows,
  mcpEnvRowsFromRecord,
  McpServerModal,
  optimisticRunUpdate,
  ProviderFormModal,
  Triggers,
} = await import("../src/App.tsx");
const { parseScheduleState, scheduleFromState, ScheduleEditor } = await import(
  "../src/schedule.tsx"
);
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
  archived: 0,
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
const patchBodies: Record<string, unknown>[] = [];
const botPatchBodies: Record<string, unknown>[] = [];
const mcpPatchBodies: Record<string, unknown>[] = [];
const runBodies: Record<string, unknown>[] = [];
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
  if (url === "/api/bots/b1" && method === "PATCH") {
    try {
      patchBodies.push(
        JSON.parse(String(init?.body)) as Record<string, unknown>,
      );
    } catch {
      patchBodies.push({});
    }
  }
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
  if (url === "/api/bots/b1/messages" && method === "POST") {
    return json({ runId: "chat-run", steered: false });
  }
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
  if (url === "/api/bots/b1/runs/run1/transcript") {
    return json({
      run: { id: "run1", status: "ok", trigger: "manual" },
      usage: { total: 3200 },
      steps: [
        { kind: "user", text: "check disk", at: now },
        {
          kind: "assistant",
          text: "running shell",
          at: now + 500,
          retry_wait_ms: 4000,
        },
        {
          kind: "tool_call",
          name: "shell",
          args: '{"command":"df -h"}',
          at: now + 600,
        },
        {
          kind: "tool_result",
          name: "shell",
          text: "exit 0\n/dev/root 92%",
          duration_ms: 1234,
          is_error: false,
          at: now + 800,
        },
      ],
    });
  }
  if (url === "/api/bots/b1/triggers" && method === "GET") {
    return json([trigger]);
  }
  if (url === "/api/bots/b1/triggers" && method === "POST") {
    return json({ ...trigger, id: "t2", secret: "s3cret" });
  }
  if (url === "/api/schedule/preview" && method === "POST") {
    const schedule = String(
      (JSON.parse(String(init?.body)) as { schedule?: unknown }).schedule ?? "",
    );
    if (!schedule || schedule.includes("invalid")) {
      return json({ valid: false, next: [] });
    }
    return json({
      valid: true,
      next: Array.from({ length: 5 }, (_, index) =>
        new Date(now + (index + 1) * 3_600_000).toISOString(),
      ),
    });
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
      default_provider_id: "p1",
      default_model: "alpha",
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
  if (url === "/api/bots/b1" && method === "PATCH") {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    botPatchBodies.push(body);
    return json({ ...bot, ...body });
  }
  if (url === "/api/mcp-servers/m1" && method === "PATCH") {
    try {
      mcpPatchBodies.push(
        JSON.parse(String(init?.body)) as Record<string, unknown>,
      );
    } catch {
      mcpPatchBodies.push({});
    }
  }
  if (url === "/api/secrets")
    return json([
      {
        id: "sec1",
        name: "GitHub token",
        key: "GITHUB_TOKEN",
        created_at: now,
      },
      { id: "sec2", name: "Deploy key", key: "DEPLOY_KEY", created_at: now },
    ]);
  if (url === "/api/api-keys") return json([]);
  if (url === "/api/providers") {
    return json([
      {
        id: "p1",
        name: "Ops",
        base_url: "https://example.com/v1",
        models: ["alpha", "beta", "gamma"],
        has_key: true,
      },
    ]);
  }
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
  if (url === "/api/bots/b1/run" && method === "POST") {
    try {
      runBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    } catch {
      runBodies.push({});
    }
    return json({ runId: "run2", steered: false });
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

async function expandTranscript(): Promise<void> {
  await click(byLabel("Sable (null)"));
  await click(byLabel("Sable settings"));
  await click(button("Logs"));
  await flush();
  await click(window.document.querySelector(".runhead"));
  await flush();
}

class FakeEventSource {
  static sources = new Set<FakeEventSource>();
  url: string;
  onopen: ((event?: unknown) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.sources.add(this);
  }

  close(): void {
    FakeEventSource.sources.delete(this);
  }

  addEventListener(..._args: unknown[]): void {}

  removeEventListener(..._args: unknown[]): void {}
}

Object.defineProperty(globalThis, "EventSource", {
  configurable: true,
  writable: true,
  value: FakeEventSource,
});

function chatStream(): FakeEventSource | undefined {
  return [...FakeEventSource.sources].find((source) =>
    source.url.endsWith("/messages/stream"),
  );
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

test("settings tabs split controls and guard unsaved changes", async () => {
  const root = await mount(React.createElement(App));
  try {
    const navButton = (label: string) =>
      [...window.document.querySelectorAll(".sidetabs button")].find(
        (item) =>
          (item.getAttribute("title") ?? item.textContent?.trim()) === label,
      );
    const settingsTab = (label: string) =>
      [...window.document.querySelectorAll(".mtabs button")].find(
        (item) => item.textContent?.trim() === label,
      );

    await click(navButton("Settings"));
    assert.match(window.document.body.textContent ?? "", /Notification sounds/);
    assert.doesNotMatch(
      window.document.body.textContent ?? "",
      /LLM providers|API keys/,
    );
    assert.equal(window.location.pathname, "/settings");

    await click(settingsTab("Providers"));
    assert.match(window.document.body.textContent ?? "", /LLM providers/);
    assert.doesNotMatch(
      window.document.body.textContent ?? "",
      /Notification sounds|API keys/,
    );
    assert.equal(window.location.search, "?tab=providers");

    await click(settingsTab("System"));
    assert.match(window.document.body.textContent ?? "", /API keys/);
    assert.match(window.document.body.textContent ?? "", /Signed in as/);
    assert.doesNotMatch(
      window.document.body.textContent ?? "",
      /Notification sounds|LLM providers/,
    );
    assert.equal(window.location.search, "?tab=system");

    await click(settingsTab("General"));
    const idle = byLabel("Sandbox idle timeout");
    await typeInto(idle, "7");
    assert.match(window.document.body.textContent ?? "", /Unsaved changes/);

    await click(settingsTab("Providers"));
    assert.match(
      window.document.body.textContent ?? "",
      /Discard unsaved changes to the sandbox idle timeout\?/,
    );
    await click(button("Keep editing"));
    assert.equal(window.location.search, "");

    await click(settingsTab("System"));
    await click(button("Discard changes"));
    assert.match(window.document.body.textContent ?? "", /API keys/);
    assert.equal(window.location.search, "?tab=system");

    await click(navButton("Bots"));
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("bot general actions update the bot", async () => {
  const root = await mount(
    React.createElement(BotGeneral, {
      bot,
      onChanged: () => undefined,
      onCancel: () => undefined,
    }),
  );

  await typeInto(byLabel("Bot name"), "Sable 2");
  await click(button("Save"));
  assert.ok(requests.includes("PATCH /api/bots/b1"));

  await click(button("Restart machine"));
  await click(button("Restart machine"));
  await click(button("Clear memory"));
  await click(button("Clear memory"));
  await click(button("Delete"));
  await click(button("Delete bot"));
  await click(button("Save as template…"));
  assert.match(window.document.body.textContent ?? "", /New template/);
  const templateCancel = [
    ...window.document.querySelectorAll(".dialog.narrow button"),
  ].find((item) => item.textContent?.trim() === "Cancel");
  await click(templateCancel);

  await act(async () => {
    root.unmount();
  });
});

test("bot detail header carries enable/Stop and General pins its action row", async () => {
  requests.length = 0;
  const previousState = bot.run_state;
  bot.run_state = "running";
  const root = await mount(React.createElement(App));
  try {
    await click(byLabel("Sable (null)"));
    await click(byLabel("Sable settings"));

    const header = window.document.querySelector(".dialog.tabs > .viewhead");
    assert.ok(header?.querySelector('[aria-label="Bot enabled"]'));
    assert.ok(
      window.document.querySelector(
        ".detailhead-actions [aria-label='Stop while running']",
      ),
    );

    const actions = window.document.querySelector(".botdetailactions");
    assert.ok(actions);
    assert.deepEqual(
      [...actions.querySelectorAll("button")].map((item) =>
        item.textContent?.trim(),
      ),
      [
        "Save",
        "Restart machine",
        "Clear memory",
        "Save as template…",
        "Archive",
        "Delete",
        "Cancel",
      ],
    );

    await click(byLabel("Stop while running"));
    assert.ok(requests.includes("POST /api/bots/b1/interrupt"));
    await click(button("Cancel"));
    assert.ok(!window.document.querySelector(".dialog.tabs"));
  } finally {
    bot.run_state = previousState;
    await act(async () => {
      root.unmount();
    });
  }
});

test("archived dashboard cards are muted, badged, and open details", async () => {
  const previous = {
    enabled: bot.enabled,
    archived: bot.archived,
    health: bot.health,
    run_state: bot.run_state,
  };
  Object.assign(bot, {
    enabled: 1,
    archived: 1,
    health: "gray",
    run_state: "disabled",
  });
  const root = await mount(React.createElement(App));
  try {
    assert.match(window.document.body.textContent ?? "", /Include archived/);
    assert.ok(window.document.querySelector(".cards .card.archived"));
    assert.match(window.document.body.textContent ?? "", /Archived/);

    await click(byLabel("Sable (null)"));
    assert.ok(window.document.querySelector(".dialog.tabs"));
    assert.ok(!window.document.querySelector(".sidepanel"));
  } finally {
    Object.assign(bot, previous);
    await act(async () => {
      root.unmount();
    });
  }
});

test("General archive actions stop first and unarchive immediately", async () => {
  const previous = {
    enabled: bot.enabled,
    archived: bot.archived,
    run_state: bot.run_state,
  };
  try {
    Object.assign(bot, { enabled: 1, archived: 0, run_state: "enabled" });
    requests.length = 0;
    let changed = 0;
    const onChanged = () => {
      changed++;
    };
    let root = await mount(React.createElement(BotGeneral, { bot, onChanged }));
    try {
      await click(button("Archive"));
      assert.ok(requests.includes("POST /api/bots/b1/archive"));
      assert.equal(changed, 1);
    } finally {
      await act(async () => root.unmount());
    }

    Object.assign(bot, { run_state: "running" });
    requests.length = 0;
    changed = 0;
    root = await mount(React.createElement(BotGeneral, { bot, onChanged }));
    try {
      await click(button("Archive"));
      assert.equal(requests.includes("POST /api/bots/b1/archive"), false);
      const confirm = [
        ...window.document.querySelectorAll(".confirm button"),
      ].find((item) => item.textContent?.trim() === "Archive bot");
      assert.ok(confirm, "expected archive confirmation");
      await click(confirm);
      assert.ok(requests.includes("POST /api/bots/b1/archive"));
      assert.equal(changed, 1);
    } finally {
      await act(async () => root.unmount());
    }

    Object.assign(bot, { archived: 1, run_state: "disabled" });
    requests.length = 0;
    changed = 0;
    root = await mount(React.createElement(BotGeneral, { bot, onChanged }));
    try {
      await click(button("Unarchive"));
      assert.ok(requests.includes("POST /api/bots/b1/unarchive"));
      assert.equal(changed, 1);
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    Object.assign(bot, previous);
    requests.length = 0;
  }
});

test("bot general saves watchdog hours", async () => {
  const root = await mount(
    React.createElement(BotGeneral, {
      bot: { ...bot, watchdog_hours: 24 },
      onChanged: () => undefined,
    }),
  );

  await typeInto(byLabel("Watchdog hours"), "30");
  await click(button("Save"));
  assert.equal(patchBodies.at(-1)?.watchdog_hours, 30);

  await typeInto(byLabel("Watchdog hours"), "");
  await click(button("Save"));
  assert.equal(patchBodies.at(-1)?.watchdog_hours, null);

  await act(async () => {
    root.unmount();
  });
});

test("bot General model override saves and clears", async () => {
  requests.length = 0;
  botPatchBodies.length = 0;
  const rootDefault = await mount(
    React.createElement(BotGeneral, {
      bot: { ...bot, model_id: null },
      onChanged: () => undefined,
    }),
  );
  try {
    assert.match(window.document.body.textContent ?? "", /Server default/);
    assert.ok(byLabel("Bot model"));
    await typeInto(byLabel("Bot model"), "beta");
    await click(button("Save"));
    assert.equal(botPatchBodies.at(-1)?.model_id, "beta");
  } finally {
    await act(async () => {
      rootDefault.unmount();
    });
  }

  botPatchBodies.length = 0;
  const rootOverride = await mount(
    React.createElement(BotGeneral, {
      bot: { ...bot, model_id: "beta" },
      onChanged: () => undefined,
    }),
  );
  try {
    assert.equal((byLabel("Bot model") as HTMLSelectElement).value, "beta");
    await typeInto(byLabel("Bot model"), "");
    await click(button("Save"));
    assert.equal(botPatchBodies.at(-1)?.model_id, null);
  } finally {
    await act(async () => {
      rootOverride.unmount();
    });
  }
});

test("bot General groups related pickers and flexes instructions", async () => {
  const root = await mount(
    React.createElement(BotGeneral, { bot, onChanged: () => undefined }),
  );
  try {
    assert.ok(window.document.querySelector(".botgeneral"));
    const row = window.document.querySelector(".picker-row");
    assert.ok(row, "related picker row renders");
    assert.deepEqual(
      [...row.querySelectorAll("select")].map((el) =>
        el.getAttribute("aria-label"),
      ),
      ["Bot role", "Bot model", "Bot machine", "Bot notification sound"],
    );
    assert.equal(
      [...window.document.querySelectorAll(".picker-row .field > span")]
        .map((label) => label.textContent?.trim())
        .join(","),
      "Role,Model,Machine,Sound",
    );
    const instructions = window.document.querySelector(
      ".instructions-field textarea[aria-label='Instructions']",
    );
    assert.ok(instructions, "instructions field fills the form");
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("trigger editor creates and edits triggers", async () => {
  const root = await mount(React.createElement(Triggers, { botId: "b1" }));

  await click(button("+ Add trigger"));
  const draftFields = [
    ...window.document.querySelectorAll(".teditor form .field"),
  ];
  assert.deepEqual(
    draftFields.map((field) => field.firstChild?.textContent?.trim()),
    ["Type", "Name (optional)", "Message", "Schedule"],
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

test("human schedule controls round-trip stored expressions", () => {
  const cases: [string, ScheduleMode?][] = [
    ["@every 30m"],
    ["5 9 * * *", "daily"],
    ["30 9 * * 1-5", "weekdays"],
    ["30 9 * * 1,4,6", "weekly"],
    ["0 8 15 * *", "monthly"],
    ["*/7 * * * *", "custom"],
    ["not a cron", "custom"],
  ];
  for (const [raw, mode] of cases) {
    const state = parseScheduleState(raw);
    if (mode) assert.equal(state.mode, mode, raw);
    assert.equal(scheduleFromState(state), raw);
  }
});

test("schedule editor shows its sentence and live next fires", async () => {
  const root = await mount(
    React.createElement(ScheduleEditor, {
      value: "30 9 * * 1-5",
      onChange: () => undefined,
      debounceMs: 0,
    }),
  );

  try {
    assert.equal(
      window.document.querySelector(".schedule-sentence")?.textContent,
      "Runs on weekdays at 09:30",
    );
    assert.equal(
      (byLabel("Schedule type") as HTMLSelectElement).value,
      "weekdays",
    );
    let ready = false;
    for (let attempt = 0; attempt < 25 && !ready; attempt++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      ready =
        window.document.querySelectorAll(".schedule-preview li").length === 5;
    }
    assert.ok(ready, "expected five next fire times");
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("schedule editor replaces an invalid preview with one error line", async () => {
  const root = await mount(
    React.createElement(ScheduleEditor, {
      value: "invalid schedule",
      onChange: () => undefined,
      debounceMs: 0,
    }),
  );

  try {
    let ready = false;
    for (let attempt = 0; attempt < 25 && !ready; attempt++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      ready = Boolean(window.document.querySelector(".schedule-error"));
    }
    assert.equal(
      window.document.querySelector(".schedule-error")?.textContent,
      "Invalid schedule expression.",
    );
    assert.equal(
      window.document.querySelectorAll(".schedule-preview li").length,
      0,
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
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

test("logs rows expand inline into the run transcript replay", async () => {
  const root = await mount(React.createElement(App));
  try {
    await click(byLabel("Sable (null)"));
    await click(byLabel("Sable settings"));
    await click(button("Logs"));
    await flush();
    await click(window.document.querySelector(".runhead"));
    await flush();
    const body = window.document.body.textContent ?? "";
    assert.match(body, /3,200 tokens/);
    assert.match(body, /check disk/);
    assert.match(body, /retry wait 4.0s/);
    assert.match(body, /1.2s/);
    assert.ok(requests.includes("GET /api/bots/b1/runs/run1/transcript"));
    await click(window.document.querySelector(".runhead"));
    await flush();
    assert.equal(
      window.document.querySelector(".replay"),
      null,
      "second click collapses the replay",
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("transcript user steps rerun the exact message and copy other steps", async () => {
  requests.length = 0;
  runBodies.length = 0;
  clipboardWrites.length = 0;
  const previousPaused = pausedFlag;
  pausedFlag = false;
  const root = await mount(React.createElement(App));
  try {
    await expandTranscript();

    assert.deepEqual(
      [...window.document.querySelectorAll(".ractions button")].map((item) =>
        item.textContent?.trim(),
      ),
      ["Run this", "Copy", "Copy"],
    );

    const copies = [
      ...window.document.querySelectorAll(".ractions button"),
    ].filter((item) => item.textContent?.trim() === "Copy");
    await click(copies[0]);
    assert.deepEqual(clipboardWrites, ["running shell"]);
    assert.match(window.document.body.textContent ?? "", /Copied/);

    await click(copies[1]);
    assert.equal(clipboardWrites.at(-1), "exit 0\n/dev/root 92%");

    const runButton = button("Run this");
    assert.ok(runButton);
    await click(runButton);
    assert.ok(requests.includes("POST /api/bots/b1/run"));
    assert.deepEqual(runBodies, [{ message: "check disk" }]);
  } finally {
    pausedFlag = previousPaused;
    await act(async () => {
      root.unmount();
    });
  }
});

test("transcript rerun is disabled while the bot is running", async () => {
  requests.length = 0;
  runBodies.length = 0;
  const previousPaused = pausedFlag;
  pausedFlag = false;
  const previousState = bot.run_state;
  bot.run_state = "running";
  const root = await mount(React.createElement(App));
  try {
    await expandTranscript();
    const runButton = button("Run this");
    assert.ok(runButton);
    assert.ok(runButton.hasAttribute("disabled"));

    await click(runButton);
    assert.equal(requests.filter((item) => item.endsWith("/run")).length, 0);
  } finally {
    pausedFlag = previousPaused;
    bot.run_state = previousState;
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

test("MCP env rows preserve literal and secret modes", () => {
  assert.deepEqual(
    mcpEnvRowsFromRecord({ FOO: "bar", TOKEN: { secret: "GitHub token" } }),
    [
      { key: "FOO", mode: "literal", value: "bar" },
      { key: "TOKEN", mode: "secret", value: "GitHub token" },
    ],
  );
  assert.deepEqual(
    mcpEnvMapFromRows([
      { key: " FOO ", mode: "literal", value: " bar " },
      { key: "TOKEN", mode: "secret", value: "Deploy key" },
    ]),
    { FOO: " bar ", TOKEN: { secret: "Deploy key" } },
  );
});

test("findDuplicateEnvKey ignores blanks and trims keys", () => {
  assert.equal(findDuplicateEnvKey([]), null);
  assert.equal(findDuplicateEnvKey([{ key: "FOO" }, { key: " BAR " }]), null);
  assert.equal(findDuplicateEnvKey([{ key: "FOO" }, { key: " FOO " }]), "FOO");
});

test("MCP env duplicate keys show an inline error before saving", async () => {
  requests.length = 0;
  const root = await mount(
    React.createElement(McpServerModal, {
      server: null,
      onClose: () => undefined,
      onSaved: () => undefined,
    }),
  );
  try {
    await typeInto(window.document.querySelector(".dialog input"), "test");
    await typeInto(
      window.document.querySelector('input[placeholder="npx"]'),
      "echo",
    );

    const firstKeys = window.document.querySelectorAll(
      '.envrows input[placeholder="KEY"]',
    );
    assert.equal(firstKeys.length, 1);
    await typeInto(firstKeys[0], "FOO");

    await click(button("+ Add variable"));
    const secondKeys = window.document.querySelectorAll(
      '.envrows input[placeholder="KEY"]',
    );
    assert.equal(secondKeys.length, 2);
    await typeInto(secondKeys[1], " FOO ");

    await click(button("Save"));
    assert.match(
      window.document.body.textContent ?? "",
      /duplicate environment variable key FOO/,
    );
    assert.ok(!requests.includes("POST /api/mcp-servers"));
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("MCP env editor saves secret references", async () => {
  requests.length = 0;
  mcpPatchBodies.length = 0;
  const root = await mount(
    React.createElement(McpServerModal, {
      server: {
        id: "m1",
        name: "srv",
        transport: "stdio",
        command: "node",
        args: [],
        env: { TOKEN: { secret: "GitHub token" }, LITERAL: "plain" },
        enabled: 1,
      },
      onClose: () => undefined,
      onSaved: () => undefined,
    }),
  );
  try {
    assert.ok(requests.includes("GET /api/secrets"));
    const secretSelect = window.document.querySelector(
      '[aria-label="Env var 1 secret"]',
    ) as HTMLSelectElement | null;
    assert.ok(secretSelect);
    assert.equal(secretSelect.value, "GitHub token");

    const rows = window.document.querySelectorAll(".envrow");
    await typeInto(
      rows[1].querySelector('input[placeholder="value"]'),
      "changed",
    );
    await click(button("Save"));
    assert.deepEqual(mcpPatchBodies.at(-1)?.env, {
      TOKEN: { secret: "GitHub token" },
      LITERAL: "changed",
    });

    await click(byLabel("Use a literal value for env var 1"));
    await typeInto(
      rows[0].querySelector('input[placeholder="value"]'),
      "literal-token",
    );
    await click(button("Save"));
    assert.deepEqual(mcpPatchBodies.at(-1)?.env, {
      TOKEN: "literal-token",
      LITERAL: "changed",
    });

    await click(byLabel("Use a secret reference for env var 1"));
    const repointSelect = window.document.querySelector(
      '[aria-label="Env var 1 secret"]',
    ) as HTMLSelectElement | null;
    assert.ok(repointSelect);
    assert.equal(repointSelect.value, "");
    await typeInto(repointSelect, "Deploy key");
    await click(button("Save"));
    assert.deepEqual(mcpPatchBodies.at(-1)?.env, {
      TOKEN: { secret: "Deploy key" },
      LITERAL: "changed",
    });
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("MCP env editor marks missing secret references", async () => {
  const root = await mount(
    React.createElement(McpServerModal, {
      server: {
        id: "m1",
        name: "srv",
        transport: "stdio",
        command: "node",
        args: [],
        env: { TOKEN: { secret: "Deleted" } },
        enabled: 1,
      },
      onClose: () => undefined,
      onSaved: () => undefined,
    }),
  );
  try {
    assert.match(window.document.body.textContent ?? "", /Deleted \(missing\)/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
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

test("backup export toggle names its subject and updates state", async () => {
  const root = await mount(React.createElement(ConfigBackupSection));
  try {
    assert.match(
      window.document.body.textContent ?? "",
      /Secret values in export/,
    );
    assert.match(window.document.body.textContent ?? "", /Names only/);

    await click(
      window.document.querySelector("#secret-values-export-label + input"),
    );
    assert.match(window.document.body.textContent ?? "", /Included/);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

test("optimistic run overrides are confirmed or corrected by polls", () => {
  const at = Date.now();
  const idle = {
    ...bot,
    run_state: "enabled" as const,
    health: "blue" as const,
  };
  const running = {
    ...idle,
    run_state: "running" as const,
    health: "green" as const,
  };
  const override = {
    ...optimisticRunUpdate("running"),
    authoritativeAt: at + 2_000,
    expiresAt: at + 60_000,
  };

  let result = applyOptimisticRunStates([idle], { b1: override }, at);
  assert.equal(result.rows[0].run_state, "running");
  assert.ok(result.overrides.b1);

  result = applyOptimisticRunStates([running], { b1: override }, at + 100);
  assert.equal(result.overrides.b1, undefined);
  assert.equal(result.rows[0].health, "green");

  result = applyOptimisticRunStates([idle], { b1: override }, at + 2_100);
  assert.equal(result.overrides.b1, undefined);
  assert.equal(result.rows[0].run_state, "enabled");

  const fresh = optimisticRunUpdate("running");
  assert.ok(fresh.authoritativeAt > at);
  assert.ok(fresh.expiresAt > fresh.authoritativeAt);
});

test("accepted chat send flips cues immediately", async () => {
  requests.length = 0;
  const previous = { ...bot };
  bot.run_state = "enabled";
  bot.health = "blue";
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    root = await mount(React.createElement(App));
    assert.equal(byLabel("bot is working"), null);

    await click(byLabel("Sable (null)"));
    assert.ok(
      !window.document.querySelector(
        '[data-bot-card="b1"] + .quickhead .dot.green.pulse',
      ),
    );

    const input = window.document.querySelector(
      'input[placeholder="Message the bot…"]',
    );
    await typeInto(input, "check");
    await click(button("Send"));

    assert.match(window.document.body.textContent ?? "", /check/);
    assert.ok(byLabel("bot is working"));
    assert.ok(
      window.document.querySelector(
        '[data-bot-card="b1"] + .quickhead .dot.green.pulse',
      ),
    );
  } finally {
    Object.assign(bot, previous);
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
  }
});

test("chat sidebar updates from stream events", async () => {
  requests.length = 0;
  for (const source of FakeEventSource.sources) source.close();
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    root = await mount(React.createElement(App));
    await click(byLabel("Sable (null)"));

    const source = chatStream();
    assert.ok(source, "expected a chat event stream");
    await act(async () => {
      source.onopen?.();
    });

    const messageRequests = (): number =>
      requests.filter((request) => request === "GET /api/bots/b1/messages")
        .length;
    assert.ok(messageRequests() > 0);
    const before = messageRequests();

    await act(async () => {
      source.onmessage?.({
        data: JSON.stringify({
          turns: [
            { role: "user", text: "hello" },
            { role: "assistant", text: "streamed reply" },
          ],
          working: true,
        }),
      } as MessageEvent);
    });

    assert.match(window.document.body.textContent ?? "", /streamed reply/);
    assert.ok(byLabel("bot is working"));
    await act(async () => {
      source.onmessage?.({
        data: JSON.stringify({
          turns: [
            { role: "user", text: "hello" },
            { role: "assistant", text: "streamed full reply" },
          ],
          working: false,
        }),
      } as MessageEvent);
    });

    const bodyText = window.document.body.textContent ?? "";
    assert.match(bodyText, /streamed full reply/);
    assert.doesNotMatch(bodyText, /streamed reply(?! full)/);
    assert.equal(byLabel("bot is working"), null);
    assert.equal(messageRequests(), before);
  } finally {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
  }
});

test("accepted stop flips the running cue immediately", async () => {
  requests.length = 0;
  const previous = { ...bot };
  bot.run_state = "running";
  bot.health = "green";
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    root = await mount(React.createElement(App));
    await click(byLabel("Sable (null)"));
    await click(byLabel("Sable settings"));

    assert.ok(
      window.document.querySelector(
        ".detailhead-actions [aria-label='Stop while running']",
      ),
    );
    await click(byLabel("Stop while running"));

    assert.equal(
      window.document.querySelector(
        ".detailhead-actions [aria-label='Stop while running']",
      ),
      null,
    );
    assert.ok(requests.includes("POST /api/bots/b1/interrupt"));
    assert.ok(
      !window.document.querySelector(
        '[data-bot-card="b1"] + .quickhead .dot.green.pulse',
      ),
    );
  } finally {
    Object.assign(bot, previous);
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
  }
});

test("backtick opens search except from text fields", async () => {
  const root = await mount(React.createElement(App));
  try {
    assert.equal(window.document.querySelector(".searchoverlay"), null);

    const botSearch = window.document.querySelector(
      '[placeholder="Search bots by name"]',
    );
    assert.ok(botSearch);
    await act(async () => {
      (botSearch as HTMLElement).focus();
    });
    await act(async () => {
      botSearch.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "`",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(window.document.querySelector(".searchoverlay"), null);

    (botSearch as HTMLElement).blur();
    await act(async () => {
      window.document.body.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "`",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();
    assert.ok(window.document.querySelector(".searchoverlay"));
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
