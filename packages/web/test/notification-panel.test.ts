import assert from "node:assert/strict";
import { test } from "node:test";
import type { NotificationItem } from "../src/types.ts";

const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { NotificationPanel } = await import(
  "../src/components/NotificationPanel.tsx"
);

function item(over: Partial<NotificationItem>): NotificationItem {
  return {
    id: "n-1",
    kind: "run_error",
    title: "Run failed",
    body: "boom",
    bot_id: "b-1",
    read: 0,
    created_at: Date.UTC(2026, 9, 30),
    ...over,
  };
}

const noop = () => undefined;

function render(props: Partial<Parameters<typeof NotificationPanel>[0]>) {
  return renderToStaticMarkup(
    React.createElement(NotificationPanel, {
      items: [],
      unreadCount: 0,
      open: false,
      onToggle: noop,
      onClose: noop,
      onMarkOne: noop,
      onMarkAll: noop,
      ...props,
    }),
  );
}

test("collapsed bell shows no badge or panel", () => {
  const html = render({});
  assert.ok(html.includes("notifwrap"));
  assert.ok(!html.includes("notifbadge"));
  assert.ok(!html.includes("notifpanel"));
  assert.ok(html.includes('aria-expanded="false"'));
});

test("empty open panel renders the empty state with mark-all disabled", () => {
  const html = render({ open: true });
  assert.ok(html.includes("No notifications."));
  assert.match(html, /<button[^>]*disabled="">\s*Mark all read\s*<\/button>/);
});

test("badge caps at 99+ and lists unread rows with actions", () => {
  const html = render({
    open: true,
    unreadCount: 120,
    items: [item({}), item({ id: "n-2", read: 1 })],
    targetFor: (n) => (n.id === "n-1" ? "/bots?bot=b-1" : null),
  });
  assert.ok(html.includes(">99+<"));
  assert.ok(html.includes('aria-label="Notifications, 120 unread"'));
  assert.ok(html.includes('<li class="unread"'));
  assert.ok(html.includes("Mark read"));
  const bodyButtons = html.match(/class="notifbody"[^>]*/g) ?? [];
  assert.equal(bodyButtons.length, 2);
  assert.ok(!bodyButtons[0].includes("disabled"));
  assert.ok(bodyButtons[1].includes("disabled"));
});
