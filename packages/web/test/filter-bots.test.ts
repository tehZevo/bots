import assert from "node:assert/strict";
import { it as test } from "vitest";
import { filterBots, toggleIn } from "../src/lib/filterBots.ts";
import type { Bot } from "../src/types.ts";

function bot(over: Partial<Bot>): Bot {
  return {
    id: Math.random().toString(36).slice(2),
    name: "bot",
    health: "ok",
    ...over,
  } as Bot;
}

const bots = [
  bot({ id: "a", name: "Alpha Scraper", health: "ok" }),
  bot({ id: "b", name: "beta Digest", health: "error", role_id: "r-1" }),
  bot({
    id: "c",
    name: "Gamma Watch",
    health: "paused",
    role_id: "r-2",
    tag_ids: ["t-1"],
  }),
];

const none = { query: "", statuses: [], roleIds: [] };

test("empty selections return every bot", () => {
  assert.deepEqual(
    filterBots(bots, none).map((b) => b.id),
    ["a", "b", "c"],
  );
});

test("query matches name substring case-insensitively and trims", () => {
  assert.deepEqual(
    filterBots(bots, { ...none, query: "  ALPHA " }).map((b) => b.id),
    ["a"],
  );
  assert.deepEqual(
    filterBots(bots, { ...none, query: "digest" }).map((b) => b.id),
    ["b"],
  );
});

test("status selection filters by health", () => {
  assert.deepEqual(
    filterBots(bots, { ...none, statuses: ["ok", "paused"] }).map((b) => b.id),
    ["a", "c"],
  );
});

test("role-less bots match the empty role id", () => {
  const withRole = (ids: string[]) =>
    filterBots(bots, { ...none, roleIds: ids }).map((b) => b.id);
  assert.deepEqual(withRole([""]), ["a"]);
  assert.deepEqual(withRole(["r-1"]), ["b"]);
  assert.deepEqual(withRole(["", "r-1"]), ["a", "b"]);
});

test("tag selection matches any of the bot's tags", () => {
  assert.deepEqual(
    filterBots(bots, { ...none, tagIds: ["t-1"] }).map((b) => b.id),
    ["c"],
  );
  assert.equal(filterBots(bots, { ...none, tagIds: [] }).length, 3);
});

test("selectors combine conjunctively", () => {
  assert.deepEqual(
    filterBots(bots, { query: "watch", statuses: ["paused"], roleIds: [] }).map(
      (b) => b.id,
    ),
    ["c"],
  );
  assert.deepEqual(
    filterBots(bots, { ...none, statuses: ["error"], tagIds: ["t-1"] }),
    [],
  );
});

test("toggleIn adds and removes values", () => {
  assert.deepEqual(toggleIn([], "x"), ["x"]);
  assert.deepEqual(toggleIn(["x", "y"], "x"), ["y"]);
  assert.deepEqual(toggleIn(["x"], "y"), ["x", "y"]);
});
