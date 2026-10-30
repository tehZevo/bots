import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost/" },
);
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
const { renderToStaticMarkup } = await import("react-dom/server");
const { createRoot } = await import("react-dom/client");
const { Modal, ModalForm } = await import("../src/components/ui/Modal.tsx");
const { SwitchToggle } = await import("../src/components/ui/SwitchToggle.tsx");
const { TabNav } = await import("../src/components/ui/TabNav.tsx");
const { ConfirmDialog } = await import(
  "../src/components/ui/ConfirmDialog.tsx"
);
const act = React.act;

const { useEscape } = await import("../src/components/ui/useEscape.ts");

function EscapeProbe({ onEscape }: { onEscape: () => void }) {
  useEscape(onEscape);
  return React.createElement("span", null, "probe");
}

test("Modal renders scrim plus dialog wrapper and passes attributes through", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      Modal,
      {
        scrimOnCancel: () => undefined,
        scrimLabel: "Close details",
        className: "dialog tabs",
        role: "dialog",
        "aria-label": "bot details",
      },
      React.createElement("p", null, "body"),
    ),
  );
  assert.match(html, /^<div class="modal">/);
  assert.match(
    html,
    /<button type="button" class="mscrim" aria-label="Close details"><\/button>/,
  );
  assert.match(
    html,
    /<div class="dialog tabs" role="dialog" aria-label="bot details">/,
  );
});

test("ModalForm renders a form element with its attributes", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      ModalForm,
      {
        scrimOnCancel: () => undefined,
        className: "dialog narrow",
        role: "dialog",
        "aria-label": "Add bot",
      },
      React.createElement("input", { name: "x" }),
    ),
  );
  assert.match(
    html,
    /<form class="dialog narrow" role="dialog" aria-label="Add bot">/,
  );
});

test("SwitchToggle keeps the original label/knob/state markup", () => {
  const html = renderToStaticMarkup(
    React.createElement(SwitchToggle, {
      ariaLabel: "Bot enabled",
      checked: true,
      stateLabel: "Enabled",
    }),
  );
  assert.match(html, /^<label class="switch">/);
  assert.match(html, /<input type="checkbox" aria-label="Bot enabled"/);
  assert.ok(html.includes('checked=""'));
  assert.match(html, /<span class="knob"><\/span>/);
  assert.match(html, /<span class="state">Enabled<\/span>/);
});

test("SwitchToggle renders a leading title node for labelled switches", () => {
  const html = renderToStaticMarkup(
    React.createElement(SwitchToggle, {
      title: React.createElement(
        "span",
        { id: "secret-values-export-label" },
        "Secret values in export",
      ),
      labelledBy: "secret-values-export-label",
      checked: false,
      stateLabel: "Names only",
    }),
  );
  assert.match(
    html,
    /<label class="switch"><span id="secret-values-export-label">Secret values in export<\/span><input[^>]*aria-labelledby="secret-values-export-label"/,
  );
});

test("TabNav renders mtabs with the selected entry marked", () => {
  const html = renderToStaticMarkup(
    React.createElement(TabNav, {
      tabs: [
        { id: "general", label: "General" },
        { id: "logs", label: "Logs" },
      ],
      selected: "logs",
      onSelect: () => undefined,
      ariaLabel: "Settings sections",
    }),
  );
  assert.match(html, /^<nav class="mtabs" aria-label="Settings sections">/);
  assert.match(html, /<button type="button" class="">General<\/button>/);
  assert.match(html, /<button type="button" class="sel">Logs<\/button>/);
});

test("ConfirmDialog renders alertdialog markup", () => {
  const html = renderToStaticMarkup(
    React.createElement(ConfirmDialog, {
      text: "Delete bot x?",
      confirmLabel: "Delete bot",
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );
  assert.match(html, /class="confirm"/);
  assert.match(html, /role="alertdialog" aria-label="Delete bot x\?"/);
  assert.match(
    html,
    /<button type="button" class="danger">Delete bot<\/button>/,
  );
});

async function mount(
  element: React.ReactElement,
): Promise<ReturnType<typeof createRoot>> {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return root;
}

test("useEscape fires on Escape keydown and detaches on unmount", async () => {
  let escapes = 0;
  const root = await mount(
    React.createElement(EscapeProbe, { onEscape: () => escapes++ }),
  );
  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "a" }));
  });
  assert.equal(escapes, 0);
  await act(async () => {
    document.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape" }),
    );
  });
  assert.equal(escapes, 1);
  await act(async () => root.unmount());
  await act(async () => {
    document.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape" }),
    );
  });
  assert.equal(escapes, 1);
});

test("Modal scrim click invokes scrimOnCancel", async () => {
  let cancelled = 0;
  const root = await mount(
    React.createElement(
      Modal,
      {
        scrimOnCancel: () => cancelled++,
        className: "dialog",
        role: "dialog",
        "aria-label": "thing",
      },
      React.createElement("p", null, "hi"),
    ),
  );
  const scrim = document.querySelector(".modal .mscrim");
  assert.ok(scrim, "expected scrim button");
  await act(async () => {
    (scrim as HTMLElement).click();
  });
  assert.equal(cancelled, 1);
  await act(async () => root.unmount());
});
