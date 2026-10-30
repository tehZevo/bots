import assert from "node:assert/strict";
import { it as test } from "vitest";
import {
  HEALTH_LABEL,
  HEALTH_ORDER,
  STATUS_CHIPS,
  teamHealth,
} from "../src/lib/health.ts";
import type { Bot } from "../src/types.ts";

function bot(id: string, health: Bot["health"]): Bot {
  return { id, health } as Bot;
}

test("HEALTH_ORDER lists every health level exactly once", () => {
  assert.deepEqual([...HEALTH_ORDER].sort(), [
    "blue",
    "gray",
    "green",
    "red",
    "yellow",
  ]);
});

test("STATUS_CHIPS follow HEALTH_ORDER with mapped labels", () => {
  assert.deepEqual(
    STATUS_CHIPS.map((c) => c.health),
    HEALTH_ORDER,
  );
  for (const chip of STATUS_CHIPS)
    assert.equal(chip.label, HEALTH_LABEL[chip.health]);
});

test("teamHealth ranks worst member health", () => {
  const bots = [bot("b1", "green"), bot("b2", "yellow"), bot("b3", "red")];
  assert.equal(teamHealth([], bots), "gray");
  assert.equal(teamHealth([{ bot_id: "b1" }], bots), "green");
  assert.equal(
    teamHealth([{ bot_id: "b1" }, { bot_id: "b2" }], bots),
    "yellow",
  );
  assert.equal(teamHealth([{ bot_id: "b1" }, { bot_id: "b3" }], bots), "red");
});
