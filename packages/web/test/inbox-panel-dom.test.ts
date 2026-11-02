import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { it as test } from "vitest";

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
const { InboxPanel } = await import("../src/panels/InboxPanel.tsx");
const act = React.act;

function item(over: Record<string, unknown>) {
  return {
    id: "i1",
    kind: "run_error",
    bot_id: "b1",
    bot_name: "Sable",
    title: "Run failed",
    detail: "boom",
    target_path: "/bots?bot=b1",
    created_at: Date.now(),
    ...over,
  };
}

async function render(props?: Partial<Parameters<typeof InboxPanel>[0]>) {
  window.document.body.innerHTML = "";
  const root = createRoot(window.document.body);
  await act(async () =>
    root.render(
      React.createElement(InboxPanel, {
        items: [],
        unreadCount: 0,
        lastResolvedAt: null,
        onOpenItem: () => undefined,
        onMarkRead: () => undefined,
        onMarkAllRead: () => undefined,
        onDecideApproval: () => undefined,
        ...props,
      }),
    ),
  );
  return root;
}

test("empty inbox reads All clear with last-resolved time", async () => {
  const root = await render({ lastResolvedAt: Date.now() - 60_000 });
  const empty = window.document.querySelector(".inboxempty");
  assert.ok(empty);
  assert.match(empty.textContent ?? "", /All clear/);
  assert.match(empty.textContent ?? "", /Last resolved .* ago/);
  await act(async () => root.unmount());
});

test("rows show title, detail and kind icon; unread rows get Mark read", async () => {
  const marked: string[] = [];
  const root = await render({
    items: [
      item({ id: "n1", kind: "notification", notification_id: "x9", read: 0 }),
      item({ id: "r1", kind: "breaker", bot_id: null, target_path: null }),
    ],
    unreadCount: 1,
    onMarkRead: (id) => marked.push(id),
  });
  const rows = window.document.querySelectorAll(".inboxrow");
  assert.equal(rows.length, 2);
  assert.ok(window.document.querySelector(".inboxicon.notification"));
  assert.match(
    window.document.querySelector(".unread .notifactions button")
      ?.textContent ?? "",
    /Mark read/,
  );
  const markBtn = window.document.querySelector(
    ".unread .notifactions button",
  ) as HTMLElement;
  await act(async () => {
    markBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(marked, ["x9"]);
  await act(async () => root.unmount());
});

test("rows without a target and already read are disabled", async () => {
  const root = await render({
    items: [item({ id: "d1", target_path: null })],
  });
  const row = window.document.querySelector(".inboxrow") as HTMLButtonElement;
  assert.equal(row.disabled, true);
  await act(async () => root.unmount());
});

test("kind filter narrows rows through the dropdown checkboxes", async () => {
  const root = await render({
    items: [
      item({ id: "a", kind: "run_error" }),
      item({ id: "b", kind: "breaker" }),
    ],
  });
  const boxes = window.document.querySelectorAll(
    ".filterdd:first-of-type input[type=checkbox]",
  );
  assert.ok(boxes.length >= 4);
  await act(async () => {
    (boxes[0] as HTMLInputElement).click();
  });
  const kinds: string[] = [];
  window.document.querySelectorAll(".inboxrow .inboxicon").forEach((el) => {
    kinds.push(el.className.replace("inboxicon ", ""));
  });
  assert.deepEqual(kinds, ["run_error"]);
  await act(async () => root.unmount());
});

test("approval rows decide inline", async () => {
  const calls: [string, boolean][] = [];
  const root = await render({
    items: [
      item({
        id: "approval:a1",
        kind: "approval",
        title: "Sable: approve shell?",
        detail: '{"command":"rm -rf /tmp/x"}',
        approval_id: "a1",
      }),
    ],
    onDecideApproval: (id: string, approve: boolean) =>
      calls.push([id, approve]),
  });
  const row = window.document.querySelector(".inboxrow");
  assert.ok(row?.textContent?.includes("approve shell?"));
  assert.ok(row?.textContent?.includes("rm -rf /tmp/x"));
  const buttons = [
    ...window.document.querySelectorAll<HTMLButtonElement>(
      ".notifactions button",
    ),
  ];
  const approve = buttons.find((b) => b.textContent === "Approve");
  const deny = buttons.find((b) => b.textContent === "Deny");
  assert.ok(approve && deny);
  await act(async () => approve.click());
  await act(async () => deny.click());
  assert.deepEqual(calls, [
    ["a1", true],
    ["a1", false],
  ]);
  root.unmount();
});

test("plain rows keep only mark-read", async () => {
  const root = await render({
    items: [item({ notification_id: "n1", read: 0 })],
  });
  const labels = [
    ...window.document.querySelectorAll(".notifactions button"),
  ].map((b) => b.textContent);
  assert.deepEqual(labels, ["Mark read"]);
  root.unmount();
});

test("bot filter is hidden when no inbox item belongs to a bot", async () => {
  const root = await render({
    items: [item({ bot_id: null, bot_name: null })],
  });
  const labels = [...window.document.querySelectorAll(".filterdd summary")].map(
    (s) => s.getAttribute("aria-label"),
  );
  assert.deepEqual(labels, ["Kind filter: All"]);
  await act(async () => root.unmount());
});

test("bot filter lists the bots present in the inbox", async () => {
  const root = await render({
    items: [item({ bot_id: "b1", bot_name: "Sable" })],
  });
  const bot = window.document.querySelectorAll(".filterdd")[1];
  assert.match(bot.querySelector("summary")?.textContent ?? "", /^Bot:/);
  assert.equal(bot.querySelectorAll(".filterpanel label").length, 1);
  await act(async () => root.unmount());
});

async function openFilter(index: number) {
  const dd = window.document.querySelectorAll(".filterdd")[
    index
  ] as HTMLDetailsElement;
  await act(async () => {
    dd.open = true;
    dd.dispatchEvent(new window.Event("toggle"));
  });
  return dd;
}

test("an open filter closes when focus moves outside it", async () => {
  const root = await render({ items: [item({})] });
  const dd = await openFilter(0);
  assert.equal(dd.open, true);
  const outside = window.document.querySelector(".mainhead h2");
  assert.ok(outside);
  await act(async () => {
    dd.dispatchEvent(
      new window.FocusEvent("focusout", {
        bubbles: true,
        relatedTarget: outside,
      }),
    );
  });
  assert.equal(dd.open, false);
  await act(async () => root.unmount());
});

test("an open filter closes on a click outside it", async () => {
  const root = await render({ items: [item({})] });
  const dd = await openFilter(0);
  await act(async () => {
    window.document.body.dispatchEvent(
      new window.MouseEvent("pointerdown", { bubbles: true }),
    );
  });
  assert.equal(dd.open, false);
  await act(async () => root.unmount());
});

test("an open filter stays open when focus moves within it", async () => {
  const root = await render({ items: [item({})] });
  const dd = await openFilter(0);
  const box = dd.querySelector("input");
  assert.ok(box);
  await act(async () => {
    dd.dispatchEvent(
      new window.FocusEvent("focusout", { bubbles: true, relatedTarget: box }),
    );
  });
  assert.equal(dd.open, true);
  await act(async () => root.unmount());
});
