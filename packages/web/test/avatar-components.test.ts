import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, ShapePreview, StatusDot } from "../src/components/Avatar.tsx";

function avatarPath(markup: string): string {
  return markup.match(/<path d="([^"]+)"/)![1];
}

test("Avatar is deterministic for the same id", () => {
  const a = renderToStaticMarkup(React.createElement(Avatar, { id: "b-1" }));
  const b = renderToStaticMarkup(React.createElement(Avatar, { id: "b-1" }));
  assert.equal(a, b);
  assert.ok(avatarPath(a).startsWith("M"));
});

test("Avatar path differs across seeded ids", () => {
  const a = avatarPath(
    renderToStaticMarkup(React.createElement(Avatar, { id: "b-1" })),
  );
  const b = avatarPath(
    renderToStaticMarkup(React.createElement(Avatar, { id: "b-2" })),
  );
  assert.notEqual(a, b);
});

test("health animation class is applied only when health is provided", () => {
  const plain = renderToStaticMarkup(
    React.createElement(Avatar, { id: "b-1" }),
  );
  assert.doesNotMatch(plain, /class="avatar anim-/);
  for (const health of ["green", "yellow", "red"] as const) {
    const marked = renderToStaticMarkup(
      React.createElement(Avatar, { id: "b-1", health }),
    );
    assert.match(marked, new RegExp(`class="avatar anim-${health}"`));
  }
});

test("StatusDot carries the health class and seeded pulse delay", () => {
  const html = renderToStaticMarkup(
    React.createElement(StatusDot, { id: "b-1", health: "red", active: true }),
  );
  assert.match(html, /class="dot red pulse"/);
  assert.match(html, /--dot-delay:-?\d+(\.\d+)?s/);
  const idle = renderToStaticMarkup(
    React.createElement(StatusDot, {
      id: "b-1",
      health: "green",
      active: false,
    }),
  );
  assert.doesNotMatch(idle, /pulse/);
});

test("ShapePreview renders a fixed seeded path per preset", () => {
  const one = renderToStaticMarkup(
    React.createElement(ShapePreview, { preset: 1 }),
  );
  const again = renderToStaticMarkup(
    React.createElement(ShapePreview, { preset: 1 }),
  );
  const other = renderToStaticMarkup(
    React.createElement(ShapePreview, { preset: 2 }),
  );
  assert.equal(one, again);
  assert.notEqual(avatarPath(one), avatarPath(other));
});
