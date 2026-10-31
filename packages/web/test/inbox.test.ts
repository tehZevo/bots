import assert from "node:assert/strict";
import { it as test } from "vitest";
import {
  filterInboxItems,
  type InboxItem,
  inboxTimeLabel,
} from "../src/lib/inbox.ts";

function item(over: Partial<InboxItem>): InboxItem {
  return {
    id: over.id ?? "i1",
    kind: over.kind ?? "run_error",
    bot_id: over.bot_id ?? "b1",
    bot_name: over.bot_name ?? "Sable",
    title: "Run failed",
    detail: "boom",
    target_path: "/bots?bot=b1",
    created_at: 1,
    ...over,
  };
}

test("filterInboxItems keeps everything with no selections", () => {
  const items = [item({}), item({ id: "i2", kind: "breaker", bot_id: null })];
  assert.deepEqual(filterInboxItems(items, [], []), items);
});

test("filterInboxItems filters by kind and intersects with bot", () => {
  const items = [
    item({ id: "a" }),
    item({ id: "b", kind: "watchdog" }),
    item({ id: "c", bot_id: "b2" }),
    item({ id: "d", kind: "breaker", bot_id: null }),
  ];
  assert.deepEqual(
    filterInboxItems(items, ["run_error"], []).map((i) => i.id),
    ["a", "c"],
  );
  assert.deepEqual(
    filterInboxItems(items, [], ["b2"]).map((i) => i.id),
    ["c"],
  );
  assert.deepEqual(
    filterInboxItems(items, ["run_error"], ["b1"]).map((i) => i.id),
    ["a"],
  );
});

test("inboxTimeLabel uses relative times today and absolute otherwise", () => {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  assert.match(inboxTimeLabel(now.getTime() - 10_000, now.getTime()), /ago/);
  now.setDate(now.getDate() - 3);
  assert.doesNotMatch(
    inboxTimeLabel(now.getTime(), now.getTime() + 3 * 86_400_000),
    /ago/,
  );
});
