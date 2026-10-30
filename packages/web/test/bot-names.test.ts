import assert from "node:assert/strict";
import { it as test } from "vitest";
import { BOT_NAMES, pickBotName } from "../src/lib/botNames.ts";

test("pickBotName returns a name from the pool", () => {
  assert.ok(BOT_NAMES.includes(pickBotName([])));
});

test("pickBotName avoids used names case-insensitively", () => {
  const used = BOT_NAMES.slice(0, BOT_NAMES.length - 1).map((n) =>
    n.toLowerCase(),
  );
  assert.equal(pickBotName(used), BOT_NAMES[BOT_NAMES.length - 1]);
});

test("pickBotName falls back to the full pool when all names are taken", () => {
  const picked = pickBotName(BOT_NAMES);
  assert.ok(BOT_NAMES.includes(picked));
});
