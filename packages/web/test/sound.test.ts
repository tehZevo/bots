import assert from "node:assert/strict";
import { it as test } from "vitest";
import { playSound, SOUND_LIBRARY } from "../src/lib/sound.ts";

test("SOUND_LIBRARY lists id/label pairs with a default first", () => {
  assert.ok(SOUND_LIBRARY.length > 1);
  for (const [id, label] of SOUND_LIBRARY) {
    assert.ok(id && label);
  }
  assert.equal(SOUND_LIBRARY[0][0], "default");
});

test("playSound skips empty and none ids", () => {
  const srcs: string[] = [];
  const real = globalThis.Audio;
  globalThis.Audio = class {
    constructor(src: string) {
      srcs.push(src);
    }
    volume = 1;
    play() {
      return Promise.resolve();
    }
  } as unknown as typeof globalThis.Audio;
  try {
    playSound("");
    playSound("none");
    assert.deepEqual(srcs, []);
    playSound("ping");
    assert.deepEqual(srcs, ["/sounds/ping.wav"]);
  } finally {
    globalThis.Audio = real;
  }
});

test("playSound survives a rejected playback", () => {
  const real = globalThis.Audio;
  globalThis.Audio = class {
    volume = 1;
    play() {
      return Promise.reject(new Error("blocked"));
    }
  } as unknown as typeof globalThis.Audio;
  try {
    assert.doesNotThrow(() => playSound("bell"));
  } finally {
    globalThis.Audio = real;
  }
});
