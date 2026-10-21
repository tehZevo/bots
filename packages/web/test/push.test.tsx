import assert from "node:assert/strict";
import { test } from "node:test";

const { urlBase64ToBuffer, pushSupported } = await import("../src/push.tsx");

test("urlBase64ToBuffer decodes webpush keys", () => {
  const key = Buffer.from([0x04, 0xde, 0xad, 0xbe, 0xef]).toString("base64url");
  assert.deepEqual([...urlBase64ToBuffer(key)], [0x04, 0xde, 0xad, 0xbe, 0xef]);
});

test("push is unsupported outside a browser", () => {
  assert.equal(pushSupported(), false);
});
