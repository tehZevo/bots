import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "bots-test-")),
  "t.db",
);

const {
  describeConnectionFailure,
  describeLlmError,
  isCollapsedConnectionError,
} = await import("../src/llm.ts");

const target = {
  providerName: "Lab",
  baseUrl: "http://llm.example.com:8080/v1",
};

function sdkConnectionError(cause: Record<string, unknown>): Error {
  const err = new Error("Connection error.");
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
}

test("dns failure names the provider, base url and cause", () => {
  const msg = describeLlmError(
    sdkConnectionError({
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND llm.example.com",
    }),
    target,
  );
  assert.match(msg, /Unable to connect to model provider "Lab"/);
  assert.match(msg, /http:\/\/llm\.example\.com:8080\/v1/);
  assert.match(msg, /getaddrinfo ENOTFOUND llm\.example\.com/);
  assert.match(msg, /host could not be resolved/);
});

test("refused, timeout and reset causes are classified", () => {
  assert.match(
    describeLlmError(sdkConnectionError({ code: "ECONNREFUSED" }), target),
    /connection was refused/,
  );
  assert.match(
    describeLlmError(sdkConnectionError({ code: "ETIMEDOUT" }), target),
    /timed out/,
  );
  const aborted = new Error("The operation was aborted");
  aborted.name = "AbortError";
  assert.match(describeLlmError(aborted, target), /timed out/);
  assert.match(
    describeLlmError(sdkConnectionError({ code: "ECONNRESET" }), target),
    /connection was reset/,
  );
});

test("tls failures report the certificate code", () => {
  const msg = describeLlmError(
    sdkConnectionError({
      code: "CERT_HAS_EXPIRED",
      message: "certificate has expired",
    }),
    target,
  );
  assert.match(msg, /TLS handshake failed \(CERT_HAS_EXPIRED\)/);
});

test("http status errors explain auth and rate limits", () => {
  const unauthorized = Object.assign(new Error("Invalid API key"), {
    status: 401,
  });
  assert.match(
    describeLlmError(unauthorized, target),
    /rejected the request: HTTP 401 — check the provider API key/,
  );
  const limited = Object.assign(new Error("Too Many Requests"), {
    status: 429,
  });
  assert.match(describeLlmError(limited, target), /HTTP 429 — rate limited/);
});

test("unrelated errors keep their own message", () => {
  assert.equal(describeLlmError(new Error("boom"), target), "boom");
  assert.equal(describeLlmError("plain", target), "plain");
});

test("credentials never reach the run error", () => {
  const leaky = sdkConnectionError({
    code: "ECONNREFUSED",
    message:
      "connect ECONNREFUSED with key sk-abcdefghijklmnopqrstuvwxyz and Authorization: Bearer zzz999ttt888",
  });
  const msg = describeLlmError(leaky, target);
  assert.ok(!msg.includes("sk-abcdefghijklmnopqrstuvwxyz"));
  assert.ok(!msg.includes("zzz999ttt888"));
  assert.match(msg, /sk-redacted/);
});

test("the sdk's collapsed connection text is recognised", () => {
  assert.equal(isCollapsedConnectionError("Connection error."), true);
  assert.equal(isCollapsedConnectionError("Connection error"), true);
  assert.equal(isCollapsedConnectionError("  Connection error. "), true);
  assert.equal(isCollapsedConnectionError("HTTP 500"), false);
  assert.equal(isCollapsedConnectionError(null), false);
});

test("a probe of an unresolvable host names the provider and reason", async () => {
  const msg = await describeConnectionFailure({
    providerName: "Lab",
    baseUrl: "http://no-such-host.invalid/v1",
  });
  assert.match(msg, /Unable to connect to model provider "Lab"/);
  assert.match(msg, /http:\/\/no-such-host\.invalid\/v1/);
  assert.match(msg, /ENOTFOUND|EAI_AGAIN|could not be resolved/);
});
