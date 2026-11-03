import assert from "node:assert/strict";
import { act, click, document, flush, mount, test, window } from "./dom-env.ts";

const React = await import("react");
const { Multiselect } = await import("../src/components/Multiselect.tsx");

const options = [
  { id: "g1", name: "prod" },
  { id: "g2", name: "experiments" },
];

function picker(extra: Record<string, unknown> = {}) {
  const seen: string[][] = [];
  const created: string[] = [];
  const el = React.createElement(Multiselect, {
    label: "Tag",
    options,
    selected: [],
    onChange: (next: string[]) => seen.push(next),
    ...extra,
  });
  return { el, seen, created };
}

async function typeInto(element: Element | null, value: string): Promise<void> {
  assert.ok(element, "expected input");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await flush();
}

function trigger(): Element {
  const el = document.querySelector(".multiselect .filtertrigger");
  assert.ok(el, "expected a trigger");
  return el;
}

function panel(): Element | null {
  return document.querySelector(".multiselect .filterpanel");
}

function search(): Element | null {
  return document.querySelector('input[aria-label="Search tag"]');
}

test("the dropdown stays closed until its trigger is clicked", async () => {
  const { el } = picker();
  await mount(el);
  assert.equal(panel(), null);
  assert.equal(trigger().textContent, "Tag: All");
  await click(trigger());
  assert.ok(panel());
});

test("the open list offers every option as a checkbox", async () => {
  const { el, seen } = picker();
  await mount(el);
  await click(trigger());
  const boxes = panel()?.querySelectorAll('input[type="checkbox"]');
  assert.equal(boxes?.length, 2);
  await click(boxes?.[0]);
  assert.deepEqual(seen.at(-1), ["g1"]);
});

test("typing narrows the list through state", async () => {
  const { el } = picker();
  await mount(el);
  await click(trigger());
  await typeInto(search(), "prod");
  assert.match(panel()?.textContent ?? "", /prod/);
  assert.doesNotMatch(panel()?.textContent ?? "", /experiments/);
  await typeInto(search(), "");
  assert.match(panel()?.textContent ?? "", /experiments/);
});

test("a non-filterable dropdown shows no search field", async () => {
  const { el } = picker({ filterable: false });
  await mount(el);
  await click(trigger());
  assert.equal(search(), null);
  assert.equal(panel()?.querySelectorAll("input")?.length, 2);
});

test("create is offered only when nothing matches exactly", async () => {
  const { el, created } = picker({
    onCreate: (name: string) => created.push(name),
  });
  await mount(el);
  await click(trigger());
  assert.equal(panel()?.textContent?.includes("+ Create"), false);
  await typeInto(search(), "stag");
  assert.ok(panel()?.textContent?.includes('+ Create "stag"'));
  await click(
    [...(panel()?.querySelectorAll("button") ?? [])].find((b) =>
      b.textContent?.startsWith("+ Create"),
    ),
  );
  assert.deepEqual(created, ["stag"]);
  assert.equal((search() as HTMLInputElement).value, "");
});

test("Enter attaches an exact match instead of creating", async () => {
  const { el, seen, created } = picker({
    onCreate: (name: string) => created.push(name),
  });
  await mount(el);
  await click(trigger());
  await typeInto(search(), "PROD");
  await act(async () => {
    search()?.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await flush();
  assert.deepEqual(created, []);
  assert.deepEqual(seen.at(-1), ["g1"]);
});

test("Escape closes the dropdown", async () => {
  const { el } = picker();
  await mount(el);
  await click(trigger());
  assert.ok(panel());
  await act(async () => {
    document.querySelector(".multiselect")?.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await flush();
  assert.equal(panel(), null);
});

test("a press outside the dropdown closes it", async () => {
  const { el } = picker();
  await mount(el);
  await click(trigger());
  assert.ok(panel());
  await act(async () => {
    document.body.dispatchEvent(
      new window.MouseEvent("pointerdown", { bubbles: true }),
    );
  });
  await flush();
  assert.equal(panel(), null);
});
