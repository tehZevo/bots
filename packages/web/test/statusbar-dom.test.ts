import assert from "node:assert/strict";
import { document, mount, test } from "./dom-env.ts";

const React = await import("react");
const { StatusBar } = await import("../src/components/StatusBar.tsx");

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
  created_at: Date.now(),
  run_state: "enabled",
  health: "blue",
  status: null,
  status_level: null,
};

async function renderBar(tab: string): Promise<void> {
  await mount(
    React.createElement(StatusBar, {
      bots: [bot],
      paused: false,
      pauseReason: null,
      breaker: null,
      onPauseToggle: () => undefined,
      onStopAll: () => undefined,
      onSearch: () => undefined,
      onOpenInbox: () => undefined,
      onBrandClick: () => undefined,
      tab,
    }),
  );
}

test("the Bots screen does not repeat the wordmark as a page title", async () => {
  await renderBar("bots");
  const text = document.body.textContent ?? "";
  const mentions = (text.match(/Bots/g) ?? []).length;
  assert.equal(mentions, 1, `expected the word once, got: ${text}`);
});

test("other screens still show their page title", async () => {
  await renderBar("inbox");
  const title = document.querySelector(".screentitle");
  assert.ok(title, "expected a page title");
  assert.equal((title.textContent ?? "").includes("Inbox"), true);
});
