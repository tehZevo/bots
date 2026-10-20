import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;
globalThis.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})) as unknown as typeof globalThis.matchMedia;

const {
  mulberry32,
  fnv,
  shapeRadii,
  smoothClosedPath,
  avatarColor,
  AVATAR_COLORS,
  BOT_NAMES,
  relTime,
  fmt,
  pickBotName,
  Avatar,
  StatusDot,
  BotIcon,
  RoleIcon,
  BookIcon,
  GearIcon,
  PlugIcon,
  MachineIcon,
  App,
  SettingsPanel,
  RolesPanel,
  TeamsPanel,
  BotTeams,
  TeamCard,
  ProjectsPanel,
  ProjectModal,
  BotProjects,
  MachinesPanel,
  SkillsPanel,
  IntegrationsPanel,
  BotGeneral,
  ChatSidebar,
  Chat,
  ChatTurnView,
  Triggers,
  AddBotModal,
  TemplateEditorModal,
  TemplatesPanel,
  RoleFormModal,
  SkillModal,
  McpServerModal,
  MachineModal,
  ProviderFormModal,
} = await import("../src/App.tsx");

test("rng and hashing are deterministic", () => {
  assert.equal(fnv("a"), fnv("a"));
  assert.notEqual(fnv("a"), fnv("b"));
  const r1 = mulberry32(42);
  const r2 = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2());
});

test("shapeRadii produces 72 bounded radii", () => {
  const auto = shapeRadii(mulberry32(7));
  assert.equal(auto.length, 72);
  assert.ok(auto.every((r) => r > 0.5 && r < 1.5));
});

test("smoothClosedPath emits a closed cubic path", () => {
  const d = smoothClosedPath(shapeRadii(mulberry32(1)), 50, 40);
  assert.ok(d.startsWith("M "));
  assert.ok(d.endsWith("Z"));
  assert.ok(d.includes("C "));
});

test("avatarColor maps ids into the fixed palette", () => {
  for (const id of ["a", "b", "c", "zz"])
    assert.ok(AVATAR_COLORS.includes(avatarColor(id)));
});

test("relTime buckets ages", () => {
  const now = Date.now();
  const real = Date.now;
  try {
    globalThis.Date.now = () => now + 10_000;
    assert.equal(relTime(now), "10s ago");
    globalThis.Date.now = () => now + 120_000;
    assert.equal(relTime(now), "2m ago");
    globalThis.Date.now = () => now + 3_600_000 * 5;
    assert.equal(relTime(now), "5h ago");
    globalThis.Date.now = () => now + 3_600_000 * 72;
    assert.equal(relTime(now), "3d ago");
  } finally {
    globalThis.Date.now = real;
  }
});

test("fmt renders timestamps or dash", () => {
  assert.equal(fmt(null), "—");
  assert.ok(fmt(1_700_000_000_000).length > 4);
});
test("pickBotName returns an unused name from the pool", () => {
  const uniq = [...new Set(BOT_NAMES)];
  assert.ok(uniq.includes(pickBotName([])));
  const used = uniq.slice(0, -1);
  const taken = new Set(used.map((n) => n.toLowerCase()));
  const forced = pickBotName(used);
  assert.ok(!taken.has(forced.toLowerCase()));
});

test("Avatar renders svg in the seeded color", () => {
  const html = renderToStaticMarkup(
    React.createElement(Avatar, { name: "x", id: "abc" }),
  );
  assert.ok(html.includes("<svg"));
  assert.ok(html.includes(avatarColor("abc")));
});

test("StatusDot renders per health with title", () => {
  const html = renderToStaticMarkup(
    React.createElement(StatusDot, {
      id: "i",
      health: "red",
      active: true,
      label: "blocked",
    }),
  );
  assert.ok(html.includes("dot red"));
  assert.ok(html.includes('title="blocked"'));
});

test("icons render svgs", () => {
  for (const Icon of [
    BotIcon,
    RoleIcon,
    BookIcon,
    GearIcon,
    PlugIcon,
    MachineIcon,
  ])
    assert.ok(
      renderToStaticMarkup(React.createElement(Icon, {})).includes("<svg"),
    );
});

test("App shell renders", () => {
  const html = renderToStaticMarkup(React.createElement(App));
  assert.ok(html.includes("Bots"));
});

test("panels and tab bodies render with stubbed fetch", () => {
  for (const C of [
    SettingsPanel,
    RolesPanel,
    MachinesPanel,
    SkillsPanel,
    IntegrationsPanel,
  ])
    assert.ok(renderToStaticMarkup(React.createElement(C)).length > 50);
  const botRow = {
    id: "b1",
    name: "N",
    instructions: "",
    model_id: null,
    role_id: null,
    machine_id: null,
    enabled: 1,
    created_at: Date.now(),
    run_state: "enabled",
    health: "blue",
    status: null,
    status_level: null,
    current_task: null,
    current_task_updated_at: null,
  } as never;
  const withBot = React.createElement(BotGeneral, {
    bot: botRow,
    onChanged: () => undefined,
  });
  assert.ok(renderToStaticMarkup(withBot).includes("Save"));
  for (const C of [Chat, Triggers])
    assert.ok(
      renderToStaticMarkup(React.createElement(C, { botId: "x" })).length > 50,
    );
});

test("modals render", () => {
  const noop = () => undefined;
  const modals: [unknown, Record<string, unknown>][] = [
    [AddBotModal, { usedNames: ["A"], onClose: noop, onCreated: noop }],
    [RoleFormModal, { role: null, onClose: noop, onSaved: noop }],
    [SkillModal, { skill: null, onClose: noop, onSaved: noop }],
    [McpServerModal, { server: null, onClose: noop, onSaved: noop }],
    [MachineModal, { machine: null, onClose: noop, onSaved: noop }],
    [ProviderFormModal, { provider: null, onClose: noop, onSaved: noop }],
  ];
  for (const [C, props] of modals)
    assert.ok(
      renderToStaticMarkup(React.createElement(C as never, props)).length > 50,
    );
});

test("templates panel and editor render", () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), {
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  const panel = renderToStaticMarkup(React.createElement(TemplatesPanel));
  assert.match(panel, /Templates/);
  const editor = renderToStaticMarkup(
    React.createElement(TemplateEditorModal, {
      initial: {
        name: "Daily sweep",
        description: "nightly tidy",
        instructions: "be terse",
        machine_id: null,
        role_id: null,
        triggers: [{ message: "sweep", schedule: "@every 1h" }],
      },
      onClose: () => undefined,
      onSaved: () => undefined,
    }),
  );
  assert.match(editor, /Daily sweep/);
  assert.match(editor, /@every 1h/);
});

test("chat turns render bot name, markdown and collapsibles", () => {
  const html = renderToStaticMarkup(
    React.createElement(ChatTurnView, {
      turn: {
        role: "assistant",
        text: "**bold**\n\n- one\n- two\n",
        thinking: "hmm",
        tool_calls: [{ name: "shell", input: { cmd: "ls" }, output: "files" }],
      },
      botName: "Sable",
    }),
  );
  assert.match(html, /<span class="who">Sable<\/span>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<li>one<\/li>/);
  assert.match(html, /tool: shell/);
  assert.match(html, /files/);
  assert.match(html, /thinking/);
});

const { AuthScreen, AccountSection } = await import("../src/auth.tsx");

test("auth screen and account section render", () => {
  const login = renderToStaticMarkup(
    React.createElement(AuthScreen, { onDone: () => undefined }),
  );
  assert.match(login, /Sign in/);
  assert.match(login, /Email/);
  assert.match(login, /Password/);

  const account = renderToStaticMarkup(React.createElement(AccountSection));
  assert.match(account, /Account/);
  assert.match(account, /Change password/);
  assert.match(account, /Logout/);
});

test("teams panel and bot team picker render", () => {
  const html = renderToStaticMarkup(React.createElement(TeamsPanel));
  assert.match(html, /Create team/);
  assert.match(html, /No teams yet/);
  assert.equal(
    renderToStaticMarkup(React.createElement(BotTeams, { botId: "b1" })),
    "",
  );
});

test("team card renders members, leader toggle and add controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(TeamCard, {
      team: {
        id: "t1",
        name: "ops",
        created_at: 0,
        members: [
          { bot_id: "b1", name: "Alpha", leader: true },
          { bot_id: "b2", name: "Beta", leader: false },
        ],
      },
      bots: [
        { id: "b1", name: "Alpha" },
        { id: "b2", name: "Beta" },
        { id: "b3", name: "Gamma" },
      ],
      busy: false,
      mutate: () => undefined,
    }),
  );
  assert.match(html, /ops/);
  assert.match(html, /Alpha/);
  assert.match(html, /checked=""/);
  assert.match(html, /leader/);
  assert.match(html, /Gamma/);
  assert.doesNotMatch(html, /<option[^>]*>Alpha</);
});

test("projects panel, modal and picker render", () => {
  const html = renderToStaticMarkup(React.createElement(ProjectsPanel));
  assert.match(html, /Add project/);
  assert.match(html, /No projects yet/);

  const modal = renderToStaticMarkup(
    React.createElement(ProjectModal, {
      project: {
        id: "p1",
        name: "ctx",
        description: "d",
        body: "# B",
        created_at: 0,
      },
      onClose: () => undefined,
      onSaved: () => undefined,
    }),
  );
  assert.match(modal, /Edit project/);
  assert.match(modal, /Markdown body/);
  assert.match(modal, /Delete/);

  assert.equal(
    renderToStaticMarkup(React.createElement(BotProjects, { botId: "b1" })),
    "",
  );
});

test("chat sidebar renders header, gear and close", () => {
  const html = renderToStaticMarkup(
    React.createElement(ChatSidebar, {
      bot: {
        id: "b1",
        name: "Alpha",
        instructions: "",
        model_id: null,
        role_id: null,
        machine_id: null,
        avatar_shape: null,
        avatar_color: null,
        sound: null,
        enabled: 1,
        created_at: 0,
        run_state: "enabled",
        health: "green",
        status: null,
        status_level: null,
        current_task: null,
        current_task_updated_at: null,
      },
      onSettings: () => undefined,
      onClose: () => undefined,
    }),
  );
  assert.match(html, /class="sidepanel"/);
  assert.match(html, /Alpha chat/);
  assert.match(html, /Alpha settings/);
  assert.match(html, /aria-label="Close"/);
});
