import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { it as test } from "vitest";

const { attachScrollIndicators } = await import("../src/scrollbars.ts");

test("scroll marks the pane active and idling retracts it", async () => {
  const dom = new JSDOM(`<!doctype html><div id="pane"></div>`);
  const doc = dom.window.document;
  globalThis.Element = dom.window.Element as typeof Element;
  const detach = attachScrollIndicators(doc, 30);

  const pane = doc.getElementById("pane");
  assert.ok(pane);
  pane.dispatchEvent(new dom.window.Event("scroll", { bubbles: true }));
  assert.ok(pane.classList.contains("scr-active"));

  await new Promise((r) => setTimeout(r, 60));
  assert.equal(pane.classList.contains("scr-active"), false);
  detach();
});

test("detach stops tracking", () => {
  const dom = new JSDOM(`<!doctype html><div id="pane"></div>`);
  const doc = dom.window.document;
  globalThis.Element = dom.window.Element as typeof Element;
  const detach = attachScrollIndicators(doc, 500);
  detach();

  const pane = doc.getElementById("pane");
  assert.ok(pane);
  pane.dispatchEvent(new dom.window.Event("scroll", { bubbles: true }));
  assert.equal(pane.classList.contains("scr-active"), false);
});
